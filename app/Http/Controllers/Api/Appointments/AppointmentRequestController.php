<?php

namespace App\Http\Controllers\Api\Appointments;

use App\Http\Controllers\Controller;
use App\Support\ScheduleAvailability;
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

                // Staff see their own school's requests (school and grade scope are
                // pinned to the account by the legacy.session middleware). Students
                // get the same list but see only their own requests in full; see
                // the end of this branch.
                api_require_role(array_merge(api_roles_guidance(), ['student'], api_roles_sdo()));

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

                // Staff reports group appointments by the reason on the referral
                // behind them (referral_reason), not by the appointment's own
                // reason text, which is auto-filled with an ID ("Follow-up for
                // case CS-...", "Intake interview for referral REF-...") and so
                // gave every appointment its own bucket. Not sent to students:
                // the referral reason is what a teacher wrote about them.
                if (api_role() !== 'student' && !empty($rows)) {
                    $this->attach_referral_reasons($conn, $rows, $hasCaseScenarios);
                }

                // A student's schedule page only needs other students' requests to
                // grey out taken time slots: date, time and status. Their names,
                // reasons and notes used to be sent too.
                if (api_role() === 'student') {
                    $ownId = (string) api_user_id();
                    $rows = array_map(function ($r) use ($ownId) {
                        if ((string) $r['student_id'] === $ownId) {
                            return $r;
                        }
                        return [
                            'id' => '',
                            'student_id' => '',
                            'preferred_date' => $r['preferred_date'],
                            'preferred_time' => $r['preferred_time'],
                            'status' => $r['status'],
                        ];
                    }, $rows);
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
                $counselor_id = 0;
                // Ties this appointment back to the case it was booked from (see
                // "Add Counseling Session" — submitAppointments() in counseling.js)
                // so student-history.php can nest it under that case's own
                // counseling-session node — NULL for a plain self-service request.
                $case_uid = trim((string)($payload['case_uid'] ?? ''));
                $case_uid = $case_uid !== '' ? $case_uid : null;

                // Students request for themselves; counselors book a student of
                // their own school straight in (approved). Which of the two this
                // is comes from the logged-in account, never from the request.
                // Coordinators only manage school events; booking and handling
                // students' sessions is the counselor's job.
                api_require_role(array_merge(api_roles_counselor(), ['student']));
                $school = api_school();
                $isStaffInitiated = api_is(api_roles_counselor());
                if ($isStaffInitiated) {
                    $counselor_id = api_user_id();
                    if (!$this->staffMayHandleStudent($conn, (string) $student_id)) {
                        $this->send_json(403, ['success' => false, 'message' => "This student isn't one you handle."]);
                    }
                } else {
                    $student_id = api_user_id();
                    $student_name = api_user_name();
                    // A student's own request is never tied to a counseling case.
                    $case_uid = null;
                }
                $forStudent = !$isStaffInitiated;

                if ($student_id === 0 || $student_name === '' || $preferred_date === '' || $preferred_time === '' || $reason === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
                }
                if ($school === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Your account has no school on file, so appointments cannot be booked.']);
                }

                // Validate date format
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $preferred_date) || strtotime($preferred_date) === false) {
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

                // Only the school-hour slots the pages offer can be booked.
                $slot = ScheduleAvailability::normalizeSlot($preferred_time);
                if ($slot === null) {
                    $this->send_json(400, ['success' => false, 'message' => 'Please pick one of the listed times (8:00 AM to 11:30 AM, or 1:00 PM to 3:30 PM).']);
                }
                $preferred_time = $slot;
                $slotStart = ScheduleAvailability::toMinutes($slot);
                $slotEnd = $slotStart + ScheduleAvailability::SLOT_MINUTES;

                if ($preferred_date === date('Y-m-d') && $slotStart <= ((int) date('G')) * 60 + (int) date('i')) {
                    $this->send_json(400, ['success' => false, 'message' => 'That time has already passed today. Please pick a later time.']);
                }

                $request_id = 'areq_' . bin2hex(random_bytes(8));

                // Appointments a counselor schedules directly (e.g. from a case's
                // "Appoint Students" action) don't need their own approval step;
                // that review is only meaningful for appointments a student
                // requests. Skip straight to 'approved' for staff-initiated ones.
                $initialStatus = $isStaffInitiated ? 'approved' : 'pending';
                $initialCounselorId = $isStaffInitiated ? $counselor_id : 0;
                $initialCounselorNotes = $isStaffInitiated ? 'Scheduled directly by counselor' : '';
                $initialBookingType = $isStaffInitiated ? 'counseling' : 'online';
                // Captured once here, separate from counselor_id, which the PUT
                // handler below overwrites when the request is approved — see
                // ensure_created_by_column(). NULL for a student's own online
                // self-booking.
                $createdById = $isStaffInitiated ? $counselor_id : null;

                // The availability checks and the insert run under one lock per
                // school, so two bookings for the same slot sent at the same
                // moment can't both get through.
                if (!ScheduleAvailability::lock($conn, $school)) {
                    $this->send_json(503, ['success' => false, 'message' => 'The schedule is busy right now. Please try again in a moment.']);
                }
                try {
                    // One session a day per student, however it's booked (Stage 6
                    // follow-up calendar, Appoint Students, or the student's own
                    // online request).
                    $existingTime = $this->student_session_on($conn, $student_id, $preferred_date);
                    if ($existingTime !== null) {
                        $this->send_json(409, ['success' => false, 'conflict' => true, 'message' => $this->one_session_message($student_name, $preferred_date, $existingTime, $forStudent)]);
                    }

                    // The slot itself must be free: no school event over it and
                    // no other student's session in it.
                    $when = ScheduleAvailability::formatTime($slot) . ' on ' . ScheduleAvailability::formatDate($preferred_date);
                    $event = ScheduleAvailability::blockingEvent($conn, $school, $preferred_date, $slotStart, $slotEnd);
                    if ($event !== null) {
                        $title = trim((string) $event['title']) !== '' ? trim((string) $event['title']) : 'a school event';
                        $this->send_json(409, ['success' => false, 'conflict' => true, 'message' => "{$when} is blocked by {$title}. Please choose another time."]);
                    }
                    $taken = ScheduleAvailability::overlappingBooking($conn, $school, $preferred_date, $slotStart, $slotEnd, $isStaffInitiated ? $case_uid : null);
                    if ($taken !== null) {
                        // Students never see who holds a slot, only that it's gone.
                        $message = $forStudent
                            ? "{$when} has already been booked. Please choose another time."
                            : "{$when} is already booked (" . (trim((string) $taken['student_name']) ?: 'another student') . '). Please pick another time.';
                        $this->send_json(409, ['success' => false, 'conflict' => true, 'message' => $message]);
                    }

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
                } finally {
                    ScheduleAvailability::unlock($conn, $school);
                }

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
                $status = strtolower(trim((string)($payload['status'] ?? '')));
                $counselor_notes = trim((string)($payload['counselor_notes'] ?? ''));

                if ($request_id === '' || $status === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
                }

                // A request can only be booked into a free slot (see POST), so
                // there is nothing left to decline or move: the only change a
                // counselor makes to a student's request is approving it.
                // Coordinators don't handle students' sessions.
                api_require_role(api_roles_counselor());
                if ($status !== 'approved') {
                    $this->send_json(400, ['success' => false, 'message' => 'Appointment requests can only be approved. Times are checked when they are booked, so requests no longer need to be declined or moved.']);
                }

                $counselor_id = api_user_id();
                $ownerStmt = $conn->prepare('SELECT student_id, student_name, school_attended, status FROM appointment_requests WHERE request_id = ?');
                $ownerStmt->bind_param('s', $request_id);
                $ownerStmt->execute();
                $owner = $ownerStmt->get_result()->fetch_assoc();
                $ownerStmt->close();
                if (!$owner || !api_same_school($owner['school_attended'] ?? '') || !$this->staffMayHandleStudent($conn, (string) $owner['student_id'])) {
                    $this->send_json(404, ['success' => false, 'message' => 'Request not found']);
                }

                $previousStatus = strtolower((string) ($owner['status'] ?? ''));
                if ($previousStatus === 'approved') {
                    $this->send_json(200, ['success' => true, 'message' => 'This appointment is already approved.']);
                }
                if (in_array($previousStatus, ScheduleAvailability::INACTIVE_STATUSES, true)) {
                    $this->send_json(409, ['success' => false, 'message' => "This request was {$previousStatus} earlier and can no longer be approved."]);
                }

                if ($counselor_notes === '') {
                    $counselor_notes = 'Appointment approved by counselor';
                }
                $stmt = $conn->prepare("UPDATE appointment_requests SET status = 'approved', counselor_id = ?, counselor_notes = ? WHERE request_id = ?");
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $stmt->bind_param('iss', $counselor_id, $counselor_notes, $request_id);
                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Update failed: ' . $stmt->error]);
                }
                $stmt->close();

                notify_appointment_email($conn, $request_id, 'approved');

                $this->send_json(200, ['success' => true, 'message' => 'Appointment approved']);
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

    // A student can only have one session a day. Returns the time of the
    // student's other appointment on $date that's still on (anything but
    // rejected/cancelled), or null when the day is free for them.
    private function student_session_on(mysqli $conn, int $studentId, string $date, string $excludeRequestId = ''): ?string {
        $stmt = $conn->prepare("SELECT preferred_time FROM appointment_requests WHERE student_id = ? AND preferred_date = ? AND request_id <> ? AND LOWER(status) NOT IN ('rejected', 'cancelled') ORDER BY preferred_time ASC LIMIT 1");
        if (!$stmt) {
            return null;
        }
        $stmt->bind_param('iss', $studentId, $date, $excludeRequestId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ? (string) $row['preferred_time'] : null;
    }

    private function one_session_message(string $studentName, string $date, string $time, bool $forStudent): string {
        $when = date('F j, Y', strtotime($date));
        $at = preg_match('/^\d{1,2}:\d{2}/', $time) ? ' at ' . date('g:i A', strtotime($time)) : '';
        if ($forStudent) {
            return "You already have an appointment on {$when}{$at}. Only one session a day is allowed, so please pick another day.";
        }
        $name = trim($studentName) !== '' ? trim($studentName) : 'This student';
        return "{$name} already has a session on {$when}{$at}. A student can only have one session a day.";
    }

    // Adds referral_code and referral_reason (referral.Reason, the teacher
    // form's "; "-separated checklist) to each row. The link is the
    // appointment's case_uid -> counselor_case_scenarios.referral_code, or a
    // referral/case code named in the reason text, for rows that predate the
    // case_uid column. Also fills a missing case_section when the case was
    // only found through the reason text. Both fields are NULL when no
    // referral is behind the appointment (walk-ins, student bookings).
    private function attach_referral_reasons(mysqli $conn, array &$rows, bool $hasCaseScenarios): void {
        $refCodeByRow = [];
        $caseUidByRow = [];
        foreach ($rows as $i => $r) {
            $rows[$i]['referral_code'] = null;
            $rows[$i]['referral_reason'] = null;
            $reasonText = (string)($r['reason'] ?? '');
            if (preg_match('/\bREF-[A-Z0-9]+(?:-[A-Z0-9]+)*/i', $reasonText, $m)) {
                $refCodeByRow[$i] = strtoupper($m[0]);
            }
            $caseUid = trim((string)($r['case_uid'] ?? ''));
            if ($caseUid === '' && preg_match('/\bCS-\d+/i', $reasonText, $m)) {
                $caseUid = $m[0];
            }
            if ($caseUid !== '') {
                $caseUidByRow[$i] = strtoupper($caseUid);
            }
        }

        if ($hasCaseScenarios && !empty($caseUidByRow)) {
            $colResult = $conn->query("SHOW COLUMNS FROM counselor_case_scenarios LIKE 'referral_code'");
            $refCol = ($colResult && $colResult->num_rows > 0) ? 'referral_code' : 'NULL AS referral_code';
            $uids = array_values(array_unique($caseUidByRow));
            $ph = implode(',', array_fill(0, count($uids), '?'));
            $stmt = $conn->prepare("SELECT case_uid, section_name, {$refCol} FROM counselor_case_scenarios WHERE case_uid IN ({$ph})");
            $caseByUid = [];
            if ($stmt) {
                $stmt->bind_param(str_repeat('s', count($uids)), ...$uids);
                if ($stmt->execute()) {
                    $res = $stmt->get_result();
                    while ($c = $res->fetch_assoc()) {
                        $caseByUid[strtoupper((string)$c['case_uid'])] = $c;
                    }
                }
                $stmt->close();
            }
            foreach ($caseUidByRow as $i => $uid) {
                $case = $caseByUid[$uid] ?? null;
                if (!$case) {
                    continue;
                }
                if (empty($rows[$i]['case_section']) && !empty($case['section_name'])) {
                    $rows[$i]['case_section'] = $case['section_name'];
                }
                $caseRef = trim((string)($case['referral_code'] ?? ''));
                if (!isset($refCodeByRow[$i]) && $caseRef !== '') {
                    $refCodeByRow[$i] = strtoupper($caseRef);
                }
            }
        }

        if (empty($refCodeByRow) || !$this->table_exists($conn, 'referral')) {
            return;
        }
        $codes = array_values(array_unique($refCodeByRow));
        $ph = implode(',', array_fill(0, count($codes), '?'));
        $stmt = $conn->prepare("SELECT referral_code, Reason FROM referral WHERE referral_code IN ({$ph})");
        if (!$stmt) {
            return;
        }
        $reasonByCode = [];
        $stmt->bind_param(str_repeat('s', count($codes)), ...$codes);
        if ($stmt->execute()) {
            $res = $stmt->get_result();
            while ($ref = $res->fetch_assoc()) {
                $reasonByCode[strtoupper((string)$ref['referral_code'])] = trim((string)($ref['Reason'] ?? ''));
            }
        }
        $stmt->close();
        foreach ($refCodeByRow as $i => $code) {
            if (!array_key_exists($code, $reasonByCode)) {
                continue;
            }
            $rows[$i]['referral_code'] = $code;
            $rows[$i]['referral_reason'] = $reasonByCode[$code] !== '' ? $reasonByCode[$code] : null;
        }
    }

    // Same rule as the request list: the student is at the caller's school,
    // and inside a grade-scoped counselor's grades, except a student whose
    // grade isn't recorded yet (the list fails open on those too, so their
    // requests don't get stuck with nobody able to handle them).
    private function staffMayHandleStudent(mysqli $conn, string $studentId): bool {
        $stmt = $conn->prepare('SELECT u.school_attended, s.Grade FROM users_tables u LEFT JOIN student_table s ON s.AccountID = u.AccountID WHERE u.AccountID = ?');
        $stmt->bind_param('s', $studentId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row || !api_same_school($row['school_attended'] ?? '')) {
            return false;
        }
        $grade = trim((string) ($row['Grade'] ?? ''));
        return $grade === '' || api_grade_ok($conn, $grade);
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
