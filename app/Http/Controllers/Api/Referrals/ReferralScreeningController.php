<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use mysqli;

class ReferralScreeningController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $this->ensure_referral_screening_table($conn);

        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'GET') {
            $referralId = (int)($_GET['referral_id'] ?? 0);
            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }
            // Optional — Stage 1's Interview/Background section and Stage 2's Risk
            // Assessment section each only want their own entries, not both mixed
            // together. Omit to get every entry regardless of stage (used by
            // api/student-history.php's timeline, which wants the full picture).
            $stageFilter = isset($_GET['stage']) ? (int)$_GET['stage'] : null;

            $sql = '
        SELECT screening_id, referral_id, counselor_id, counselor_name, interview_notes, observations, risk_level, stage, created_at
        FROM referral_screening
        WHERE referral_id = ?
    ';
            if ($stageFilter !== null) {
                $sql .= ' AND stage = ?';
            }
            $sql .= ' ORDER BY created_at DESC, screening_id DESC';

            $stmt = $conn->prepare($sql);
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            if ($stageFilter !== null) {
                $stmt->bind_param('ii', $referralId, $stageFilter);
            } else {
                $stmt->bind_param('i', $referralId);
            }
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
            }

            $result = $stmt->get_result();
            $rows = [];
            while ($row = $result->fetch_assoc()) {
                $row['screening_id'] = (int)$row['screening_id'];
                $row['referral_id'] = (int)$row['referral_id'];
                $row['stage'] = (int)$row['stage'];
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
            $interviewNotes = trim((string)($body['interview_notes'] ?? ''));
            $observations = trim((string)($body['observations'] ?? ''));
            $riskLevel = trim((string)($body['risk_level'] ?? ''));
            // Defaults to 2 (Risk Assessment) so the existing Stage 2 screening form
            // — which has never sent a `stage` field — keeps working unchanged.
            $stage = isset($body['stage']) ? (int)$body['stage'] : 2;

            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            if ($interviewNotes === '' && $observations === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Enter interview notes or observations before saving']);
            }

            $stmt = $conn->prepare('
        INSERT INTO referral_screening (referral_id, counselor_id, counselor_name, interview_notes, observations, risk_level, stage)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('isssssi', $referralId, $counselorId, $counselorName, $interviewNotes, $observations, $riskLevel, $stage);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to save screening notes: ' . $stmt->error]);
            }
            $screeningId = $stmt->insert_id;
            $stmt->close();

            // A referral sits at status 'pending' until real work actually starts
            // on it — logging the first screening note (Stage 1's interview or
            // Stage 2's risk assessment) is that first real action, so flip it to
            // 'in-progress' here rather than leaving it reading "pending" until the
            // referral's stage number itself changes (which can lag well behind
            // when work actually began — see confirmAssessmentCompleted() etc.,
            // which only advance the stage once the *whole* stage is done).
            $statusStmt = $conn->prepare("UPDATE referral SET status = 'in-progress' WHERE ReferralID = ? AND status = 'pending'");
            if ($statusStmt) {
                $statusStmt->bind_param('i', $referralId);
                $statusStmt->execute();
                $statusStmt->close();
            }

            $this->send_json(201, [
                'success' => true,
                'message' => 'Screening notes saved.',
                'data' => ['screening_id' => $screeningId]
            ]);
        }

        // Edits the single most recent entry in place (see submitInterviewNotes() /
        // editInterviewNotes() in counselor/referral-status.js and other-school/
        // referrals.js) instead of the POST handler's insert-a-new-row behavior —
        // Stage 1's Interview/Background Notes is meant to read as one note the
        // counselor can revise, not an appended log.
        if ($method === 'PUT') {
            $raw = file_get_contents('php://input');
            $body = json_decode($raw, true);

            if (!is_array($body)) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
            }

            $screeningId = (int)($body['screening_id'] ?? 0);
            if ($screeningId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'screening_id is required']);
            }

            $interviewNotes = trim((string)($body['interview_notes'] ?? ''));
            $observations = trim((string)($body['observations'] ?? ''));
            $riskLevel = trim((string)($body['risk_level'] ?? ''));

            if ($interviewNotes === '' && $observations === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Enter interview notes or observations before saving']);
            }

            $stmt = $conn->prepare("
        UPDATE referral_screening
        SET interview_notes = ?, observations = ?, risk_level = NULLIF(?, '')
        WHERE screening_id = ?
    ");
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('sssi', $interviewNotes, $observations, $riskLevel, $screeningId);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to update screening notes: ' . $stmt->error]);
            }
            $stmt->close();

            $this->send_json(200, ['success' => true, 'message' => 'Screening notes updated.']);
        }

        $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    // Counselor-logged notes tied to a referral — originally just Stage 2
    // (Initial Risk Assessment) interview/observations/risk-level entries, now
    // shared with Stage 1 (Interview/Background) too via the `stage` column,
    // since both are the same shape of thing (a dated note a counselor wrote
    // against this referral) and both need to show up as their own "Day N" in
    // the student-history timeline (see shBuildReferralThreadEntry() — it reads
    // this same `stage` value to label each entry "Interview/Background" vs
    // "Risk Assessment"). `stage` defaults to 2 so every row inserted before
    // this column existed is still correctly a Stage 2 entry.
    private function ensure_referral_screening_table(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS referral_screening (
            screening_id INT NOT NULL AUTO_INCREMENT,
            referral_id INT NOT NULL,
            counselor_id VARCHAR(45) DEFAULT NULL,
            counselor_name VARCHAR(150) DEFAULT NULL,
            interview_notes TEXT,
            observations TEXT,
            risk_level VARCHAR(20) DEFAULT NULL,
            stage INT NOT NULL DEFAULT 2,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (screening_id),
            KEY idx_referral_id (referral_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");

        // Defensive migration for installations where this table already
        // existed before the `stage` column was added.
        $result = $conn->query("SHOW COLUMNS FROM referral_screening LIKE 'stage'");
        if ($result && $result->num_rows === 0) {
            $conn->query("ALTER TABLE referral_screening ADD COLUMN stage INT NOT NULL DEFAULT 2");
        }
    }
}
