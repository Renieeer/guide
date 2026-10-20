<?php

namespace App\Http\Controllers\Api\Appointments;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

// Sends the "your appointment is tomorrow" reminder email (see
// api/notify-appointment.php's 'reminder' case). Not triggered by any page
// in the app — it's meant to be pinged periodically by an external cron
// service (InfinityFree's free tier has no real cron), e.g. once daily:
//   https://<your-domain>/api/send-appointment-reminders.php?key=<reminder_secret>
// Idempotent: each approved appointment gets at most one reminder attempt,
// tracked via the existing email_notifications log (event='reminder'), so
// calling this more often than needed is harmless.
class SendAppointmentRemindersController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $config = config('guidance.mail', []);
            $expectedKey = (string)($config['reminder_secret'] ?? '');
            $providedKey = (string)($_GET['key'] ?? '');

            if ($expectedKey === '' || !hash_equals($expectedKey, $providedKey)) {
                $this->send_json(403, ['success' => false, 'message' => 'Invalid or missing key']);
            }

            ensure_email_notifications_table($conn);

            $sql = "
        SELECT request_id FROM appointment_requests
        WHERE status = 'approved'
          AND preferred_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
          AND request_id NOT IN (
              SELECT request_id FROM email_notifications WHERE event = 'reminder'
          )
    ";
            $result = $conn->query($sql);
            if (!$result) {
                $this->send_json(500, ['success' => false, 'message' => 'Query failed: ' . $conn->error]);
            }

            $sent = 0;
            $failed = 0;
            $details = [];
            while ($row = $result->fetch_assoc()) {
                $r = notify_appointment_email($conn, $row['request_id'], 'reminder');
                $details[$row['request_id']] = $r['success'] ? 'sent' : ('failed: ' . $r['message']);
                if ($r['success']) {
                    $sent++;
                } else {
                    $failed++;
                }
            }

            $this->send_json(200, [
                'success' => true,
                'reminder_date' => date('Y-m-d', strtotime('+1 day')),
                'sent' => $sent,
                'failed' => $failed,
                'details' => $details,
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
}
