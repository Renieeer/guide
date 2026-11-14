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
//   ->middleware('legacy.session:page,student')    page: 403 page on failure
//                                                  or wrong role (deny_access())
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
                deny_access();
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

        $this->pinScopeToAccount($request, $user);

        return $next($request);
    }

    // The API controllers read the school and grade scope a request is about
    // straight from the query string ($_GET['school'], ...grade_scope), which
    // the browser controls. Replace them with the logged-in account's own
    // before any controller runs, so a request can't ask for another
    // school's or another grade's records. Always set, not only when sent:
    // several endpoints treat a missing school as "every school".
    // The SDO works across the whole district and keeps what it sent.
    private function pinScopeToAccount(Request $request, array $user): void
    {
        $role = (string) ($user['role'] ?? '');
        if (in_array($role, api_roles_sdo(), true)) {
            return;
        }

        $school = (string) ($user['school'] ?? '');
        $scope = in_array($role, api_roles_guidance(), true) ? (string) ($user['grade'] ?? '') : '';

        foreach (['school' => $school, 'school_attended' => $school, 'grade_scope' => $scope] as $key => $value) {
            $_GET[$key] = $value;
            $request->query->set($key, $value);
        }
        foreach (['school', 'school_attended'] as $key) {
            if (array_key_exists($key, $_POST)) {
                $_POST[$key] = $school;
                $request->request->set($key, $school);
            }
        }
    }
}
