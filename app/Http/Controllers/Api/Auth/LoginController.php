<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Exception;

class LoginController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            // Include database connection
            ensure_users_table_grade_column($conn);
            ensure_users_table_active_column($conn);
            ensure_email_verification_schema($conn);
            ensure_users_table_profile_image_column($conn);
            ensure_users_table_session_column($conn);

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
            if (!isset($data['email']) || !isset($data['password'])) {
                json_out(['success' => false, 'message' => 'Missing required fields']);
            }

            $email = trim($data['email']);
            $plainPassword = $data['password'];

            // Validate input
            if (empty($email) || empty($plainPassword)) {
                json_out(['success' => false, 'message' => 'All fields are required']);
            }

            // Query user from database (users_tables)
            $query = "SELECT AccountID, email, Password, Type, First_name, Last_name, school_attended, Grade, is_active, email_verified, profile_image FROM users_tables WHERE email = ?";
            $stmt = $conn->prepare($query);
            if (!$stmt) {
                throw new Exception("Prepare failed: " . $conn->error);
            }

            $stmt->bind_param("s", $email);
            if (!$stmt->execute()) {
                throw new Exception("Execute failed: " . $stmt->error);
            }

            $result = $stmt->get_result();
            $user = $result->fetch_assoc();
            $stmt->close();

            if (!$user) {
                // User not found - return generic error for security
                json_out(['success' => false, 'message' => 'Incorrect credentials provided.']);
            }

            // Verify password
            if (!password_verify($plainPassword, $user['Password'])) {
                json_out(['success' => false, 'message' => 'Incorrect credentials provided.']);
            }

            if ((int)($user['is_active'] ?? 1) === 0) {
                // Student accounts are deactivated by the coordinator (see
                // manage-accounts.php's setActive action); every other account type
                // (teacher/counselor/coordinator/other-school) is SDO-only (see
                // sdo-school-staff.php) — point the user at whichever one actually
                // controls their account.
                $deactivatedByLabel = ($user['Type'] ?? '') === 'student' ? 'coordinator' : 'SDO administrator';
                json_out(['success' => false, 'message' => "This account has been deactivated. Please contact your $deactivatedByLabel."]);
            }

            // Defaults to verified (1) when the column is missing/null — matches
            // ensure_email_verification_schema()'s grandfathering of pre-existing
            // accounts, so this only ever blocks brand-new unverified signups.
            if ((int)($user['email_verified'] ?? 1) === 0) {
                json_out([
                    'success' => false,
                    'needsVerification' => true,
                    'email' => $user['email'],
                    'message' => 'Please verify your email before logging in.'
                ]);
            }

            // Login successful - role is retrieved from database
            $userData = [
                'id' => $user['AccountID'],
                'email' => $user['email'],
                'name' => $user['First_name'] . ' ' . $user['Last_name'],
                'firstName' => $user['First_name'],
                'lastName' => $user['Last_name'],
                'role' => $user['Type'],
                'school' => $user['school_attended'],
                // Comma-separated grade numbers a counselor/coordinator is scoped to
                // (e.g. "7", "11,12"). Empty/NULL means no restriction. See api/grade-scope.php.
                'grade' => $user['Grade'],
                // Root-relative path (no "../../") — see the matching comment on
                // fetch_profile() in api/profile.php for why.
                'profileImage' => $user['profile_image'] ? ('api/avatar?id=' . $user['AccountID'] . '&v=' . urlencode($user['profile_image'])) : null
            ];

            // Regenerated (not just reused) so a session id from before this login
            // can never be replayed to land in the new session's data — standard
            // session-fixation hardening, and doubly relevant now that a session
            // id is what "one active session per account" actually keys off of.
            session()->regenerate(true);

            // This account's new single active session. Overwriting
            // active_session_token here is *the* enforcement mechanism: any other
            // browser/tab/device currently holding the OLD token for this same
            // AccountID will fail session_guard_current_user()'s comparison on its
            // very next page load or API call and get logged out immediately — see
            // includes/session-guard.php.
            $sessionToken = bin2hex(random_bytes(32));

            $tokenStmt = $conn->prepare('UPDATE users_tables SET active_session_token = ? WHERE AccountID = ?');
            $tokenStmt->bind_param('si', $sessionToken, $user['AccountID']);
            $tokenStmt->execute();
            $tokenStmt->close();

            // Store in session
            session()->put('user', $userData);
            session()->put('session_token', $sessionToken);

            json_out([
                'success' => true,
                'message' => 'Login successful',
                'user' => $userData
            ]);

        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Exception $e) {
            http_response_code(500);
            json_out(['success' => false, 'message' => 'An error occurred: ' . $e->getMessage()]);
        }
    }
}
