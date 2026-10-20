<?php

namespace App\Http\Controllers\Api\Students;

use App\Http\Controllers\Controller;
use mysqli;

// Star ratings a student leaves on a specific counseling case or referral
// (see pages/student/feedback.js's "Rate Counselor" tab) — a real,
// server-side table so a rating is visible to a coordinator/counselor on
// any device, not just the submitting student's own browser, and so it
// can be attributed to the counselor who actually handled that subject
// (see counselor_id/counselor_name below) rather than only a free-text
// subject description.
class StudentRatingsController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $this->ensure_student_ratings_table($conn);

        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'GET') {
            // Every caller narrows by at least one of these — a student's own
            // history (student_id), a counselor's own inbox (counselor_id), or a
            // coordinator's cross-counselor view (school). Combinable, though in
            // practice each page only ever sends one.
            $studentId = trim((string)($_GET['student_id'] ?? ''));
            $counselorId = trim((string)($_GET['counselor_id'] ?? ''));
            $school = trim((string)($_GET['school'] ?? ''));

            $sql = 'SELECT rating_id, student_account_id, student_name, school_attended, subject_type, subject_id,
                   subject_label, counselor_id, counselor_name, rating, comment, anonymous, is_read, created_at
            FROM student_ratings WHERE 1=1';
            $types = '';
            $params = [];

            if ($studentId !== '') {
                $sql .= ' AND student_account_id = ?';
                $types .= 'i';
                $params[] = (int)$studentId;
            }
            if ($counselorId !== '') {
                $sql .= ' AND counselor_id = ?';
                $types .= 's';
                $params[] = $counselorId;
            }
            if ($school !== '') {
                $sql .= ' AND school_attended = ?';
                $types .= 's';
                $params[] = $school;
            }

            $sql .= ' ORDER BY created_at DESC';

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
                $rows[] = [
                    'id' => $row['rating_id'],
                    'studentId' => (string)$row['student_account_id'],
                    'studentName' => $row['student_name'],
                    'schoolAttended' => $row['school_attended'] ?? '',
                    'subjectType' => $row['subject_type'],
                    'subjectId' => $row['subject_id'],
                    'subjectLabel' => $row['subject_label'],
                    'counselorId' => $row['counselor_id'] ?? '',
                    'counselorName' => $row['counselor_name'] ?? '',
                    'rating' => (int)$row['rating'],
                    'comment' => $row['comment'] ?? '',
                    'anonymous' => (bool)$row['anonymous'],
                    'read' => (bool)$row['is_read'],
                    'dateSent' => $row['created_at']
                ];
            }
            $stmt->close();

            $this->send_json(200, ['success' => true, 'data' => $rows]);
        }

        if ($method === 'POST') {
            $body = $this->read_json_body();

            $studentAccountId = (int)($body['studentId'] ?? 0);
            $studentName = trim((string)($body['studentName'] ?? ''));
            $school = trim((string)($body['schoolAttended'] ?? ''));
            $subjectType = trim((string)($body['subjectType'] ?? ''));
            $subjectId = trim((string)($body['subjectId'] ?? ''));
            $subjectLabel = trim((string)($body['subjectLabel'] ?? ''));
            $counselorId = trim((string)($body['counselorId'] ?? ''));
            $counselorName = trim((string)($body['counselorName'] ?? ''));
            $rating = (int)($body['rating'] ?? 0);
            $comment = trim((string)($body['comment'] ?? ''));
            $anonymous = !empty($body['anonymous']) ? 1 : 0;

            if ($studentAccountId === 0 || $subjectType === '' || $subjectId === '' || $rating < 1 || $rating > 5 || $comment === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
            }

            $ratingId = 'rating_' . bin2hex(random_bytes(8));

            $stmt = $conn->prepare('
        INSERT INTO student_ratings (
            rating_id, student_account_id, student_name, school_attended, subject_type, subject_id,
            subject_label, counselor_id, counselor_name, rating, comment, anonymous
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param(
                'sisssssssisi',
                $ratingId,
                $studentAccountId,
                $studentName,
                $school,
                $subjectType,
                $subjectId,
                $subjectLabel,
                $counselorId,
                $counselorName,
                $rating,
                $comment,
                $anonymous
            );
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to save rating: ' . $stmt->error]);
            }
            $stmt->close();

            $this->send_json(201, ['success' => true, 'message' => 'Rating submitted successfully.', 'data' => ['id' => $ratingId]]);
        }

        if ($method === 'PUT') {
            $body = $this->read_json_body();
            $ratingId = trim((string)($body['id'] ?? ''));
            if ($ratingId === '') {
                $this->send_json(400, ['success' => false, 'message' => 'id is required']);
            }

            $stmt = $conn->prepare('UPDATE student_ratings SET is_read = 1 WHERE rating_id = ?');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('s', $ratingId);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to update rating: ' . $stmt->error]);
            }
            $stmt->close();

            $this->send_json(200, ['success' => true]);
        }

        if ($method === 'DELETE') {
            $ratingId = trim((string)($_GET['id'] ?? ''));
            $studentId = trim((string)($_GET['student_id'] ?? ''));
            if ($ratingId === '' || $studentId === '') {
                $this->send_json(400, ['success' => false, 'message' => 'id and student_id are required']);
            }

            // Ownership check baked into the WHERE clause — a student can only ever
            // delete their own rating, never one keyed to someone else's account.
            $stmt = $conn->prepare('DELETE FROM student_ratings WHERE rating_id = ? AND student_account_id = ?');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $studentIdInt = (int)$studentId;
            $stmt->bind_param('si', $ratingId, $studentIdInt);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to delete rating: ' . $stmt->error]);
            }
            $deleted = $stmt->affected_rows > 0;
            $stmt->close();

            if (!$deleted) {
                $this->send_json(404, ['success' => false, 'message' => 'Rating not found or access denied']);
            }

            $this->send_json(200, ['success' => true]);
        }

        $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    private function ensure_student_ratings_table(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS student_ratings (
            rating_id VARCHAR(64) NOT NULL,
            student_account_id INT NOT NULL,
            student_name VARCHAR(255) NOT NULL,
            school_attended VARCHAR(100) DEFAULT NULL,
            subject_type VARCHAR(30) NOT NULL,
            subject_id VARCHAR(64) NOT NULL,
            subject_label VARCHAR(255) NOT NULL,
            counselor_id VARCHAR(45) DEFAULT NULL,
            counselor_name VARCHAR(150) DEFAULT NULL,
            rating INT NOT NULL,
            comment TEXT,
            anonymous TINYINT(1) NOT NULL DEFAULT 0,
            is_read TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (rating_id),
            INDEX idx_student (student_account_id),
            INDEX idx_school (school_attended),
            INDEX idx_counselor (counselor_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");
    }

    private function read_json_body(): array {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
