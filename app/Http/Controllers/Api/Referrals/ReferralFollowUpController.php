<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use mysqli;

class ReferralFollowUpController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $this->ensure_referral_follow_up_table($conn);

        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'GET') {
            $referralId = (int)($_GET['referral_id'] ?? 0);
            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            $stmt = $conn->prepare('
        SELECT follow_up_id, referral_id, counselor_id, counselor_name, interval_label, interval_days,
               follow_up_date, next_follow_up_date, notes, created_at
        FROM referral_follow_up
        WHERE referral_id = ?
        ORDER BY follow_up_date DESC, follow_up_id DESC
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
                $row['follow_up_id'] = (int)$row['follow_up_id'];
                $row['referral_id'] = (int)$row['referral_id'];
                $row['interval_days'] = (int)$row['interval_days'];
                $rows[] = $row;
            }
            $stmt->close();

            $this->send_json(200, ['success' => true, 'data' => $rows]);
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
            $intervalLabel = trim((string)($body['interval_label'] ?? 'weekly'));
            $intervalDays = (int)($body['interval_days'] ?? 7);
            $followUpDate = trim((string)($body['follow_up_date'] ?? ''));
            $notes = trim((string)($body['notes'] ?? ''));

            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }
            if ($followUpDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $followUpDate)) {
                $this->send_json(400, ['success' => false, 'message' => 'A valid follow-up date is required']);
            }
            if ($intervalDays <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'Interval must be at least 1 day']);
            }
            if ($notes === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Enter a note before saving']);
            }

            $allowedLabels = ['weekly', 'biweekly', 'monthly', 'custom'];
            if (!in_array($intervalLabel, $allowedLabels, true)) {
                $intervalLabel = 'custom';
            }

            $nextFollowUpDate = date('Y-m-d', strtotime($followUpDate . " +{$intervalDays} days"));

            $stmt = $conn->prepare('
        INSERT INTO referral_follow_up (
            referral_id, counselor_id, counselor_name, interval_label, interval_days,
            follow_up_date, next_follow_up_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param(
                'isssisss',
                $referralId, $counselorId, $counselorName, $intervalLabel, $intervalDays,
                $followUpDate, $nextFollowUpDate, $notes
            );
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to save follow-up: ' . $stmt->error]);
            }
            $followUpId = $stmt->insert_id;
            $stmt->close();

            $this->send_json(201, [
                'success' => true,
                'message' => 'Follow-up saved.',
                'data' => ['follow_up_id' => $followUpId, 'next_follow_up_date' => $nextFollowUpDate]
            ]);
        }

        $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    // Stage 6 (Student Follow-up) — a log of dated check-ins with the student,
    // each recorded against a follow-up interval the counselor set (weekly /
    // biweekly / monthly / custom-days). Unlike referral_acknowledgement (one
    // row per referral), this is append-only like referral_screening — a
    // referral can have several follow-up check-ins over time, each showing
    // when the next one is due (follow_up_date + interval_days).
    private function ensure_referral_follow_up_table(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS referral_follow_up (
            follow_up_id INT NOT NULL AUTO_INCREMENT,
            referral_id INT NOT NULL,
            counselor_id VARCHAR(45) DEFAULT NULL,
            counselor_name VARCHAR(150) DEFAULT NULL,
            interval_label VARCHAR(20) NOT NULL DEFAULT 'weekly',
            interval_days INT NOT NULL DEFAULT 7,
            follow_up_date DATE NOT NULL,
            next_follow_up_date DATE DEFAULT NULL,
            notes TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (follow_up_id),
            KEY idx_referral_id (referral_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    }
}
