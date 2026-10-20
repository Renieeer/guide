<?php

/**
 * Shared account-active-status helpers for users_tables.
 *
 * The SDO can deactivate a coordinator/counselor account without deleting it
 * (so their history/records stay intact). users_tables.is_active gates
 * login: 1 = active (default), 0 = deactivated.
 */

/**
 * users_tables.is_active doesn't exist on every deployment of this schema
 * yet. Add it defensively the same way grade-scope.php does for the Grade
 * column — MySQL 8 has no "ADD COLUMN IF NOT EXISTS", so existence is
 * checked via SHOW COLUMNS first.
 */
function ensure_users_table_active_column(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    $result = $conn->query("SHOW COLUMNS FROM users_tables LIKE 'is_active'");
    if ($result && $result->num_rows > 0) {
        return;
    }

    $conn->query("ALTER TABLE users_tables ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");
}
