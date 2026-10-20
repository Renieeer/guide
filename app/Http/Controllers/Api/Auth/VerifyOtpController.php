<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

class VerifyOtpController extends Controller
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

            $email = trim((string)($payload['email'] ?? ''));
            $otp = trim((string)($payload['otp'] ?? ''));

            if ($email === '' || $otp === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Email and code are required']);
            }

            if (!preg_match('/^\d{6}$/', $otp)) {
                $this->send_json(400, ['success' => false, 'message' => 'Code must be 6 digits']);
            }

            $result = verify_email_otp($conn, $email, $otp);

            if ($result['success']) {
                // If this signup came through the coordinator-issued access-code
                // flow (staff-register.php), both layers have now succeeded — burn
                // the code so it can't be reused. A no-op for every other OTP
                // verification (student self-registration, legacy accounts), since
                // those emails have no matching row here.
                burn_teacher_access_code_for_email($conn, $email);
            }

            $this->send_json($result['success'] ? 200 : 400, $result);
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
