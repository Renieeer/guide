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

    $stmt = $conn->prepare('SELECT active_session_token FROM users_tables WHERE AccountID = ?');
    $stmt->bind_param('i', $accountId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $currentToken = $row['active_session_token'] ?? null;
    if ($currentToken === null || !hash_equals($currentToken, (string) $token)) {
        session()->invalidate();
        return null;
    }

    return $user;
}
