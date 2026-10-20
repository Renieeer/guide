<?php

namespace App\Http\Controllers\Api\Appointments;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

// Manual resend of an appointment notification email — e.g. a "Resend
// email" button for staff if a student says they never got the original,
// or for testing the mail-config.php setup without changing an appointment's
// status just to trigger a real one.
class AppointmentEmailController extends Controller
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

            $requestId = trim((string)($payload['request_id'] ?? ''));
            $event = trim((string)($payload['event'] ?? ''));

            if ($requestId === '' || $event === '') {
                $this->send_json(400, ['success' => false, 'message' => 'request_id and event are required']);
            }

            $result = notify_appointment_email($conn, $requestId, $event);

            $this->send_json($result['success'] ? 200 : 502, [
                'success' => $result['success'],
                'message' => $result['message']
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
