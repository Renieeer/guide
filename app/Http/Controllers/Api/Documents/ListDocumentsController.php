<?php

namespace App\Http\Controllers\Api\Documents;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use Throwable;

// Lists uploaded documents for one student — see api/upload-document.php,
// api/download-document.php, api/delete-document.php for the rest of the
// 1.4 "Uploaded related documents" feature these four files implement.
class ListDocumentsController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensure_documents_table($conn);

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
            }

            $typedStudentId = trim((string)($_GET['student_id'] ?? ''));
            $school = trim((string)($_GET['school_attended'] ?? ''));

            if ($school === '') {
                $this->send_json(400, ['success' => false, 'message' => 'school_attended is required']);
            }

            // A student_id scopes the list to one student (the counselor's
            // per-student Documents page). Without one, this lists every document
            // for the school — the coordinator's general Document Library.
            if ($typedStudentId !== '') {
                $studentAccountId = $this->resolve_student_account_id($conn, $typedStudentId);
                if ($studentAccountId === null) {
                    // Unknown student — not an error, just nothing to show.
                    $this->send_json(200, ['success' => true, 'documents' => []]);
                }

                $stmt = $conn->prepare('
            SELECT document_id, student_id, document_type, original_filename, file_size, description, uploaded_at
            FROM documents
            WHERE student_id = ? AND school_attended = ?
            ORDER BY uploaded_at DESC
        ');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $stmt->bind_param('is', $studentAccountId, $school);
            } else {
                $stmt = $conn->prepare('
            SELECT document_id, student_id, document_type, original_filename, file_size, description, uploaded_at
            FROM documents
            WHERE school_attended = ?
            ORDER BY uploaded_at DESC
        ');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $stmt->bind_param('s', $school);
            }

            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
            }
            $result = $stmt->get_result();
            $documents = [];
            while ($row = $result->fetch_assoc()) {
                $row['document_id'] = (int)$row['document_id'];
                $row['student_id'] = $row['student_id'] !== null ? (int)$row['student_id'] : null;
                $row['file_size'] = (int)$row['file_size'];
                $documents[] = $row;
            }
            $stmt->close();

            $this->send_json(200, ['success' => true, 'documents' => $documents]);
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

    private function ensure_documents_table(mysqli $conn): void {
        $sql = "
        CREATE TABLE IF NOT EXISTS documents (
            document_id INT NOT NULL AUTO_INCREMENT,
            student_id INT DEFAULT NULL,
            document_type VARCHAR(30) DEFAULT NULL,
            original_filename VARCHAR(255) NOT NULL,
            stored_filename VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            file_size INT NOT NULL,
            school_attended VARCHAR(100) DEFAULT NULL,
            description TEXT,
            uploaded_by_id INT DEFAULT NULL,
            uploaded_by_role VARCHAR(30) DEFAULT NULL,
            uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (document_id),
            INDEX idx_student (student_id),
            INDEX idx_type (document_type),
            INDEX idx_school (school_attended)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";
        if (!$conn->query($sql)) {
            $this->send_json(500, ['success' => false, 'message' => 'Failed to initialize documents table: ' . $conn->error]);
        }

        // student_id/document_type used to be required (every upload was tied
        // to one student and categorized), but the coordinator's Document
        // Library now also accepts general school uploads with neither —
        // relax any pre-existing NOT NULL constraint left over from that.
        foreach (['student_id' => 'INT', 'document_type' => 'VARCHAR(30)'] as $column => $type) {
            $col = $conn->query("SHOW COLUMNS FROM documents LIKE '$column'");
            $row = $col ? $col->fetch_assoc() : null;
            if ($row && $row['Null'] === 'NO') {
                $conn->query("ALTER TABLE documents MODIFY COLUMN $column $type DEFAULT NULL");
            }
        }
    }

    // Staff may type either a users_tables.AccountID or a student_table.StudentId
    // (usually the same value in this app) — resolve both the same way
    // api/feedback.php's resolve_appointment_candidate_ids() already does.
    private function resolve_student_account_id(mysqli $conn, string $typedId): ?int {
        if (!ctype_digit($typedId)) {
            return null;
        }
        $idInt = (int)$typedId;

        $stmt = $conn->prepare("SELECT AccountID FROM users_tables WHERE AccountID = ? AND Type = 'student'");
        $stmt->bind_param('i', $idInt);
        $stmt->execute();
        $found = (bool)$stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($found) {
            return $idInt;
        }

        $stmt = $conn->prepare('SELECT AccountID FROM student_table WHERE StudentId = ?');
        $stmt->bind_param('s', $typedId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row && ctype_digit((string)($row['AccountID'] ?? ''))) {
            return (int)$row['AccountID'];
        }

        return null;
    }
}
