<?php

namespace App\Http\Controllers\Api\Documents;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

// Deletes a document's row — the file itself lives in that row's
// file_data column, so this is the whole deletion. See
// api/list-documents.php for the shared table shape.
class DeleteDocumentController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
            }

            $raw = file_get_contents('php://input');
            $payload = json_decode($raw, true);
            if (!is_array($payload)) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
            }

            $documentId = (int)($payload['document_id'] ?? 0);
            $userType = trim((string)($payload['user_type'] ?? ''));
            $school = trim((string)($payload['school_attended'] ?? ''));

            if ($documentId <= 0 || $school === '') {
                $this->send_json(400, ['success' => false, 'message' => 'document_id and school_attended are required']);
            }
            if (strpos(strtolower($userType), 'coordinator') === false && strpos(strtolower($userType), 'counselor') === false) {
                $this->send_json(403, ['success' => false, 'message' => 'Only guidance staff can delete documents']);
            }

            $stmt = $conn->prepare('SELECT school_attended FROM documents WHERE document_id = ?');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('i', $documentId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$row) {
                $this->send_json(404, ['success' => false, 'message' => 'Document not found']);
            }
            if ($row['school_attended'] !== $school) {
                $this->send_json(403, ['success' => false, 'message' => "This document isn't from your school"]);
            }

            // The file lives in this row's own file_data column (a BLOB), not on
            // disk, so deleting the row is the whole deletion.
            $deleteStmt = $conn->prepare('DELETE FROM documents WHERE document_id = ?');
            $deleteStmt->bind_param('i', $documentId);
            if (!$deleteStmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to delete document record: ' . $deleteStmt->error]);
            }
            $deleteStmt->close();

            $this->send_json(200, ['success' => true, 'message' => 'Document deleted successfully']);
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
}
