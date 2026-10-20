<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use mysqli;

// Streaming a single file (?view=<id>) bypasses the JSON header below —
// it needs to send the file's own Content-Type instead.
class ReferralConsentController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $isView = $_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['view']);

        if (!$isView) {
        }

        // Stage 3 (Parent Call-up/Consent) uploads — the signed consent form for
        // assessment & interventions, filed against the referral it belongs to.
        // Lives in file_data (a BLOB) rather than on disk — a plain uploads/ folder
        // turned out to not reliably survive on this host, silently orphaning every
        // row that pointed at a now-missing file. stored_filename is kept only as a
        // legacy/reference column, no longer where the bytes live.
        $consentAllowedExt = ['pdf', 'jpg', 'jpeg', 'png'];
        $consentAllowedMime = ['application/pdf', 'image/jpeg', 'image/png'];
        $consentMaxBytes = 5 * 1024 * 1024; // 5 MB

        $this->ensure_referral_consent_table($conn);

        $method = $_SERVER['REQUEST_METHOD'];

        // Streams one file's bytes back out — this is what every 'url' below
        // actually points at, instead of a static uploads/ path.
        if ($isView) {
            $consentId = (int)($_GET['view'] ?? 0);
            if ($consentId <= 0) {
                return response('', 400);
            }

            $stmt = $conn->prepare('SELECT original_filename, file_data, mime_type FROM referral_consent WHERE consent_id = ?');
            $stmt->bind_param('i', $consentId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$row || $row['file_data'] === null) {
                return response('', 404);
            }

            return response($row['file_data'], 200, [
                'Content-Type' => $row['mime_type'] ?: 'application/octet-stream',
                'Content-Disposition' => 'inline; filename="' . addslashes($row['original_filename']) . '"',
            ]);
        }

        if ($method === 'GET') {
            $referralId = (int)($_GET['referral_id'] ?? 0);
            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            $stmt = $conn->prepare('
        SELECT consent_id, referral_id, original_filename, file_size, uploaded_by, uploaded_at
        FROM referral_consent
        WHERE referral_id = ?
        ORDER BY uploaded_at DESC, consent_id DESC
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('i', $referralId);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
            }

            $result = $stmt->get_result();
            $rows = [];
            while ($row = $result->fetch_assoc()) {
                $rows[] = [
                    'consentId' => (int)$row['consent_id'],
                    'referralId' => (int)$row['referral_id'],
                    'fileName' => $row['original_filename'],
                    'fileSize' => (int)$row['file_size'],
                    'uploadedBy' => $row['uploaded_by'],
                    'uploadedAt' => $row['uploaded_at'],
                    'url' => '../../api/referral-consent?view=' . (int)$row['consent_id']
                ];
            }
            $stmt->close();

            $this->send_json(200, ['success' => true, 'data' => $rows]);
        }

        if ($method === 'POST') {
            $referralId = (int)($_POST['referral_id'] ?? 0);
            $uploadedBy = trim((string)($_POST['uploaded_by'] ?? ''));

            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            if (!isset($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
                $this->send_json(400, ['success' => false, 'message' => 'No file was uploaded']);
            }

            $file = $_FILES['file'];

            if ($file['error'] !== UPLOAD_ERR_OK) {
                $this->send_json(400, ['success' => false, 'message' => 'Upload failed (error code ' . $file['error'] . ')']);
            }

            if ($file['size'] > $consentMaxBytes) {
                $this->send_json(400, ['success' => false, 'message' => 'File is too large. Maximum size is 5 MB.']);
            }

            if (!is_uploaded_file($file['tmp_name'])) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid upload']);
            }

            $originalName = basename($file['name']);
            $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

            if (!in_array($ext, $consentAllowedExt, true)) {
                $this->send_json(400, ['success' => false, 'message' => 'Only PDF, JPG, and PNG files are allowed.']);
            }

            // Detected from the file's actual bytes, not the client-supplied
            // extension — this is what gets served back as the real Content-Type.
            $mime = @mime_content_type($file['tmp_name']) ?: 'application/octet-stream';
            if (!in_array($mime, $consentAllowedMime, true)) {
                $this->send_json(400, ['success' => false, 'message' => 'Only PDF, JPG, and PNG files are allowed.']);
            }

            $fileData = file_get_contents($file['tmp_name']);
            if ($fileData === false) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to read the uploaded file']);
            }

            $fileSize = (int)$file['size'];
            // Legacy-shaped reference value — nothing reads this off disk anymore,
            // it's just kept so existing rows/reports that show a filename-like
            // value keep looking the same.
            $storedFilename = 'consent_' . $referralId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;

            $stmt = $conn->prepare('
        INSERT INTO referral_consent (referral_id, original_filename, stored_filename, file_size, file_data, mime_type, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('ississs', $referralId, $originalName, $storedFilename, $fileSize, $fileData, $mime, $uploadedBy);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to record upload: ' . $stmt->error]);
            }
            $consentId = $stmt->insert_id;
            $stmt->close();

            $this->send_json(201, [
                'success' => true,
                'message' => 'Consent form uploaded.',
                'data' => [
                    'consentId' => $consentId,
                    'fileName' => $originalName,
                    'fileSize' => $fileSize,
                    'uploadedBy' => $uploadedBy,
                    'url' => '../../api/referral-consent?view=' . $consentId
                ]
            ]);
        }

        $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    private function ensure_referral_consent_table(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS referral_consent (
            consent_id INT NOT NULL AUTO_INCREMENT,
            referral_id INT NOT NULL,
            original_filename VARCHAR(255) NOT NULL,
            stored_filename VARCHAR(255) NOT NULL,
            file_size INT DEFAULT NULL,
            file_data LONGBLOB DEFAULT NULL,
            mime_type VARCHAR(100) DEFAULT NULL,
            uploaded_by VARCHAR(150) DEFAULT NULL,
            uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (consent_id),
            KEY idx_referral_id (referral_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");

        // Defensive migration for installations where this table already
        // existed before file_data/mime_type were added.
        foreach (['file_data' => 'LONGBLOB DEFAULT NULL', 'mime_type' => 'VARCHAR(100) DEFAULT NULL'] as $col => $def) {
            $result = $conn->query("SHOW COLUMNS FROM referral_consent LIKE '$col'");
            if ($result && $result->num_rows === 0) {
                $conn->query("ALTER TABLE referral_consent ADD COLUMN $col $def");
            }
        }
    }
}
