<?php

namespace App\Http\Controllers\Api\Documents;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

// Streams a document's file bytes back — used directly as an <img src="...">
// by the Documents pages' preview modal, so this must NOT force a download
// (Content-Disposition: inline) and must respond with the file's real bytes,
// not JSON, on success.
class DownloadDocumentController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $this->send_json_error(405, 'Method not allowed');
            }

            $documentId = (int)($_GET['document_id'] ?? 0);
            // Role and school come from the logged-in account, not the URL.
            $userType = api_role();
            $school = api_school();

            if ($documentId <= 0 || $school === '') {
                $this->send_json_error(400, 'document_id and school_attended are required');
            }
            if (strpos(strtolower($userType), 'coordinator') === false && strpos(strtolower($userType), 'counselor') === false) {
                $this->send_json_error(403, 'Only guidance staff can view documents');
            }

            // Same defensive migration as upload-document: in a database where
            // nothing was uploaded since files moved into the database there is
            // no file_data column yet, and every download failed with a server
            // error ("Unknown column 'file_data'"). Older rows then just have no
            // stored bytes, which is handled below.
            $col = $conn->query("SHOW COLUMNS FROM documents LIKE 'file_data'");
            if ($col && $col->num_rows === 0) {
                $conn->query("ALTER TABLE documents ADD COLUMN file_data LONGBLOB DEFAULT NULL");
            }

            $stmt = $conn->prepare('SELECT file_data, mime_type, original_filename, school_attended FROM documents WHERE document_id = ?');
            if (!$stmt) {
                $this->send_json_error(500, 'Prepare failed: ' . $conn->error);
            }
            $stmt->bind_param('i', $documentId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$row) {
                $this->send_json_error(404, 'Document not found');
            }
            if ($row['school_attended'] !== $school) {
                $this->send_json_error(403, "This document isn't from your school");
            }
            if ($row['file_data'] === null) {
                $this->send_json_error(404, 'File is missing from storage');
            }

            return response($row['file_data'], 200, [
                'Content-Type' => $row['mime_type'],
                'Content-Disposition' => 'inline; filename="' . addslashes($row['original_filename']) . '"',
                'Cache-Control' => 'private, max-age=3600',
            ]);
        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
            $this->send_json_error(500, 'Server error: ' . $e->getMessage());
        }
    }

    private function send_json_error(int $statusCode, string $message): void {
        http_response_code($statusCode);
        json_out(['success' => false, 'message' => $message]);
    }
}
