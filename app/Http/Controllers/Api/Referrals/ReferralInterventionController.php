<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use mysqli;
use stdClass;

class ReferralInterventionController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $this->ensure_referral_intervention_table($conn);
        ensure_intervention_suggestions_tables($conn);

        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'GET') {
            $referralId = (int)($_GET['referral_id'] ?? 0);
            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            $stmt = $conn->prepare('
        SELECT intervention_id, referral_id, counselor_id, counselor_name, checklist_json, notes, created_at, updated_at
        FROM referral_intervention
        WHERE referral_id = ?
        ORDER BY created_at DESC, intervention_id DESC
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
                $row['intervention_id'] = (int)$row['intervention_id'];
                $row['referral_id'] = (int)$row['referral_id'];
                $row['checklist'] = json_decode((string)($row['checklist_json'] ?? '{}'), true) ?: new stdClass();
                unset($row['checklist_json']);
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
            $notes = trim((string)($body['notes'] ?? ''));
            $checklist = is_array($body['checklist'] ?? null) ? $body['checklist'] : [];

            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            $hasActivity = array_filter($checklist, fn($v) => $v);
            if (empty($hasActivity) && $notes === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Check at least one activity or add a note before saving']);
            }

            $checklistJson = json_encode($checklist, JSON_UNESCAPED_UNICODE);

            $stmt = $conn->prepare('
        INSERT INTO referral_intervention (
            referral_id, counselor_id, counselor_name, checklist_json, notes
        ) VALUES (?, ?, ?, ?, ?)
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('issss', $referralId, $counselorId, $counselorName, $checklistJson, $notes);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to save intervention: ' . $stmt->error]);
            }
            $interventionId = $stmt->insert_id;
            $stmt->close();

            // NEW: Reason-based intervention suggestions — every "Other" chip
            // (checklist.other_interventions, set by the counselor typing/picking
            // one in referral-status.js) is recorded against intervention_suggestions
            // (creating it on first use, bumping UsageCount after that) and linked to
            // this referral's own Reason for Referral, so the same list of reasons
            // suggests it again next time — see api/intervention-suggestions.php.
            $otherInterventions = is_array($checklist['other_interventions'] ?? null) ? $checklist['other_interventions'] : [];
            if (!empty($otherInterventions)) {
                $referralStmt = $conn->prepare('SELECT Reason FROM referral WHERE ReferralID = ?');
                $referralStmt->bind_param('i', $referralId);
                $referralStmt->execute();
                $referralRow = $referralStmt->get_result()->fetch_assoc();
                $referralStmt->close();

                $reasons = split_referral_reasons($referralRow['Reason'] ?? '');
                foreach ($otherInterventions as $interventionName) {
                    if (is_string($interventionName) && trim($interventionName) !== '') {
                        record_intervention_usage($conn, $interventionName, $reasons);
                    }
                }
            }

            $this->send_json(201, [
                'success' => true,
                'message' => 'Intervention session saved.',
                'data' => ['intervention_id' => $interventionId]
            ]);
        }

        $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    // Stage 4 (Intervention) — which intervention activities were carried out
    // for this referral. Append-only log (one row per session): an
    // intervention plan often can't be carried out in a single day, so each
    // save creates a new dated entry instead of overwriting the last one —
    // same shape/pattern as Stage 6's referral-follow-up.php, not the older
    // single-row-per-referral pattern referral-acknowledgement.php still uses.
    private function ensure_referral_intervention_table(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS referral_intervention (
            intervention_id INT NOT NULL AUTO_INCREMENT,
            referral_id INT NOT NULL,
            counselor_id VARCHAR(45) DEFAULT NULL,
            counselor_name VARCHAR(150) DEFAULT NULL,
            checklist_json TEXT,
            notes TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (intervention_id),
            KEY idx_referral_id (referral_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

        // Defensive migration for installations where this table already exists
        // from before intervention became a multi-entry log — the old
        // uniq_referral_id constraint would silently block a second session
        // from ever being inserted (ON DUPLICATE KEY UPDATE would just overwrite
        // the first one instead).
        $result = $conn->query("SHOW INDEX FROM referral_intervention WHERE Key_name = 'uniq_referral_id'");
        if ($result && $result->num_rows > 0) {
            $conn->query("ALTER TABLE referral_intervention DROP INDEX uniq_referral_id");
        }
    }
}
