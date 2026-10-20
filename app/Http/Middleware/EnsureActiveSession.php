<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Requires a logged-in user whose session is still the account's single
// active one (see app/Support/Legacy/session-guard.php).
//
// Usage:
//   ->middleware('legacy.session')                 API: 401 JSON on failure
//   ->middleware('legacy.session:page,student')    page: redirect to "/" on
//                                                  failure or wrong role
class EnsureActiveSession
{
    // Page folder (URL prefix) -> the account role(s) allowed on it.
    public const ROLE_GROUPS = [
        'coordinator' => ['coordinator'],
        'counselor' => ['counselor'],
        'other-school' => ['counselor-and-coordinator'],
        'sdo' => ['admin', 'sdo'],
        'teacher' => ['teacher'],
        'student' => ['student'],
    ];

    public function handle(Request $request, Closure $next, string $mode = 'api', ?string $group = null): Response
    {
        $user = session_guard_current_user();

        if ($mode === 'page') {
            $allowed = $group !== null ? (self::ROLE_GROUPS[$group] ?? []) : null;
            if ($user === null || ($allowed !== null && !in_array($user['role'] ?? null, $allowed, true))) {
                return redirect()->route('home');
            }

            return $next($request);
        }

        if ($user === null) {
            return response()->json([
                'success' => false,
                'message' => 'Your session is no longer active — you may have logged in elsewhere. Please log in again.',
                'sessionExpired' => true,
            ], 401);
        }

        return $next($request);
    }
}
