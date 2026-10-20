<?php

namespace App\Http\Controllers\Api\Feedback;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use Throwable;

// Thread view + reply posting for a feedback record created via
// api/feedback.php. Kept as a sibling file rather than folded into
// feedback.php, mirroring how this codebase already splits a parent
// resource from its growable child log (api/case-scenario.php's cases vs.
// api/follow-up.php's entries under a case).
class FeedbackRepliesController extends Controller
{
    private const FEEDBACK_SENDER_ROLES = ['student', 'counselor', 'coordinator', 'counselor-and-coordinator'];

    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensure_feedback_table($conn);
            $this->ensure_feedback_messages_table($conn);
            $method = $_SERVER['REQUEST_METHOD'];

            if ($method === 'GET') {
                $feedbackId = trim((string)($_GET['feedback_id'] ?? ''));
                $studentId = trim((string)($_GET['student_id'] ?? ''));
                $school = trim((string)($_GET['school'] ?? ''));

                $feedbackRow = $this->load_authorized_feedback($conn, $feedbackId, $studentId, $school);

                $stmt = $conn->prepare('
            SELECT message_id AS id, sender_role, sender_account_id, sender_name, message, created_at
            FROM feedback_messages WHERE feedback_id = ?
            ORDER BY created_at ASC, message_id ASC
        ');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $stmt->bind_param('s', $feedbackId);
                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
                }
                $result = $stmt->get_result();
                $messages = [];
                while ($row = $result->fetch_assoc()) {
                    $messages[] = $row;
                }
                $stmt->close();

                $this->send_json(200, [
                    'success' => true,
                    'data' => [
                        'feedback' => [
                            'id' => $feedbackRow['feedback_id'],
                            'student_account_id' => (int)$feedbackRow['student_account_id'],
                            'student_name' => $feedbackRow['student_name'],
                            'school_attended' => $feedbackRow['school_attended'],
                            'subject_type' => $feedbackRow['subject_type'],
                            'subject_id' => $feedbackRow['subject_id'],
                            'subject_label' => $feedbackRow['subject_label'],
                            'feedback_type' => $feedbackRow['feedback_type'],
                            'message' => $feedbackRow['message'],
                            'status' => $feedbackRow['status'],
                            'created_at' => $feedbackRow['created_at'],
                            'updated_at' => $feedbackRow['updated_at']
                        ],
                        'messages' => $messages
                    ]
                ]);
            }

            if ($method === 'POST') {
                $raw = file_get_contents('php://input');
                $payload = json_decode($raw, true);
                if (!is_array($payload)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
                }

                $feedbackId = trim((string)($payload['feedback_id'] ?? ''));
                $senderRole = trim((string)($payload['sender_role'] ?? ''));
                $senderAccountId = trim((string)($payload['sender_account_id'] ?? ''));
                $senderName = trim((string)($payload['sender_name'] ?? ''));
                $message = trim((string)($payload['message'] ?? ''));
                $studentId = trim((string)($payload['student_id'] ?? ''));
                $school = trim((string)($payload['school'] ?? ''));

                if ($feedbackId === '' || $senderRole === '' || $senderAccountId === '' || $senderName === '' || $message === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
                }
                if (!in_array($senderRole, self::FEEDBACK_SENDER_ROLES, true)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid sender_role']);
                }

                // Same ownership rule as GET: a student may only post into their
                // own feedback thread, staff only into a thread from their school.
                // Also cross-check the poster's claimed identity against which
                // param they sent, so a student can't post as sender_role=student
                // while supplying a `school` that never gets checked against
                // student_account_id.
                if ($senderRole === 'student') {
                    $this->load_authorized_feedback($conn, $feedbackId, $senderAccountId, '');
                } else {
                    $this->load_authorized_feedback($conn, $feedbackId, '', $school);
                }

                $senderAccountIdInt = (int)$senderAccountId;

                $stmt = $conn->prepare('
            INSERT INTO feedback_messages (feedback_id, sender_role, sender_account_id, sender_name, message)
            VALUES (?, ?, ?, ?, ?)
        ');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $stmt->bind_param('ssiss', $feedbackId, $senderRole, $senderAccountIdInt, $senderName, $message);
                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Failed to save reply: ' . $stmt->error]);
                }
                $messageId = $stmt->insert_id;
                $stmt->close();

                // Status reflects who sent the latest message: a student message
                // means staff attention is needed again, a staff message means the
                // student has something new to read.
                $feedbackStatus = $senderRole === 'student' ? 'new' : 'replied';
                $statusStmt = $conn->prepare('UPDATE feedback SET status = ? WHERE feedback_id = ?');
                if ($statusStmt) {
                    $statusStmt->bind_param('ss', $feedbackStatus, $feedbackId);
                    $statusStmt->execute();
                    $statusStmt->close();
                }

                $this->send_json(201, [
                    'success' => true,
                    'message' => 'Reply sent',
                    'data' => [
                        'id' => $messageId,
                        'sender_role' => $senderRole,
                        'sender_account_id' => $senderAccountIdInt,
                        'sender_name' => $senderName,
                        'message' => $message,
                        'feedback_status' => $feedbackStatus
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

    // Self-contained copies of the same table guards api/feedback.php defines
    // — every API file in this codebase redeclares its own helpers rather than
    // sharing an include, so this file works standalone even if it's ever hit
    // before feedback.php is.
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ";
        if (!$conn->query($sql)) {
            $this->send_json(500, ['success' => false, 'message' => 'Failed to initialize feedback table: ' . $conn->error]);
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ";
        if (!$conn->query($sql)) {
            $this->send_json(500, ['success' => false, 'message' => 'Failed to initialize feedback_messages table: ' . $conn->error]);
        }
    }

    // Fetches the feedback row and enforces that the caller is allowed to see
    // it: either the owning student (student_id) or staff from the same
    // school (school). Exactly one of the two must be provided. Sends a 400/
    // 403/404 response and exits on any failure — callers can assume the
    // returned row is always authorized.
    private function load_authorized_feedback(mysqli $conn, string $feedbackId, string $studentId, string $school): array {
        if ($feedbackId === '') {
            $this->send_json(400, ['success' => false, 'message' => 'feedback_id is required']);
        }
        if ($studentId === '' && $school === '') {
            $this->send_json(400, ['success' => false, 'message' => 'student_id or school is required']);
        }

        $stmt = $conn->prepare('SELECT * FROM feedback WHERE feedback_id = ?');
        if (!$stmt) {
            $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
        }
        $stmt->bind_param('s', $feedbackId);
        if (!$stmt->execute()) {
            $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
        }
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            $this->send_json(404, ['success' => false, 'message' => 'Feedback not found']);
        }

        if ($studentId !== '') {
            if ((int)$row['student_account_id'] !== (int)$studentId) {
                $this->send_json(403, ['success' => false, 'message' => 'You can only view your own feedback']);
            }
        } elseif ($row['school_attended'] !== $school) {
            $this->send_json(403, ['success' => false, 'message' => "This feedback isn't from your school"]);
        }

        return $row;
    }
}
