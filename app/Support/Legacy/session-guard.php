<?php

// One account can only ever have ONE active login at a time, across every
// role, page and API request.
//
// users_tables.active_session_token always holds the token for that
// account's MOST RECENT successful login (Auth\LoginController generates a
// fresh one and overwrites the column on every login). Every other page or
// request compares its own session('session_token') against that column —
// a session whose token doesn't match has been superseded by a newer login
// somewhere else, and is treated as invalid immediately.
//
// Enforced by App\Http\Middleware\EnsureActiveSession.

use App\Http\Middleware\EnsureActiveSession;

// Same defensive-migration pattern as every other schema change in this
// app (see e.g. ensure_users_table_active_column() in account-status.php).
function ensure_users_table_session_column(mysqli $conn): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    $result = $conn->query("SHOW COLUMNS FROM users_tables LIKE 'active_session_token'");
    if ($result && $result->num_rows > 0) {
        return;
    }

    $conn->query("ALTER TABLE users_tables ADD COLUMN active_session_token VARCHAR(64) DEFAULT NULL");
}

// Returns the logged-in user array if this exact browser session is still
// the account's one active session, or null otherwise (not logged in at
// all, or superseded by a newer login elsewhere — in which case this
// session is destroyed immediately so it can't be reused).
function session_guard_current_user(): ?array
{
    $user = session('user');
    $token = session('session_token');
    if (empty($user) || empty($token)) {
        return null;
    }

    $accountId = (int) ($user['id'] ?? 0);
    if ($accountId <= 0) {
        return null;
    }

    $conn = legacy_db();
    ensure_users_table_session_column($conn);
    ensure_users_table_grade_column($conn);
    ensure_users_table_active_column($conn);

    $stmt = $conn->prepare('SELECT active_session_token, Type, school_attended, Grade, is_active FROM users_tables WHERE AccountID = ?');
    $stmt->bind_param('i', $accountId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $currentToken = $row['active_session_token'] ?? null;
    if ($currentToken === null || !hash_equals($currentToken, (string) $token)) {
        session()->invalidate();
        return null;
    }

    // A deactivated account loses access on its very next request, not just
    // at its next login.
    if ((int) ($row['is_active'] ?? 1) === 0) {
        session()->invalidate();
        return null;
    }

    // Role, school and grade scope are what every permission check below is
    // based on, so they come from the database on each request rather than
    // from the copy taken at login (the SDO can change a school's name or a
    // counselor's grades while that person is logged in).
    $fresh = [
        'role' => (string) ($row['Type'] ?? ''),
        'school' => (string) ($row['school_attended'] ?? ''),
        'grade' => $row['Grade'],
    ];
    if (array_intersect_key($user, $fresh) !== $fresh) {
        $user = array_merge($user, $fresh);
        session()->put('user', $user);
    }

    return $user;
}

/*
|--------------------------------------------------------------------------
| API permission checks
|--------------------------------------------------------------------------
| The API used to trust the role, account id, school and grade scope that the
| browser sent, because the original plain-PHP app had no server-side login.
| Since the move to Laravel the server knows who is logged in
| (session('user'), checked above), so every endpoint decides from that
| instead. Anything a page sends about who the caller is gets ignored.
*/

function api_roles_guidance(): array
{
    return ['counselor', 'coordinator', 'counselor-and-coordinator'];
}

function api_roles_coordinator(): array
{
    return ['coordinator', 'counselor-and-coordinator'];
}

// The roles that do casework (fill in the referral stages, counseling).
function api_roles_counselor(): array
{
    return ['counselor', 'counselor-and-coordinator'];
}

// Display name of the logged-in user, for "recorded by" fields.
function api_user_name(): string
{
    $user = api_user();
    $name = trim((string) ($user['name'] ?? ''));
    return $name !== '' ? $name : trim(($user['firstName'] ?? '') . ' ' . ($user['lastName'] ?? ''));
}

function api_roles_sdo(): array
{
    return ['admin', 'sdo'];
}

// Ends the request with a JSON error, same shape as every endpoint's own.
function api_fail(int $status, string $message): never
{
    http_response_code($status);
    json_out(['success' => false, 'message' => $message]);
}

// The logged-in user. The legacy.session middleware has already turned away
// requests without one, so the 401 here is only a safety net.
function api_user(): array
{
    static $user = null;
    if ($user === null) {
        $user = session_guard_current_user();
        if ($user === null) {
            api_fail(401, 'Your session is no longer active. Please log in again.');
        }
    }
    return $user;
}

function api_role(): string
{
    return (string) (api_user()['role'] ?? '');
}

function api_user_id(): int
{
    return (int) (api_user()['id'] ?? 0);
}

function api_school(): string
{
    return trim((string) (api_user()['school'] ?? ''));
}

function api_is(array $roles): bool
{
    return in_array(api_role(), $roles, true);
}

function api_is_sdo(): bool
{
    return api_is(api_roles_sdo());
}

// 403 unless the caller has one of $roles.
function api_require_role(array $roles): array
{
    if (!api_is($roles)) {
        api_fail(403, "You don't have permission to do this.");
    }
    return api_user();
}

// Grade numbers a counselor/coordinator account is limited to (empty = all
// grades). Everyone else gets no limit here; their access is decided by the
// endpoint's own role check.
function api_grade_scope(): array
{
    return api_is(api_roles_guidance()) ? grade_scope_to_list((string) (api_user()['grade'] ?? '')) : [];
}

// Whether a student/referral grade is inside the caller's grade scope.
// Elementary schools number grades 1-6, secondary 7-12, so the caller's
// school type decides how a bare "1" is read (see grade-scope.php).
function api_grade_ok(mysqli $conn, ?string $grade): bool
{
    $scope = api_grade_scope();
    if (empty($scope)) {
        return true;
    }
    static $elementary = null;
    if ($elementary === null) {
        try {
            $elementary = school_is_elementary($conn, api_school());
        } catch (Throwable) {
            $elementary = false;
        }
    }
    return grade_matches_scope($grade, $scope, $elementary);
}

// The school a request may work on: the SDO picks any school, everyone else
// always gets their own, whatever the page sent.
function api_school_param(?string $requested): string
{
    return api_is_sdo() ? trim((string) $requested) : api_school();
}

function api_same_school(?string $school): bool
{
    if (api_is_sdo()) {
        return true;
    }
    $own = api_school();
    return $own !== '' && strcasecmp(trim((string) $school), $own) === 0;
}

// Loads a referral and stops the request unless the caller may see it:
// - guidance staff: referrals of their own school, within their grades
// - teacher: referrals they submitted
// - student: their own referrals
// - SDO: any referral
// $roles narrows which of those roles the endpoint is for at all.
function api_require_referral(mysqli $conn, int $referralId, array $roles): array
{
    api_require_role($roles);

    $stmt = $conn->prepare('SELECT ReferralID, StudentID, student_id, TeacherID, Grade, school_attended, student_school FROM referral WHERE ReferralID = ?');
    $stmt->bind_param('i', $referralId);
    $stmt->execute();
    $referral = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$referral) {
        api_fail(404, 'Referral not found.');
    }
    if (!api_can_see_referral($conn, $referral)) {
        api_fail(403, "You don't have permission to view this referral.");
    }
    return $referral;
}

