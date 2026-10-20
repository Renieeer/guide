<?php

/**
 * Shared profile-photo schema helper.
 *
 * users_tables.profile_image doesn't exist on every deployment of this
 * schema yet. Add it defensively the same way api/grade-scope.php and
 * api/account-status.php do for their own columns — MySQL 8 has no "ADD
 * COLUMN IF NOT EXISTS", so existence is checked via SHOW COLUMNS first.
 *
 * Pure-function file (no top-level execution) so it's safe to require from
 * multiple entry points (api/login.php, api/profile.php) the same way
 * grade-scope.php/account-status.php already are.
 */
function ensure_users_table_profile_image_column(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    $result = $conn->query("SHOW COLUMNS FROM users_tables LIKE 'profile_image'");
    if ($result && $result->num_rows > 0) {
        return;
    }

    $conn->query("ALTER TABLE users_tables ADD COLUMN profile_image VARCHAR(255) DEFAULT NULL");
}

/**
 * The photo itself now lives in the database (profile_image_data, a BLOB)
 * instead of on disk — uploads/profile-images/ turned out to not reliably
 * survive on this host, silently orphaning every users_tables.profile_image
 * row that pointed at it. profile_image is kept as a small opaque token
 * (still just the old stored filename, reused as a cache-busting value in
 * api/avatar.php's URL) rather than the photo data itself.
 */
function ensure_users_table_profile_image_blob_columns(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    $result = $conn->query("SHOW COLUMNS FROM users_tables LIKE 'profile_image_data'");
    if (!$result || $result->num_rows === 0) {
        $conn->query("ALTER TABLE users_tables ADD COLUMN profile_image_data LONGBLOB DEFAULT NULL");
    }

    $result = $conn->query("SHOW COLUMNS FROM users_tables LIKE 'profile_image_mime'");
    if (!$result || $result->num_rows === 0) {
        $conn->query("ALTER TABLE users_tables ADD COLUMN profile_image_mime VARCHAR(100) DEFAULT NULL");
    }
}
