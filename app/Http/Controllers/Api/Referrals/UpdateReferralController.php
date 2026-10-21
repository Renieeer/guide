<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use Throwable;

class UpdateReferralController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensure_referral_stage_log_table($conn);

            $raw = file_get_contents('php://input');
            $payload = json_decode($raw, true);

            if (!is_array($payload)) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
            }

            $referralId = trim((string)($payload['referral_id'] ?? $payload['id'] ?? ''));
            $stage = isset($payload['stage']) ? (int)$payload['stage'] : 0;
            $status = trim((string)($payload['status'] ?? ''));
            // Not provided (a plain "Advance to Next Stage" click) clears the note —
            // a note set by a gated stage (e.g. "For counseling") shouldn't keep
            // showing once a later, ungated advance has moved past it. The log row
            // below still keeps a permanent copy of it either way.
            $stageNote = isset($payload['stage_note']) ? trim((string)$payload['stage_note']) : '';
            $changedBy = trim((string)($payload['counselor_name'] ?? ''));
            // Set once, by confirmConsentDecision() at Stage 3 — every other caller
            // (a plain "Advance to Next Stage" click, Stage 2's gate, etc.) omits
            // these, and the COALESCE below leaves whatever was already on file
            // untouched rather than blanking it out on every unrelated update.
            $consentStudent = trim((string)($payload['consent_student'] ?? ''));
            $consentParent = trim((string)($payload['consent_parent'] ?? ''));
            // Same set-once pattern: Stage 2's assessment decides the urgency
            // (confirmAssessmentCompleted() in referral-status.js / referrals.js).
            $urgency = strtolower(trim((string)($payload['urgency'] ?? '')));

            if ($referralId === '' || $stage <= 0 || $status === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
            }

            if ($urgency !== '' && !in_array($urgency, ['low', 'medium', 'high'], true)) {
                $this->send_json(400, ['success' => false, 'message' => 'Urgency must be low, medium, or high']);
            }

            $referralCode = $referralId;

            // Read the stage this referral is moving *from* before overwriting it —
            // needed for the log row, and cheaper than re-deriving it from history.
            $currentStmt = $conn->prepare('SELECT ReferralID, stage FROM referral WHERE ReferralID = ? OR referral_code = ? LIMIT 1');
            if (!$currentStmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $currentStmt->bind_param('ss', $referralId, $referralCode);
            if (!$currentStmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Lookup failed: ' . $currentStmt->error]);
            }
            $currentRow = $currentStmt->get_result()->fetch_assoc();
            $currentStmt->close();

            if (!$currentRow) {
                $this->send_json(404, ['success' => false, 'message' => 'Referral not found']);
            }

            $resolvedReferralId = (int)$currentRow['ReferralID'];
            $fromStage = (int)$currentRow['stage'];

            $stmt = $conn->prepare("
        UPDATE referral SET
            stage = ?,
            status = ?,
            stage_note = NULLIF(?, ''),
            consent_student = COALESCE(NULLIF(?, ''), consent_student),
            consent_parent = COALESCE(NULLIF(?, ''), consent_parent),
            urgency = COALESCE(NULLIF(?, ''), urgency),
            updated_at = NOW()
        WHERE ReferralID = ? OR referral_code = ?
    ");
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }

            $stmt->bind_param('isssssss', $stage, $status, $stageNote, $consentStudent, $consentParent, $urgency, $referralId, $referralCode);

            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Update failed: ' . $stmt->error]);
            }

            $stmt->close();

            // Log every transition, even a "no-op" re-save of the same stage —
            // that's still a real event (e.g. re-confirming a decision) worth a
            // timestamped record rather than silently skipping it.
            $logStmt = $conn->prepare('
        INSERT INTO referral_stage_log (referral_id, from_stage, to_stage, note, changed_by)
        VALUES (?, ?, ?, NULLIF(?, \'\'), NULLIF(?, \'\'))
    ');
            if ($logStmt) {
                $logStmt->bind_param('iiiss', $resolvedReferralId, $fromStage, $stage, $stageNote, $changedBy);
                $logStmt->execute();
                $logStmt->close();
            }

            $fetch = $conn->prepare('SELECT ReferralID AS id, referral_code, student_name, StudentID AS student_id, Grade AS grade, section, age, gender, Reason AS referral_reason, description, intervention_attempts, observed_behaviors, parent_guardian, parent_contact, parent_email, family_background, urgency, TeacherID AS teacher_id, teacher_name, teacher_contact, school_attended, student_school, stage, status, stage_note, consent_student, consent_parent, date_submitted, updated_at FROM referral WHERE ReferralID = ? OR referral_code = ? LIMIT 1');
            if (!$fetch) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }

            $fetch->bind_param('ss', $referralId, $referralCode);
            if (!$fetch->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Fetch failed: ' . $fetch->error]);
            }

            $result = $fetch->get_result();
            $referral = $result ? $result->fetch_assoc() : null;
            $fetch->close();

            $this->send_json(200, [
                'success' => true,
                'message' => 'Referral updated successfully',
                'referral' => $referral
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

    // A permanent log of every stage change, since the `referral` row's own
    // stage_note column is a single field that each new transition overwrites
    // (and a plain advance clears outright) — without this, the reasoning
    // behind an old transition (e.g. why Stage 3 routed to Intervention instead
    // of Counseling) is gone the moment the referral moves on. Read by
    // api/student-history.php and narrated into the timeline by
    // shDescribeStageTransition() in {counselor,other-school}/student-history.js
    // and student/appointment-history.js.
    private function ensure_referral_stage_log_table(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS referral_stage_log (
            id INT NOT NULL AUTO_INCREMENT,
            referral_id INT NOT NULL,
            from_stage INT NOT NULL,
            to_stage INT NOT NULL,
            note VARCHAR(255) DEFAULT NULL,
            changed_by VARCHAR(150) DEFAULT NULL,
            changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_referral_id (referral_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");
    }
}
