<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use mysqli;
use stdClass;

class ReferralAcknowledgementController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $this->ensure_referral_acknowledgement_table($conn);

        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'GET') {
            $referralId = (int)($_GET['referral_id'] ?? 0);
            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            $stmt = $conn->prepare('
        SELECT ack_id, referral_id, counselor_id, counselor_name, attended_by, follow_up_count, referred_to, checklist_json, created_at, updated_at
        FROM referral_acknowledgement
        WHERE referral_id = ?
        LIMIT 1
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('i', $referralId);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
            }

            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$row) {
                $this->send_json(200, ['success' => true, 'data' => null]);
            }

            $row['ack_id'] = (int)$row['ack_id'];
            $row['referral_id'] = (int)$row['referral_id'];
            $row['checklist'] = json_decode((string)($row['checklist_json'] ?? '{}'), true) ?: new stdClass();
            unset($row['checklist_json']);

            $this->send_json(200, ['success' => true, 'data' => $row]);
        }

        if ($method === 'POST') {
            $raw = file_get_contents('php://input');
            $body = json_decode($raw, true);

            if (!is_array($body)) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
            }

            $referralId = (int)($body['referral_id'] ?? 0);
            $counselorId = trim((string)($body['counselor_id'] ?? ''));
            $counselorName = trim((string)($body['counselor_name'] ?? ''));
            $attendedBy = trim((string)($body['attended_by'] ?? ''));
            $followUpCount = trim((string)($body['follow_up_count'] ?? ''));
            $referredTo = trim((string)($body['referred_to'] ?? ''));
            $checklist = is_array($body['checklist'] ?? null) ? $body['checklist'] : [];

            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            $checklistJson = json_encode($checklist, JSON_UNESCAPED_UNICODE);

            $stmt = $conn->prepare('
        INSERT INTO referral_acknowledgement (
            referral_id, counselor_id, counselor_name, attended_by, follow_up_count, referred_to, checklist_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            counselor_id = VALUES(counselor_id),
            counselor_name = VALUES(counselor_name),
            attended_by = VALUES(attended_by),
            follow_up_count = VALUES(follow_up_count),
            referred_to = VALUES(referred_to),
            checklist_json = VALUES(checklist_json)
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('issssss', $referralId, $counselorId, $counselorName, $attendedBy, $followUpCount, $referredTo, $checklistJson);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to save acknowledgement: ' . $stmt->error]);
            }
            $stmt->close();

            $this->send_json(200, ['success' => true, 'message' => 'Acknowledgement saved.']);
        }

        $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    // Stage 6 (case closing) acknowledgement — filled out once by the
    // counselor after counseling ends, then shown read-only to the referring
    // teacher. One row per referral (uniq_referral_id): saving again from the
    // counselor's side updates the same row rather than creating a new one.
    private function ensure_referral_acknowledgement_table(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS referral_acknowledgement (
            ack_id INT NOT NULL AUTO_INCREMENT,
            referral_id INT NOT NULL,
            counselor_id VARCHAR(45) DEFAULT NULL,
            counselor_name VARCHAR(150) DEFAULT NULL,
            attended_by VARCHAR(150) DEFAULT NULL,
            follow_up_count VARCHAR(45) DEFAULT NULL,
            referred_to VARCHAR(255) DEFAULT NULL,
            checklist_json TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (ack_id),
            UNIQUE KEY uniq_referral_id (referral_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    }
}
