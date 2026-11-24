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
//
// A student rates each counseling case / referral once. After that they can
// only edit that rating (PUT as a student) — a second POST for the same
// subject is refused, and students can't delete ratings.
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

            // Staff read their own school's ratings (school is pinned to the
            // account by the legacy.session middleware); a student only ever
            // reads their own.
            api_require_role(array_merge(api_roles_guidance(), ['student'], api_roles_sdo()));
            if (api_role() === 'student') {
                $studentId = (string) api_user_id();
                $counselorId = '';
            }

            $sql = 'SELECT rating_id, student_account_id, student_name, school_attended, subject_type, subject_id,
                   subject_label, counselor_id, counselor_name, rating, comment, anonymous, is_read, created_at, updated_at
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
                // An anonymous rating never tells staff who wrote it (the page
                // used to hide the name, but it was still in the response).
                $hideAuthor = (bool)$row['anonymous'] && (string)$row['student_account_id'] !== (string) api_user_id();
                $rows[] = [
                    'id' => $row['rating_id'],
                    'studentId' => $hideAuthor ? '' : (string)$row['student_account_id'],
                    'studentName' => $hideAuthor ? '' : $row['student_name'],
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
                    'dateSent' => $row['created_at'],
                    'editedAt' => $row['updated_at'] ?? null
                ];
            }
            $stmt->close();

            $this->send_json(200, ['success' => true, 'data' => $rows]);
        }

        if ($method === 'POST') {
            $body = $this->read_json_body();

            // Students rate their own sessions, under their own name and school.
            api_require_role(['student']);
            $studentAccountId = api_user_id();
            $studentName = api_user_name();
            $school = api_school();
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

            // Feedback opens once the session/referral has ended.
            if (!$this->subject_has_ended($conn, $subjectType, $subjectId)) {
                $this->send_json(409, ['success' => false, 'message' => 'You can give feedback once this counseling session or referral has ended.']);
            }

            // One rating per counseling case / referral; after that, edit it.
            $existing = $conn->prepare('SELECT rating_id FROM student_ratings WHERE student_account_id = ? AND subject_type = ? AND subject_id = ? LIMIT 1');
            $existing->bind_param('iss', $studentAccountId, $subjectType, $subjectId);
            $existing->execute();
            $existingRow = $existing->get_result()->fetch_assoc();
            $existing->close();
            if ($existingRow) {
                $this->send_json(409, [
                    'success' => false,
                    'message' => 'You already rated this. You can edit your rating in Your Ratings History.',
                    'data' => ['id' => $existingRow['rating_id']]
                ]);
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

            // A student edits their own rating: stars, comment, anonymous.
            // The subject it's about stays fixed. An edit is marked unread
            // again so staff notice the change.
            if (api_role() === 'student') {
                $rating = (int)($body['rating'] ?? 0);
                $comment = trim((string)($body['comment'] ?? ''));
                $anonymous = !empty($body['anonymous']) ? 1 : 0;
                if ($rating < 1 || $rating > 5 || $comment === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'A star rating and a comment are required.']);
                }

                $studentAccountId = api_user_id();
                $stmt = $conn->prepare('UPDATE student_ratings SET rating = ?, comment = ?, anonymous = ?, is_read = 0, updated_at = NOW() WHERE rating_id = ? AND student_account_id = ?');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $stmt->bind_param('isisi', $rating, $comment, $anonymous, $ratingId, $studentAccountId);
                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Failed to update rating: ' . $stmt->error]);
                }
                $stmt->close();

                // affected_rows is 0 for an unchanged save too, so check
                // ownership separately instead of relying on it.
                $own = $conn->prepare('SELECT 1 FROM student_ratings WHERE rating_id = ? AND student_account_id = ?');
                $own->bind_param('si', $ratingId, $studentAccountId);
                $own->execute();
                $isOwn = (bool)$own->get_result()->fetch_row();
                $own->close();
                if (!$isOwn) {
                    $this->send_json(404, ['success' => false, 'message' => 'Rating not found']);
                }

                $this->send_json(200, ['success' => true, 'message' => 'Rating updated.']);
            }

            // Staff mark ratings of their own school as read.
            api_require_role(array_merge(api_roles_guidance(), api_roles_sdo()));
            $own = $conn->prepare('SELECT school_attended FROM student_ratings WHERE rating_id = ?');
            $own->bind_param('s', $ratingId);
            $own->execute();
            $ownRow = $own->get_result()->fetch_assoc();
            $own->close();
            if (!$ownRow || !api_same_school($ownRow['school_attended'] ?? '')) {
                $this->send_json(404, ['success' => false, 'message' => 'Rating not found']);
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
            // Ratings stay on record; a student can edit theirs, not remove it.
            $this->send_json(405, ['success' => false, 'message' => 'Ratings can\'t be deleted. You can edit your rating instead.']);
        }

        $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    /**
     * Whether the thing being rated is over: a counseling case the counselor
     * ended (status "closed"), or a referral that reached Case Closing
     * (Stage 7) as completed — a rejected referral had no counseling to rate.
     */
    private function subject_has_ended(mysqli $conn, string $subjectType, string $subjectId): bool {
        if ($subjectType === 'counseling_case') {
            $stmt = $conn->prepare('SELECT status FROM counselor_case_scenarios WHERE case_uid = ? LIMIT 1');
            if (!$stmt) {
                return false;
            }
            $stmt->bind_param('s', $subjectId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            return $row && strtolower(trim((string)$row['status'])) === 'closed';
        }

        if ($subjectType === 'referral') {
            $stmt = $conn->prepare('SELECT COALESCE(stage, 1) AS stage, COALESCE(status, \'pending\') AS status FROM referral WHERE ReferralID = ? LIMIT 1');
            if (!$stmt) {
                return false;
            }
            $id = (int)$subjectId;
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            return $row && (int)$row['stage'] >= 7 && strtolower(trim((string)$row['status'])) !== 'rejected';
        }

        return false;
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

        // When a student last edited their rating (NULL = never edited).
        $column = $conn->query("SHOW COLUMNS FROM student_ratings LIKE 'updated_at'");
        if ($column && $column->num_rows === 0) {
            $conn->query('ALTER TABLE student_ratings ADD COLUMN updated_at DATETIME NULL DEFAULT NULL AFTER created_at');
        }
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