// Same check for a row of a referral stage table (a screening note, an
// uploaded file, ...) looked up by its own id. $table/$idColumn are always
// fixed names from the calling code, never request input.
function api_require_referral_row(mysqli $conn, string $table, string $idColumn, int $id, array $roles): array
{
    api_require_role($roles);
    $stmt = $conn->prepare("SELECT referral_id FROM `$table` WHERE `$idColumn` = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        api_fail(404, 'Record not found.');
    }
    return api_require_referral($conn, (int) $row['referral_id'], $roles);
}

function api_can_see_referral(mysqli $conn, array $referral): bool
{
    if (api_is_sdo()) {
        return true;
    }
    $id = (string) api_user_id();

    if (api_is(api_roles_guidance())) {
        if (!api_same_school($referral['school_attended'] ?? '') && !api_same_school($referral['student_school'] ?? '')) {
            return false;
        }
        return api_grade_ok($conn, $referral['Grade'] ?? '');
    }
    if (api_role() === 'teacher') {
        return (string) ($referral['TeacherID'] ?? '') === $id;
    }
    if (api_role() === 'student') {
        return (string) ($referral['StudentID'] ?? '') === $id || (string) ($referral['student_id'] ?? '') === $id;
    }
    return false;
}

// Stops the request unless the caller may see this student's records:
// - the student themself
// - guidance staff of the student's school, within their grades
// - teachers of the student's school (they look students up to refer them)
// - SDO
function api_require_student(mysqli $conn, string $studentId, array $roles): void
{
    api_require_role($roles);
    $studentId = trim($studentId);

    if (api_role() === 'student') {
        if ($studentId !== (string) api_user_id()) {
            api_fail(403, 'You can only view your own records.');
        }
        return;
    }
    if (api_is_sdo()) {
        return;
    }

    // The student's school lives on their account; their grade on student_table.
    $stmt = $conn->prepare('SELECT u.school_attended, s.Grade FROM users_tables u LEFT JOIN student_table s ON s.AccountID = u.AccountID WHERE u.AccountID = ? AND u.Type = \'student\'');
    $stmt->bind_param('s', $studentId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row || !api_same_school($row['school_attended'] ?? '')) {
        api_fail(403, "This student isn't from your school.");
    }
    if (api_is(api_roles_guidance()) && !api_grade_ok($conn, $row['Grade'] ?? '')) {
        api_fail(403, "This student isn't in the grades assigned to you.");
    }
}

// Stops the request with the 403 page (resources/views/errors/403.blade.php).
// The page picks its own message: "please log in" for a visitor without an
// active session, or "no permission" plus their role for a logged-in user.
function deny_access(): never
{
    abort(403);
}

// Who the 403/404 pages are talking to: null for a visitor without an active
// session, otherwise their role's label and their dashboard URL. Never
// throws, since an error page still has to render when the database is down.
function error_page_viewer(): ?array
{
    try {
        $user = session_guard_current_user();
    } catch (Throwable) {
        return null;
    }
    if ($user === null) {
        return null;
    }

    // Same wording as PROFILE_ROLE_LABELS in public/js/utils.js.
    $labels = [
        'student' => 'Student',
        'teacher' => 'Teacher',
        'counselor' => 'Counselor',
        'coordinator' => 'Coordinator',
        'counselor-and-coordinator' => 'Counselor & Coordinator',
        'sdo' => 'SDO',
        'admin' => 'Administrator',
    ];
    $role = (string) ($user['role'] ?? '');

    $dashboard = url('/');
    foreach (EnsureActiveSession::ROLE_GROUPS as $folder => $roles) {
        if (in_array($role, $roles, true)) {
            $dashboard = url("$folder/dashboard");
            break;
        }
    }

    return [
        'role' => $labels[$role] ?? $role,
        'dashboard' => $dashboard,
    ];
}
