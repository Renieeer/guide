<?php

namespace App\Http\Controllers\Api\Appointments;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use Throwable;

class AppointmentRequestController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensure_appointment_request_table($conn);

            $method = $_SERVER['REQUEST_METHOD'];

            if ($method === 'GET') {
                $school = trim((string)($_GET['school'] ?? ''));
                $role = trim((string)($_GET['role'] ?? ''));

                // Appointments made from a counseling case's "Appoint Students" action
                // carry that case's case_uid — case_section pulls the Case Section
                // chosen when that case was created (counselor_case_scenarios.section_name)
                // so reports can group these by the actual counseling classification
                // instead of the auto-filled "Follow-up for case CS-..." reason text.
                // NULL for walk-ins/appointments never linked to a case.
                $hasCaseScenarios = $this->table_exists($conn, 'counselor_case_scenarios');
                $caseSectionSelect = $hasCaseScenarios ? 'ccs.section_name AS case_section' : 'NULL AS case_section';
                $caseScenariosJoin = $hasCaseScenarios ? 'LEFT JOIN counselor_case_scenarios ccs ON ccs.case_uid = ar.case_uid' : '';

                // Resolves created_by_id (see ensure_created_by_column above) to a
                // display name for the "Scheduled By" report column — joined here
                // rather than looked up client-side since appointment_requests only
                // stores the AccountID, not a name.
                $hasUsersTable = $this->table_exists($conn, 'users_tables');
                $scheduledBySelect = $hasUsersTable ? "TRIM(CONCAT(cb.First_name, ' ', cb.Last_name)) AS scheduled_by_name" : 'NULL AS scheduled_by_name';
                $createdByJoin = $hasUsersTable ? 'LEFT JOIN users_tables cb ON cb.AccountID = ar.created_by_id' : '';

                $sql = "SELECT
                    ar.request_id AS id,
                    ar.student_id,
                    ar.student_name,
                    ar.preferred_date,
                    ar.preferred_time,
                    ar.reason,
                    ar.notes,
                    ar.school_attended,
                    ar.status,
                    ar.counselor_id,
                    ar.counselor_notes,
                    ar.booking_type,
                    ar.case_uid,
                    {$caseSectionSelect},
                    {$scheduledBySelect},
                    ar.created_at,
                    ar.updated_at
                FROM appointment_requests ar
                {$caseScenariosJoin}
                {$createdByJoin}
                WHERE 1=1";
                $types = '';
                $params = [];

                if ($school !== '') {
                    $sql .= " AND ar.school_attended = ?";
                    $types .= 's';
                    $params[] = $school;
                }

                $sql .= " ORDER BY ar.preferred_date ASC, ar.preferred_time ASC";

                $stmt = $conn->prepare($sql);
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }

                if ($types !== '') {
                    $stmt->bind_param($types, ...$params);
                }

                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
                }

                $result = $stmt->get_result();
                $rows = [];
                while ($row = $result->fetch_assoc()) {
                    $rows[] = $row;
                }
                $stmt->close();

                // Appointments reference a student_id rather than storing a grade
                // directly, so it's resolved with a small batch lookup against
                // student_table instead of reworking this query. Attached to every
                // row (as `grade`) unconditionally now — reports (analytics.js's
                // appointment PDF export) need it even when no grade-scope filter
                // is active, not just for the filtering below.
                $studentGradeById = [];
                if (!empty($rows)) {
                    $studentIds = array_values(array_unique(array_map(
                        fn($r) => (string)$r['student_id'],
                        $rows
                    )));
                    $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
                    $gradeStmt = $conn->prepare("SELECT StudentId, Grade FROM student_table WHERE StudentId IN ({$placeholders})");
                    if ($gradeStmt) {
                        $gradeStmt->bind_param(str_repeat('s', count($studentIds)), ...$studentIds);
                        if ($gradeStmt->execute()) {
                            $gradeResult = $gradeStmt->get_result();
                            while ($gradeRow = $gradeResult->fetch_assoc()) {
                                $studentGradeById[(string)$gradeRow['StudentId']] = $gradeRow['Grade'];
                            }
                        }
                        $gradeStmt->close();
                    }

                    foreach ($rows as &$row) {
                        $row['grade'] = $studentGradeById[(string)$row['student_id']] ?? null;
                    }
                    unset($row);
                }

                // Grade-scope filter — reuses $studentGradeById above rather than a
                // second lookup.
                $gradeScope = grade_scope_to_list($_GET['grade_scope'] ?? '');
                if (!empty($gradeScope) && !empty($rows)) {
                    ensureSchoolsTable($conn);
                    $isElementary = school_is_elementary($conn, $school);
                    $rows = array_values(array_filter($rows, function ($r) use ($gradeScope, $isElementary) {
                        $studentGrade = $r['grade'];
                        // A student whose Grade hasn't been recorded yet (e.g. an
                        // incomplete "My Information" profile) would otherwise
                        // silently vanish from every grade-scoped counselor's view —
                        // the student sees "submitted", the counselor never sees it,
                        // with no error anywhere. Fail open on an unknown grade: a
                        // request the student is actively waiting on shouldn't
                        // disappear over a data-completeness gap.
                        if ($studentGrade === null || trim((string)$studentGrade) === '') {
                            return true;
                        }
                        return grade_matches_scope($studentGrade, $gradeScope, $isElementary);
                    }));
                }

                $this->send_json(200, ['success' => true, 'data' => $rows]);
            }

            if ($method === 'POST') {
                $raw = file_get_contents('php://input');
                $payload = json_decode($raw, true);

                if (!is_array($payload)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
                }

                $student_id = (int)($payload['student_id'] ?? 0);
                $student_name = trim((string)($payload['student_name'] ?? ''));
                $preferred_date = trim((string)($payload['preferred_date'] ?? ''));
                $preferred_time = trim((string)($payload['preferred_time'] ?? ''));
                $reason = trim((string)($payload['reason'] ?? ''));
                $notes = trim((string)($payload['notes'] ?? ''));
                $school = trim((string)($payload['school'] ?? ''));
                $role = trim((string)($payload['role'] ?? ''));
                $counselor_id = (int)($payload['counselor_id'] ?? 0);
                // Ties this appointment back to the case it was booked from (see
                // "Add Counseling Session" — submitAppointments() in counseling.js)
                // so student-history.php can nest it under that case's own
                // counseling-session node — NULL for a plain self-service request.
                $case_uid = trim((string)($payload['case_uid'] ?? ''));
                $case_uid = $case_uid !== '' ? $case_uid : null;

                if ($student_id === 0 || $student_name === '' || $preferred_date === '' || $preferred_time === '' || $reason === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
                }

                // Validate date format
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $preferred_date)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid date format. Use YYYY-MM-DD']);
                }

                // Reject past dates - enforced server-side too, not just in the UI,
                // since the client-side check can be bypassed.
                if ($preferred_date < date('Y-m-d')) {
                    $this->send_json(400, ['success' => false, 'message' => 'You cannot request an appointment for a date that has already passed.']);
                }

                // Reject weekends - same reasoning, the UI check alone isn't enough.
                $dayOfWeek = (int)date('N', strtotime($preferred_date)); // 6 = Saturday, 7 = Sunday
                if ($dayOfWeek >= 6) {
                    $this->send_json(400, ['success' => false, 'message' => 'Weekends are not available for appointments. Please select a weekday.']);
                }

                $request_id = 'areq_' . bin2hex(random_bytes(8));

                // Appointments a counselor/coordinator schedules directly (e.g. from
                // a case's "Appoint Students" action) don't need their own approval
                // step — that review is only meaningful for appointments a student
                // requests. Skip straight to 'approved' for staff-initiated ones.
                $isStaffInitiated = $this->is_counselor_or_coordinator($role);
                $initialStatus = $isStaffInitiated ? 'approved' : 'pending';
                $initialCounselorId = $isStaffInitiated ? $counselor_id : 0;
                $initialCounselorNotes = $isStaffInitiated ? 'Scheduled directly by counselor' : '';
                $initialBookingType = $isStaffInitiated ? 'counseling' : 'online';
                // Captured once here, separate from counselor_id, which the PUT
                // handler below overwrites on every later status change — see
                // ensure_created_by_column(). NULL for a student's own online
                // self-booking.
                $createdById = $isStaffInitiated ? $counselor_id : null;

                $sql = "
            INSERT INTO appointment_requests (
                request_id, student_id, student_name, preferred_date, preferred_time, reason, notes, school_attended, status, counselor_id, counselor_notes, booking_type, case_uid, created_by_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ";

                $stmt = $conn->prepare($sql);
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }

                $stmt->bind_param(
                    'sisssssssisssi',
                    $request_id,
                    $student_id,
                    $student_name,
                    $preferred_date,
                    $preferred_time,
                    $reason,
                    $notes,
                    $school,
                    $initialStatus,
                    $initialCounselorId,
                    $initialCounselorNotes,
                    $initialBookingType,
                    $case_uid,
                    $createdById
                );

                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Failed to save request: ' . $stmt->error]);
                }

                $stmt->close();

                // Best-effort — a mail failure must never block the appointment
                // request itself, which has already been saved successfully above.
                notify_appointment_email($conn, $request_id, $isStaffInitiated ? 'approved' : 'submitted');

                $this->send_json(201, [
                    'success' => true,
                    'message' => $isStaffInitiated ? 'Appointment scheduled successfully' : 'Appointment request submitted successfully',
                    'data' => [
                        'request_id' => $request_id,
                        'student_id' => $student_id,
                        'student_name' => $student_name,
                        'preferred_date' => $preferred_date,
                        'preferred_time' => $preferred_time,
                        'reason' => $reason,
                        'status' => $initialStatus
                    ]
                ]);
            }

            if ($method === 'PUT') {
                $raw = file_get_contents('php://input');
                $payload = json_decode($raw, true);

                if (!is_array($payload)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
                }

                $request_id = trim((string)($payload['id'] ?? ''));
                $status = trim((string)($payload['status'] ?? ''));
                $counselor_id = (int)($payload['counselor_id'] ?? 0);
                $counselor_notes = trim((string)($payload['counselor_notes'] ?? ''));
                // Optional — only sent by "Propose New Time" (status=proposed_change).
                // Approve/reject calls omit these, so the columns are left untouched.
                $preferred_date = trim((string)($payload['preferred_date'] ?? ''));
                $preferred_time = trim((string)($payload['preferred_time'] ?? ''));

                if ($request_id === '' || $status === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
                }

                $previousStatusStmt = $conn->prepare("SELECT status FROM appointment_requests WHERE request_id = ?");
                $previousStatusStmt->bind_param('s', $request_id);
                $previousStatusStmt->execute();
                $previousStatusRow = $previousStatusStmt->get_result()->fetch_assoc();
                $previousStatusStmt->close();
                $previousStatus = $previousStatusRow['status'] ?? null;

                $sql = "UPDATE appointment_requests SET status = ?, counselor_id = ?, counselor_notes = ?";
                $types = 'sis';
                $params = [$status, $counselor_id, $counselor_notes];

                if ($preferred_date !== '') {
                    $sql .= ", preferred_date = ?";
                    $types .= 's';
                    $params[] = $preferred_date;
                }
                if ($preferred_time !== '') {
                    $sql .= ", preferred_time = ?";
                    $types .= 's';
                    $params[] = $preferred_time;
                }

                $sql .= " WHERE request_id = ?";
                $types .= 's';
                $params[] = $request_id;

                $stmt = $conn->prepare($sql);
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }

                $stmt->bind_param($types, ...$params);

                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Update failed: ' . $stmt->error]);
                }

                $stmt->close();

                // Only notify on an actual status transition, not a notes-only
                // re-save that happens to resend the same status.
                if ($previousStatus !== null && $previousStatus !== $status) {
                    notify_appointment_email($conn, $request_id, $status);
                }

                $this->send_json(200, ['success' => true, 'message' => 'Request updated successfully']);
            }

            $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
            $this->send_json(500, ['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
        }
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    private function table_exists(mysqli $conn, string $tableName): bool {
        $escaped = $conn->real_escape_string($tableName);
        $result = $conn->query("SHOW TABLES LIKE '{$escaped}'");
        return $result && $result->num_rows > 0;
    }

    private function is_counselor_or_coordinator(string $role): bool {
        $normalized = strtolower(trim($role));
        if ($normalized === '') {
            return false;
        }
        if (in_array($normalized, ['coordinator', 'counselor', 'counselor-and-coordinator'], true)) {
            return true;
        }
        return strpos($normalized, 'coordinator') !== false || strpos($normalized, 'counselor') !== false;
    }

    private function ensure_appointment_request_table(mysqli $conn): void {
        $sql = "
        CREATE TABLE IF NOT EXISTS appointment_requests (
            request_id VARCHAR(64) NOT NULL,
            student_id INT NOT NULL,
            student_name VARCHAR(255) NOT NULL,
            preferred_date DATE NOT NULL,
            preferred_time VARCHAR(20) NOT NULL,
            reason VARCHAR(255) NOT NULL,
            notes TEXT,
            school_attended VARCHAR(100),
            status VARCHAR(45) DEFAULT 'pending',
            counselor_id INT,
            counselor_notes TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (request_id),
            INDEX idx_student (student_id),
            INDEX idx_status (status),
            INDEX idx_date (preferred_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ";

        if (!$conn->query($sql)) {
            $this->send_json(500, [
                'success' => false,
                'message' => 'Failed to initialize appointment requests table: ' . $conn->error
            ]);
        }

        $this->ensure_booking_type_column($conn);
        $this->ensure_appointment_case_uid_column($conn);
        $this->ensure_created_by_column($conn);
    }

    // booking_type records whether this was a staff-initiated ("counseling",
    // booked directly by a counselor/coordinator via a case's "Appoint
    // Students" action) or student-initiated ("online", self-booked) request
    // — set once at INSERT and never touched again. Replaces an older,
    // fragile convention (several pages/*/schedule.js files re-derived this
    // from counselor_notes === 'Scheduled directly by counselor', which broke
    // as soon as that column was overwritten by a later status update).
    private function ensure_booking_type_column(mysqli $conn): void {
        static $checked = false;
        if ($checked) {
            return;
        }
        $checked = true;

        $result = $conn->query("SHOW COLUMNS FROM appointment_requests LIKE 'booking_type'");
        if ($result && $result->num_rows > 0) {
            return;
        }

        $conn->query("ALTER TABLE appointment_requests ADD COLUMN booking_type VARCHAR(20) NOT NULL DEFAULT 'online'");
        // One-time backfill for rows that predate this column, using the same
        // heuristic the UI already relied on.
        $conn->query("UPDATE appointment_requests SET booking_type = 'counseling' WHERE counselor_notes = 'Scheduled directly by counselor'");
    }

    // Links an appointment back to the counselor_case_scenarios.case_uid it was
    // booked from (see "Add Counseling Session" — submitAppointments() in
    // counseling.js), so the student-history timeline can nest it under that
    // case's own counseling-session node instead of showing it a second time as
    // an unrelated standalone entry. NULL for an appointment nobody booked from
    // a case (e.g. a student's own self-service request).
    private function ensure_appointment_case_uid_column(mysqli $conn): void {
        static $checked = false;
        if ($checked) {
            return;
        }
        $checked = true;

        $result = $conn->query("SHOW COLUMNS FROM appointment_requests LIKE 'case_uid'");
        if ($result && $result->num_rows > 0) {
            return;
        }

        $conn->query("ALTER TABLE appointment_requests ADD COLUMN case_uid VARCHAR(45) DEFAULT NULL");
        $conn->query("ALTER TABLE appointment_requests ADD INDEX idx_case_uid (case_uid)");
    }

    // Records who originally created a staff-scheduled appointment — set once at
    // INSERT and never touched again, unlike counselor_id, which gets
    // overwritten on every later approve/reject/reschedule (see the PUT
    // handler below) and therefore only reflects who most recently acted on the
    // request, not who booked it. Reports need "Scheduled By" to stay accurate
    // even after a different counselor later processes the same appointment.
    // NULL for a student's own online self-booking (nobody on staff scheduled
    // it) and for any row that predates this column.
    private function ensure_created_by_column(mysqli $conn): void {
        static $checked = false;
        if ($checked) {
            return;
        }
        $checked = true;

        $result = $conn->query("SHOW COLUMNS FROM appointment_requests LIKE 'created_by_id'");
        if ($result && $result->num_rows > 0) {
            return;
        }

        $conn->query("ALTER TABLE appointment_requests ADD COLUMN created_by_id INT DEFAULT NULL");
    }
}
