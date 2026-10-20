<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

// js/auth.js's logout() has always POSTed here "for server-side logout"
// (its own comment) — this file didn't actually exist until now, so that
// fetch was a silent 404, and nothing server-side ever ended a session.
// Now that active_session_token is real (see includes/session-guard.php),
// a proper logout should clear it — otherwise a session that logged out
// client-side is still the account's recorded "active" one, and simply
// reopening the same browser tab (session cookie still present) would
// pass session_guard_current_user()'s check again.
class LogoutController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            ensure_users_table_session_column($conn);

            $accountId = (int)session('user.id', 0);
            $sessionToken = (string)session('session_token', '');

            if ($accountId > 0 && $sessionToken !== '') {
                // Only clears the token if it still matches THIS session's own
                // token — guards against a stale/delayed logout request from an
                // already-superseded session accidentally wiping out a newer,
                // legitimate login that happened in the meantime.
                $stmt = $conn->prepare('UPDATE users_tables SET active_session_token = NULL WHERE AccountID = ? AND active_session_token = ?');
                $stmt->bind_param('is', $accountId, $sessionToken);
                $stmt->execute();
                $stmt->close();
            }

            session()->invalidate();

            json_out(['success' => true, 'message' => 'Logged out']);
        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
            http_response_code(500);
            json_out(['success' => false, 'message' => 'Logout error: ' . $e->getMessage()]);
        }
    }
}
