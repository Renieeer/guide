<?php

namespace App\Http\Controllers\Api\Documents;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use Throwable;

// Handles the multipart upload from the coordinator/counselor Documents
// page's "Upload Document" modal. See api/list-documents.php for the shared
// table shape and the student-id resolution this mirrors.
class UploadDocumentController extends Controller
{
    private const DOCUMENT_TYPES = ['inventory', 'referral', 'follow-up', 'case'];

    private const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the "Max file size: 10MB" note in the upload form

    private const ALLOWED_MIME_EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
    ];

    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensure_documents_table($conn);

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
            }

            // student_id/document_type are both optional now — the coordinator's
            // Document Library uploads general school resources tied to neither;
            // the counselor's per-student Documents page still sends both.
            $typedStudentId = trim((string)($_POST['student_id'] ?? ''));
            $documentType = trim((string)($_POST['document_type'] ?? ''));
            $description = trim((string)($_POST['description'] ?? ''));
            $userType = trim((string)($_POST['user_type'] ?? ''));
            $school = trim((string)($_POST['school_attended'] ?? ''));
            $uploaderId = trim((string)($_POST['user_id'] ?? ''));

            if ($school === '') {
                $this->send_json(400, ['success' => false, 'message' => 'school_attended is required']);
            }
            if ($documentType !== '' && !in_array($documentType, self::DOCUMENT_TYPES, true)) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid document_type']);
            }
            // Same loose staff-role check the rest of this codebase already relies
            // on (e.g. api/appointment-request.php's is_counselor_or_coordinator).
            if (strpos(strtolower($userType), 'coordinator') === false && strpos(strtolower($userType), 'counselor') === false) {
                $this->send_json(403, ['success' => false, 'message' => 'Only guidance staff can upload documents']);
            }

            $studentAccountId = null;
            if ($typedStudentId !== '') {
                $studentAccountId = $this->resolve_student_account_id($conn, $typedStudentId);
                if ($studentAccountId === null) {
                    $this->send_json(404, ['success' => false, 'message' => 'Student not found']);
                }
            }

            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                $err = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
                $message = $err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE
                    ? 'File is too large'
                    : 'No file was uploaded';
                $this->send_json(400, ['success' => false, 'message' => $message]);
            }

            $tmpPath = $_FILES['file']['tmp_name'];
            $fileSize = (int)$_FILES['file']['size'];
            if ($fileSize > self::MAX_FILE_BYTES) {
                $this->send_json(400, ['success' => false, 'message' => 'File exceeds the 10MB limit']);
            }

            // Trust the file's actual bytes, not the client-supplied MIME type or
            // filename extension — both are trivially spoofable.
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $detectedMime = finfo_file($finfo, $tmpPath);
            finfo_close($finfo);

            if (!isset(self::ALLOWED_MIME_EXTENSIONS[$detectedMime])) {
                $this->send_json(400, ['success' => false, 'message' => 'Only JPG, PNG, GIF, or WebP images are allowed']);
            }

            $originalFilename = basename((string)($_FILES['file']['name'] ?? 'document'));
            $extension = self::ALLOWED_MIME_EXTENSIONS[$detectedMime];
            // Legacy-shaped reference value — nothing reads this off disk anymore,
            // the bytes live in file_data below.
            $storedFilename = bin2hex(random_bytes(16)) . '.' . $extension;

            $fileData = file_get_contents($tmpPath);
            if ($fileData === false) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to read uploaded file']);
            }

            $uploaderIdInt = ctype_digit($uploaderId) ? (int)$uploaderId : null;
            // mysqli's bind_param sends an actual SQL NULL for a null PHP value
            // regardless of the declared type character, so student_id/document_type
            // land as NULL in the row when the form left them out.
            $documentTypeValue = $documentType !== '' ? $documentType : null;

            $stmt = $conn->prepare('
        INSERT INTO documents (student_id, document_type, original_filename, stored_filename, mime_type, file_size, file_data, school_attended, description, uploaded_by_id, uploaded_by_role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param(
                'issssisssis',
                $studentAccountId,
                $documentTypeValue,
                $originalFilename,
                $storedFilename,
                $detectedMime,
                $fileSize,
                $fileData,
                $school,
                $description,
                $uploaderIdInt,
                $userType
            );
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to save document record: ' . $stmt->error]);
            }
            $documentId = $stmt->insert_id;
            $stmt->close();

            $this->send_json(201, [
                'success' => true,
                'message' => 'Document uploaded successfully',
                'data' => [
                    'document_id' => $documentId,
                    'student_id' => $studentAccountId,
                    'document_type' => $documentTypeValue,
                    'original_filename' => $originalFilename,
                    'file_size' => $fileSize,
                ],
            ]);
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
            file_data LONGBLOB DEFAULT NULL,
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

        // Defensive migration for installations where this table already
        // existed before file_data was added — the photo lives in the database
        // now, not on disk (a plain uploads/ folder turned out to not reliably
        // survive on this host).
        $result = $conn->query("SHOW COLUMNS FROM documents LIKE 'file_data'");
        if ($result && $result->num_rows === 0) {
            $conn->query("ALTER TABLE documents ADD COLUMN file_data LONGBLOB DEFAULT NULL");
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
