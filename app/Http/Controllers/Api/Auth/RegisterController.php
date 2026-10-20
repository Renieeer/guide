<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Exception;

class RegisterController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            // Include database connection
            ensure_email_verification_schema($conn);

            // Get JSON input
            $input = file_get_contents('php://input');
            if (!$input) {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'No data received']);
            }

            $data = json_decode($input, true);
            if (!$data) {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'Invalid JSON format']);
            }

            // Validate required fields
            if (!isset($data['firstName']) || !isset($data['lastName']) || !isset($data['email']) ||
                !isset($data['school']) || !isset($data['password']) || !isset($data['role'])) {
                json_out(['success' => false, 'message' => 'Missing required fields']);
            }

            $firstName = trim($data['firstName']);
            $lastName = trim($data['lastName']);
            $email = trim($data['email']);
            $school = trim($data['school']);
            $plainPassword = $data['password'];
            $role = trim($data['role']);

            // Validate input
            if (empty($firstName) || empty($lastName) || empty($email) || empty($school) || empty($plainPassword) || empty($role)) {
                json_out(['success' => false, 'message' => 'All fields are required']);
            }

            // Validate email format
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                json_out(['success' => false, 'message' => 'Invalid email format']);
            }

            // Validate school and get appropriate role
            $schoolConfig = getSchoolConfig($school);
            if (!$schoolConfig) {
                json_out(['success' => false, 'message' => 'Invalid school selected']);
            }

            if (!in_array($role, $schoolConfig['availableRoles'], true)) {
                json_out(['success' => false, 'message' => 'This role is not available for the selected school']);
            }

            // Only students self-register through this endpoint. Teachers need a
            // coordinator-issued access code (see staff-register.php ->
            // api/teacher-signup-request.php) so a student can't just fill this
            // form with role=teacher and their own email to get a staff account.
            // Counselor, coordinator, and the combined counselor-and-coordinator
            // role are SDO-only (created via School Management) so their
            // grade-scope assignment stays under district control. All of this is
            // enforced here regardless of which frontend form the request came from.
            $validRoles = ['student'];
            if (!in_array($role, $validRoles)) {
                if ($role === 'teacher') {
                    json_out(['success' => false, 'message' => 'Teacher accounts require an access code from your school coordinator. Please use the Staff Registration page.']);
                } else {
                    json_out(['success' => false, 'message' => 'Counselor and Coordinator accounts are created by the SDO. Please contact your school district office.']);
                }
            }

            // Validate password strength
            $passwordStrength = $this->validatePassword($plainPassword);
            if (!$passwordStrength['valid']) {
                json_out(['success' => false, 'message' => 'Password does not meet security requirements']);
            }

            // Check if email already exists in users_tables
            $checkQuery = "SELECT AccountID FROM users_tables WHERE email = ?";
            $stmt = $conn->prepare($checkQuery);
            if (!$stmt) {
                throw new Exception("Prepare failed: " . $conn->error);
            }

            $stmt->bind_param("s", $email);
            $stmt->execute();
            $result = $stmt->get_result();

            if ($result->num_rows > 0) {
                json_out(['success' => false, 'message' => 'Email already registered']);
                $stmt->close();
            }
            $stmt->close();

            // Hash password
            $hashedPassword = password_hash($plainPassword, PASSWORD_BCRYPT);

            // OTP verification is mandatory — a self-registered account must never
            // be created without proving the email is real and reachable. If mail
            // isn't configured (api/mail-config.php missing/disabled — see
            // email-verification.php's is_mail_enabled()), registration fails
            // outright instead of silently creating an unverified account, even
            // though that means registration is unusable until mail is set up.
            if (!is_mail_enabled()) {
                http_response_code(503);
                json_out([
                    'success' => false,
                    'message' => 'Email verification is not available right now. Please contact your school administrator.'
                ]);
            }

            // Don't persist the account until the OTP proves the email address is
            // real and reachable — stash the registration instead, and the
            // users_tables row gets created by verify_email_otp() once the code
            // checks out.
            save_pending_registration($conn, $email, $firstName, $lastName, $hashedPassword, $role, $school);

            $fullName = trim($firstName . ' ' . $lastName);
            $otpResult = generate_and_send_otp($conn, $email, $fullName);

            // A throttled resend (someone double-submitted within 60s) still has a
            // valid code already in their inbox from moments ago — that's not a
            // real failure, so it still proceeds to the OTP panel. An actual send
            // failure (EmailJS/network error) is: no code exists to enter, so this
            // must fail rather than hand back a useless "check your email" panel.
            if (!$otpResult['emailSent'] && !str_contains($otpResult['message'], 'wait')) {
                json_out([
                    'success' => false,
                    'message' => $otpResult['message'] ?: 'We could not send a verification email right now. Please try again later.'
                ]);
            }

            json_out([
                'success' => true,
                'needsVerification' => true,
                'email' => $email,
                'message' => $otpResult['emailSent']
                    ? 'Please check your email for a 6-digit verification code to finish creating your account.'
                    : $otpResult['message']
            ]);

            $conn->close();

        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Exception $e) {
            http_response_code(500);
            json_out(['success' => false, 'message' => 'An error occurred: ' . $e->getMessage()]);
        }
    }

    // Validate password strength
    private function validatePassword($password) {
        $minLength = 8;
        $hasUppercase = preg_match('/[A-Z]/', $password);
        $hasLowercase = preg_match('/[a-z]/', $password);
        $hasNumber = preg_match('/[0-9]/', $password);
        $hasSpecialChar = preg_match('/[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]/', $password);

        $valid = strlen($password) >= $minLength && $hasUppercase && $hasLowercase && $hasNumber && $hasSpecialChar;

        return [
            'valid' => $valid,
            'errors' => [
                'length' => strlen($password) < $minLength ? 'At least ' . $minLength . ' characters' : null,
                'uppercase' => !$hasUppercase ? 'At least one uppercase letter' : null,
                'lowercase' => !$hasLowercase ? 'At least one lowercase letter' : null,
                'number' => !$hasNumber ? 'At least one number' : null,
                'special' => !$hasSpecialChar ? 'At least one special character' : null
            ]
        ];
    }
}
