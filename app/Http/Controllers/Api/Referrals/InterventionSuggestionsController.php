<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use mysqli;

// Stage 4's "Other Intervention" autocomplete — see
// pages/counselor/referral-status.js's loadInterventionSuggestions() and
// api/referral-intervention.php's POST handler, which is what actually
// grows this list via record_intervention_usage().
class InterventionSuggestionsController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        ensure_intervention_suggestions_tables($conn);

        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
        }

        // Stage 4 automatically uses the referral's own Reason for Referral — the
        // counselor never re-picks a reason here, see loadIntervention() in
        // referral-status.js.
        $referralId = (int)($_GET['referral_id'] ?? 0);
        if ($referralId <= 0) {
            $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
        }

        $stmt = $conn->prepare('SELECT Reason FROM referral WHERE ReferralID = ?');
        if (!$stmt) {
            $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
        }
        $stmt->bind_param('i', $referralId);
        $stmt->execute();
        $referral = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$referral) {
            $this->send_json(404, ['success' => false, 'message' => 'Referral not found']);
        }

        $reasons = split_referral_reasons($referral['Reason'] ?? '');

        $result = null;
        if (!empty($reasons)) {
            $placeholders = implode(',', array_fill(0, count($reasons), '?'));
            $types = str_repeat('s', count($reasons));
            $stmt = $conn->prepare("
        SELECT s.InterventionID, s.InterventionName, s.UsageCount
        FROM intervention_suggestions s
        INNER JOIN intervention_reason_map m ON m.InterventionID = s.InterventionID
        WHERE m.ReasonName IN ($placeholders) AND s.Status = 'active'
        GROUP BY s.InterventionID, s.InterventionName, s.UsageCount
        ORDER BY s.UsageCount DESC, s.InterventionName ASC
        LIMIT 50
    ");
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param($types, ...$reasons);
            $stmt->execute();
            $result = $stmt->get_result();
            if ($result->num_rows === 0) {
                $result = $this->fetch_overall_suggestions($conn);
            }
        } else {
            $result = $this->fetch_overall_suggestions($conn);
        }

        $suggestions = [];
        while ($row = $result->fetch_assoc()) {
            $suggestions[] = [
                'id' => (int)$row['InterventionID'],
                'name' => $row['InterventionName'],
                'usageCount' => (int)$row['UsageCount']
            ];
        }
        $stmt->close();

        $this->send_json(200, [
            'success' => true,
            'data' => $suggestions,
            'reasons' => $reasons
        ]);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    // Overall most-used suggestions, regardless of reason — the fallback used
    // both when a referral has no structured reason at all (saved before the
    // reason checklist existed) and when its reason(s) simply have no matched
    // suggestions yet (a reason category nobody has used "Other" on before),
    // so the box never shows empty just because one particular reason is new.
    private function fetch_overall_suggestions(mysqli $conn) {
        $stmt = $conn->prepare("SELECT InterventionID, InterventionName, UsageCount FROM intervention_suggestions WHERE Status = 'active' ORDER BY UsageCount DESC, InterventionName ASC LIMIT 50");
        $stmt->execute();
        return $stmt->get_result();
    }
}
