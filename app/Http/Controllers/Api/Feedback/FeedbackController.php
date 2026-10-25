<?php

namespace App\Http\Controllers\Api\Feedback;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use Throwable;

class FeedbackController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensure_feedback_table($conn);
            $this->ensure_feedback_messages_table($conn);
            $method = $_SERVER['REQUEST_METHOD'];

            if ($method === 'GET') {
                $action = trim((string)($_GET['action'] ?? ''));

                if ($action === 'staff_list') {
                    $school = trim((string)($_GET['school'] ?? ''));
                    if ($school === '') {
                        $this->send_json(400, ['success' => false, 'message' => 'school is required']);
                    }

                    // LEFT JOIN so a thread with zero replies still appears
                    // (reply_count = 0), sorted by last activity (not created_at)
                    // so actively-going conversations bubble to the top like a
                    // real inbox. The two correlated subqueries pull the most
                    // recent message's text/sender for the conversation-list
                    // preview (Messenger-style: preview shows the latest message,
                    // not always the opening one) — cheap at this scale since it's
                    // already scoped to one school.
                    $stmt = $conn->prepare('
                SELECT f.feedback_id AS id, f.student_account_id, f.student_name, f.school_attended,
                       f.subject_type, f.subject_id, f.subject_label, f.feedback_type, f.message,
                       f.status, f.created_at, f.updated_at,
                       COUNT(fm.message_id) AS reply_count,
                       COALESCE(MAX(fm.created_at), f.created_at) AS last_activity_at,
                       (SELECT fm2.message FROM feedback_messages fm2 WHERE fm2.feedback_id = f.feedback_id ORDER BY fm2.created_at DESC, fm2.message_id DESC LIMIT 1) AS last_message,
                       (SELECT fm2.sender_role FROM feedback_messages fm2 WHERE fm2.feedback_id = f.feedback_id ORDER BY fm2.created_at DESC, fm2.message_id DESC LIMIT 1) AS last_sender_role
                FROM feedback f
                LEFT JOIN feedback_messages fm ON fm.feedback_id = f.feedback_id
                WHERE f.school_attended = ?
                GROUP BY f.feedback_id
                ORDER BY last_activity_at DESC
            ');
                    if (!$stmt) {
                        $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                    }
                    $stmt->bind_param('s', $school);
                    if (!$stmt->execute()) {
                        $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
                    }
                    $result = $stmt->get_result();
                    $rows = [];
                    while ($row = $result->fetch_assoc()) {
                        $rows[] = $row;
                    }
                    $stmt->close();

                    $this->send_json(200, ['success' => true, 'data' => $rows]);
                }

                $studentId = trim((string)($_GET['student_id'] ?? ''));

                if ($studentId === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'student_id is required']);
                }

                if ($action === 'options') {
                    $school = trim((string)($_GET['school'] ?? ''));

                    // Counseling cases this student appears in — a LIKE prefilter
                    // avoids scanning every row's JSON in PHP, then a PHP-side
                    // confirm loop so a substring hit (e.g. "18" inside "180")
                    // can't leak another student's case. Same pattern as
                    // api/student-history.php.
                    $counselingCases = [];
                    $needle = '"id":"' . $studentId . '"';
                    $stmt = $conn->prepare("SELECT case_uid, case_title, case_date, status, students_json, counselor_id, counselor_name FROM counselor_case_scenarios WHERE students_json LIKE CONCAT('%', ?, '%') ORDER BY case_date DESC");
                    if ($stmt) {
                        $stmt->bind_param('s', $needle);
                        if ($stmt->execute()) {
                            $result = $stmt->get_result();
                            while ($row = $result->fetch_assoc()) {
                                $studentsArr = json_decode((string)($row['students_json'] ?? '[]'), true) ?: [];
                                $matched = false;
                                foreach ($studentsArr as $s) {
                                    if ((string)($s['id'] ?? '') === $studentId) {
                                        $matched = true;
                                        break;
                                    }
                                }
                                if (!$matched) {
                                    continue;
                                }
                                $counselingCases[] = [
                                    'subject_id' => $row['case_uid'],
                                    'label' => $this->format_case_label($row),
                                    'status' => $row['status'] ?? '',
                                    // Who actually handled this case — see
                                    // pages/student/feedback.js's rating picker,
                                    // which needs this to attribute a rating to a
                                    // real counselor instead of just a subject label.
                                    'counselor_id' => $row['counselor_id'] ?? '',
                                    'counselor_name' => $row['counselor_name'] ?? ''
                                ];
                            }
                        }
                        $stmt->close();
                    }

                    // Appointments — dual candidate IDs, see
                    // resolve_appointment_candidate_ids().
                    $appointments = [];
                    $candidateIds = $this->resolve_appointment_candidate_ids($conn, $studentId);
                    if (!empty($candidateIds)) {
                        $placeholders = implode(',', array_fill(0, count($candidateIds), '?'));
                        $stmt = $conn->prepare("SELECT request_id, reason, preferred_date, preferred_time, status FROM appointment_requests WHERE student_id IN ($placeholders) ORDER BY preferred_date DESC, preferred_time DESC");
                        if ($stmt) {
                            $stmt->bind_param(str_repeat('i', count($candidateIds)), ...$candidateIds);
                            if ($stmt->execute()) {
                                $result = $stmt->get_result();
                                while ($row = $result->fetch_assoc()) {
                                    $appointments[] = [
                                        'subject_id' => $row['request_id'],
                                        'label' => $this->format_appointment_label($row),
                                        'status' => $row['status'] ?? ''
                                    ];
                                }
                            }
                            $stmt->close();
                        }
                    }

                    // Calendar events — school-wide, not per-student.
                    $events = [];
                    if ($school !== '') {
                        $stmt = $conn->prepare('SELECT event_id, title, event_type, start_date FROM schedule_events WHERE school_attended = ? ORDER BY start_date DESC');
                        if ($stmt) {
                            $stmt->bind_param('s', $school);
                            if ($stmt->execute()) {
                                $result = $stmt->get_result();
                                while ($row = $result->fetch_assoc()) {
                                    $events[] = [
                                        'subject_id' => $row['event_id'],
                                        'label' => $this->format_event_label($row)
                                    ];
                                }
                            }
                            $stmt->close();
                        }
                    }

                    $this->send_json(200, [
                        'success' => true,
                        'data' => [
                            'counseling_cases' => $counselingCases,
                            'appointments' => $appointments,
                            'events' => $events
                        ]
                    ]);
                }

                if ($action === 'list') {
                    $studentIdInt = (int)$studentId;
                    // Same last-message preview + reply_count shape as the staff
                    // ?action=staff_list query, for the same Messenger-style
                    // conversation list on the student side.
                    $stmt = $conn->prepare('
                SELECT f.feedback_id AS id, f.subject_type, f.subject_id, f.subject_label, f.feedback_type,
                       f.message, f.status, f.created_at, f.updated_at,
                       COUNT(fm.message_id) AS reply_count,
                       COALESCE(MAX(fm.created_at), f.created_at) AS last_activity_at,
                       (SELECT fm2.message FROM feedback_messages fm2 WHERE fm2.feedback_id = f.feedback_id ORDER BY fm2.created_at DESC, fm2.message_id DESC LIMIT 1) AS last_message,
                       (SELECT fm2.sender_role FROM feedback_messages fm2 WHERE fm2.feedback_id = f.feedback_id ORDER BY fm2.created_at DESC, fm2.message_id DESC LIMIT 1) AS last_sender_role
                FROM feedback f
                LEFT JOIN feedback_messages fm ON fm.feedback_id = f.feedback_id
                WHERE f.student_account_id = ?
                GROUP BY f.feedback_id
                ORDER BY last_activity_at DESC
            ');
                    if (!$stmt) {
                        $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                    }
                    $stmt->bind_param('i', $studentIdInt);
                    if (!$stmt->execute()) {
                        $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
                    }
                    $result = $stmt->get_result();
                    $rows = [];
                    while ($row = $result->fetch_assoc()) {
                        $rows[] = $row;
                    }
                    $stmt->close();

                    $this->send_json(200, ['success' => true, 'data' => $rows]);
                }

                $this->send_json(400, ['success' => false, 'message' => 'Unknown action']);
            }

            if ($method === 'POST') {
                $raw = file_get_contents('php://input');
                $payload = json_decode($raw, true);
                if (!is_array($payload)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
                }

                $studentId = trim((string)($payload['student_id'] ?? ''));
                $studentName = trim((string)($payload['student_name'] ?? ''));
                $school = trim((string)($payload['school'] ?? ''));
                $subjectType = trim((string)($payload['subject_type'] ?? ''));
                $subjectId = trim((string)($payload['subject_id'] ?? ''));
                $feedbackType = trim((string)($payload['feedback_type'] ?? ''));
                $message = trim((string)($payload['message'] ?? ''));

                if ($studentId === '' || $studentName === '' || $subjectType === '' || $subjectId === '' || $message === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
                }

                if (!in_array($feedbackType, ['Positive', 'Suggestion', 'Concern', 'Other'], true)) {
                    $feedbackType = 'Other';
                }

                // subject_label is always computed here from the real row, never
                // accepted from the client — this is also where ownership is
                // enforced: a student can only give feedback about a counseling
                // case/appointment/event they're actually part of.
                if ($subjectType === 'counseling_case') {
                    $found = $this->find_counseling_case($conn, $subjectId, $studentId);
                    if (!$found) {
                        $this->send_json(403, ['success' => false, 'message' => "This counseling session doesn't exist or you weren't part of it."]);
                    }
                } elseif ($subjectType === 'appointment') {
                    $found = $this->find_appointment($conn, $subjectId, $studentId);
                    if (!$found) {
                        $this->send_json(403, ['success' => false, 'message' => "This appointment doesn't exist or isn't yours."]);
                    }
                } elseif ($subjectType === 'event') {
                    // Resolve the student's own school server-side — never trust
                    // the client-posted "school" for this authorization check.
                    $studentSchool = '';
                    $schoolStmt = $conn->prepare('SELECT school_attended FROM users_tables WHERE AccountID = ?');
                    if ($schoolStmt) {
                        $studentIdInt = (int)$studentId;
                        $schoolStmt->bind_param('i', $studentIdInt);
                        if ($schoolStmt->execute()) {
                            $schoolRow = $schoolStmt->get_result()->fetch_assoc();
                            $studentSchool = $schoolRow['school_attended'] ?? '';
                        }
                        $schoolStmt->close();
                    }
                    $found = $this->find_event($conn, $subjectId, $studentSchool);
                    if (!$found) {
                        $this->send_json(403, ['success' => false, 'message' => "This event doesn't exist or isn't for your school."]);
                    }
                } else {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid subject_type']);
                }

                $subjectLabel = $found['label'];
                $feedbackId = 'fb_' . bin2hex(random_bytes(8));
                $studentIdInt = (int)$studentId;

                $stmt = $conn->prepare('
            INSERT INTO feedback (feedback_id, student_account_id, student_name, school_attended, subject_type, subject_id, subject_label, feedback_type, message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $types = ''
                    . 's'  // feedback_id
                    . 'i'  // student_account_id
                    . 's'  // student_name
                    . 's'  // school_attended
                    . 's'  // subject_type
                    . 's'  // subject_id
                    . 's'  // subject_label
                    . 's'  // feedback_type
                    . 's'; // message
                $stmt->bind_param(
                    $types,
                    $feedbackId,
                    $studentIdInt,
                    $studentName,
                    $school,
                    $subjectType,
                    $subjectId,
                    $subjectLabel,
                    $feedbackType,
                    $message
                );
                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Failed to save feedback: ' . $stmt->error]);
                }
                $stmt->close();

                $this->send_json(201, [
                    'success' => true,
                    'message' => 'Feedback submitted successfully',
                    'data' => [
                        'id' => $feedbackId,
                        'subject_type' => $subjectType,
                        'subject_id' => $subjectId,
                        'subject_label' => $subjectLabel,
                        'feedback_type' => $feedbackType,
                        'message' => $message,
                        'status' => 'new'
                    ]
                ]);
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

    private function ensure_feedback_table(mysqli $conn): void {
        $sql = "
        CREATE TABLE IF NOT EXISTS feedback (
            feedback_id VARCHAR(64) NOT NULL,
            student_account_id INT NOT NULL,
            student_name VARCHAR(255) NOT NULL,
            school_attended VARCHAR(100) DEFAULT NULL,
            subject_type VARCHAR(30) NOT NULL,
            subject_id VARCHAR(64) NOT NULL,
            subject_label VARCHAR(255) NOT NULL,
            feedback_type VARCHAR(30) NOT NULL DEFAULT 'Other',
            message TEXT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'new',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (feedback_id),
            INDEX idx_student (student_account_id),
            INDEX idx_subject (subject_type, subject_id),
            INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";

        if (!$conn->query($sql)) {
            $this->send_json(500, [
                'success' => false,
                'message' => 'Failed to initialize feedback table: ' . $conn->error
            ]);
        }
    }

    private function ensure_feedback_messages_table(mysqli $conn): void {
        $sql = "
        CREATE TABLE IF NOT EXISTS feedback_messages (
            message_id INT NOT NULL AUTO_INCREMENT,
            feedback_id VARCHAR(64) NOT NULL,
            sender_role VARCHAR(30) NOT NULL,
            sender_account_id INT NOT NULL,
            sender_name VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (message_id),
            KEY idx_feedback_id (feedback_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";

        if (!$conn->query($sql)) {
            $this->send_json(500, [
                'success' => false,
                'message' => 'Failed to initialize feedback_messages table: ' . $conn->error
            ]);
        }
    }

    private function format_case_label(array $row): string {
        $label = trim((string)($row['case_title'] ?? '')) ?: 'Counseling session';
        if (!empty($row['case_date'])) {
            $label .= ' — ' . date('M j, Y', strtotime($row['case_date']));
        }
        return $label;
    }

    private function format_appointment_label(array $row): string {
        $label = trim((string)($row['reason'] ?? '')) ?: 'Appointment';
        if (!empty($row['preferred_date'])) {
            $label .= ' — ' . date('M j, Y', strtotime($row['preferred_date']));
            if (!empty($row['preferred_time'])) {
                $label .= ' ' . $row['preferred_time'];
            }
        }
        return $label;
    }

    private function format_event_label(array $row): string {
        $label = trim((string)($row['title'] ?? '')) ?: 'Calendar event';
        if (!empty($row['event_type']) && $row['event_type'] !== 'None') {
            $label .= ' (' . $row['event_type'] . ')';
        }
        if (!empty($row['start_date'])) {
            $label .= ' — ' . date('M j, Y', strtotime($row['start_date']));
        }
        return $label;
    }

    // appointment_requests.student_id is populated from two different flows
    // that don't agree on what identifies a student: the self-service student
    // portal sends users_tables.AccountID, while a counselor's "Appoint
    // Students" case action sends the case's embedded student_table.StudentId.
    // Both must be checked — see api/student-history.php for the same pattern.
    private function resolve_appointment_candidate_ids(mysqli $conn, string $accountId): array {
        $candidateIds = [];
        if (ctype_digit($accountId)) {
            $candidateIds[] = (int)$accountId;
        }
        $stmt = $conn->prepare('SELECT StudentId FROM student_table WHERE AccountID = ?');
        if ($stmt) {
            $accountIdInt = (int)$accountId;
            $stmt->bind_param('i', $accountIdInt);
            if ($stmt->execute()) {
                $row = $stmt->get_result()->fetch_assoc();
                if ($row && ctype_digit((string)($row['StudentId'] ?? ''))) {
                    $candidateIds[] = (int)$row['StudentId'];
                }
            }
            $stmt->close();
        }
        return array_values(array_unique($candidateIds));
    }

    // Single-row ownership lookups used by POST — confirm a specific
    // counseling case / appointment / event both exists AND the student is
    // actually part of it, returning null on either failure (the caller can't
    // tell which, which is intentional: don't leak whether an id exists to a
    // student who isn't authorized to see it).
    private function find_counseling_case(mysqli $conn, string $caseUid, string $studentId): ?array {
        $stmt = $conn->prepare('SELECT case_uid, case_title, case_date, students_json FROM counselor_case_scenarios WHERE case_uid = ?');
        if (!$stmt) {
            return null;
        }
        $stmt->bind_param('s', $caseUid);
        if (!$stmt->execute()) {
            $stmt->close();
            return null;
        }
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            return null;
        }

        $studentsArr = json_decode((string)($row['students_json'] ?? '[]'), true) ?: [];
        $matched = false;
        foreach ($studentsArr as $s) {
            if ((string)($s['id'] ?? '') === $studentId) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            return null;
        }

        return ['label' => $this->format_case_label($row)];
    }

    private function find_appointment(mysqli $conn, string $requestId, string $accountId): ?array {
        $candidateIds = $this->resolve_appointment_candidate_ids($conn, $accountId);
        if (empty($candidateIds)) {
            return null;
        }

        $placeholders = implode(',', array_fill(0, count($candidateIds), '?'));
        $stmt = $conn->prepare("SELECT reason, preferred_date, preferred_time FROM appointment_requests WHERE request_id = ? AND student_id IN ($placeholders)");
        if (!$stmt) {
            return null;
        }
        $types = 's' . str_repeat('i', count($candidateIds));
        $stmt->bind_param($types, $requestId, ...$candidateIds);
        if (!$stmt->execute()) {
            $stmt->close();
            return null;
        }
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            return null;
        }

        return ['label' => $this->format_appointment_label($row)];
    }

    private function find_event(mysqli $conn, string $eventId, string $school): ?array {
        if ($school === '') {
            return null;
        }
        $stmt = $conn->prepare('SELECT title, event_type, start_date FROM schedule_events WHERE event_id = ? AND school_attended = ?');
        if (!$stmt) {
            return null;
        }
        $stmt->bind_param('ss', $eventId, $school);
        if (!$stmt->execute()) {
            $stmt->close();
            return null;
        }
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            return null;
        }

        return ['label' => $this->format_event_label($row)];
    }
}
