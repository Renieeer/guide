<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

class ResendOtpController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
            }

            ensure_email_verification_schema($conn);

            $raw = file_get_contents('php://input');
            $payload = json_decode($raw, true);
            if (!is_array($payload)) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
            }

            $email = trim((string)($payload['email'] ?? ''));
            if ($email === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Email is required']);
            }

            if (!is_mail_enabled()) {
                $this->send_json(503, ['success' => false, 'message' => 'Email verification is not enabled for this system yet.']);
            }

            $stmt = $conn->prepare("SELECT First_name, Last_name, email_verified FROM users_tables WHERE email = ?");
            $stmt->bind_param('s', $email);
            $stmt->execute();
            $account = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if ($account) {
                if ((int)$account['email_verified'] === 1) {
                    $this->send_json(200, ['success' => true, 'alreadyVerified' => true, 'message' => 'This email is already verified. You can log in now.']);
                }
                $fullName = trim($account['First_name'] . ' ' . $account['Last_name']);
            } else {
                // No account yet — the account is only created once the OTP is
                // confirmed (see save_pending_registration() in email-verification.php),
                // so this is expected while a registration is still in progress.
                $pendingStmt = $conn->prepare("SELECT first_name, last_name FROM pending_registrations WHERE email = ?");
                $pendingStmt->bind_param('s', $email);
                $pendingStmt->execute();
                $pending = $pendingStmt->get_result()->fetch_assoc();
                $pendingStmt->close();

                if (!$pending) {
                    $this->send_json(404, ['success' => false, 'message' => 'No account found with that email.']);
                }
                $fullName = trim($pending['first_name'] . ' ' . $pending['last_name']);
            }

            $result = generate_and_send_otp($conn, $email, $fullName);

            $this->send_json($result['success'] ? 200 : 429, $result);
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
