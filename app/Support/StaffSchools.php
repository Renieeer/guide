<?php

namespace App\Support;

use App\Http\Middleware\EnsureActiveSession;
use mysqli;

/**
 * Which schools a guidance staff account (coordinator, counselor, or the
 * combined counselor-and-coordinator) works at.
 *
 * The SDO can assign one account to several schools, with its own role and
 * grade scope at each (staff_school_assignments). The account's CURRENT
 * school is still users_tables.school_attended / Type / Grade, which is what
 * the session guard and every permission check already read on each request.
 * Switching school (from the staff member's dashboard) copies the chosen
 * assignment into those three columns, so the rest of the app keeps working
 * unchanged — it always sees one school at a time.
 */
final class StaffSchools
{
    public const ROLES = ['coordinator', 'counselor', 'counselor-and-coordinator'];

    public const ROLE_LABELS = [
        'coordinator' => 'Coordinator/Focalperson',
        'counselor' => 'Counselor',
        'counselor-and-coordinator' => 'Coordinator & Counselor',
    ];

    /**
     * Creates the table if needed and makes sure every staff account's
     * current school is recorded as one of its assignments (covers accounts
     * created before multi-school assignments existed). Runs once per request.
     */
    public static function ensureTable(mysqli $conn): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;

        // school_code is joined to schools.school_code everywhere, so this
        // table uses exactly that column's character set and collation
        // (MySQL 8 databases default to utf8mb4_0900_ai_ci, older ones to
        // utf8mb4_unicode_ci; mixing them makes every join fail).
        [$charset, $collation] = self::schoolCodeCollation($conn);

        $conn->query("
            CREATE TABLE IF NOT EXISTS staff_school_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                account_id INT NOT NULL,
                school_code VARCHAR(120) NOT NULL,
                role VARCHAR(40) NOT NULL,
                grade VARCHAR(50) DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_account_school (account_id, school_code),
                KEY idx_school (school_code)
            ) ENGINE=InnoDB DEFAULT CHARSET={$charset} COLLATE={$collation}
        ");

        // A table created before this check (or before the schools table
        // changed) is converted to match.
        $current = $conn->query("
            SELECT COLLATION_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_school_assignments' AND COLUMN_NAME = 'school_code'
        ");
        $currentCollation = $current ? ($current->fetch_assoc()['COLLATION_NAME'] ?? null) : null;
        if ($currentCollation !== null && strcasecmp($currentCollation, $collation) !== 0) {
            $conn->query("ALTER TABLE staff_school_assignments CONVERT TO CHARACTER SET {$charset} COLLATE {$collation}");
        }

        // school_attended holds a school's name on newer rows and its code on
        // older ones, so both are matched. Converted explicitly so the match
        // works whatever character set/collation each table was created with.
        $conn->query("
            INSERT IGNORE INTO staff_school_assignments (account_id, school_code, role, grade)
            SELECT u.AccountID, s.school_code, u.Type, NULLIF(u.Grade, '')
            FROM users_tables u
            JOIN schools s ON (
                CONVERT(u.school_attended USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(s.school_name USING utf8mb4) COLLATE utf8mb4_unicode_ci
                OR CONVERT(u.school_attended USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(s.school_code USING utf8mb4) COLLATE utf8mb4_unicode_ci
            )
            WHERE u.Type IN ('coordinator', 'counselor', 'counselor-and-coordinator')
        ");
    }

    /** [charset, collation] of schools.school_code (safe identifiers only). */
    private static function schoolCodeCollation(mysqli $conn): array
    {
        $result = $conn->query("
            SELECT CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools' AND COLUMN_NAME = 'school_code'
        ");
        $row = $result ? $result->fetch_assoc() : null;
        $charset = (string)($row['CHARACTER_SET_NAME'] ?? '');
        $collation = (string)($row['COLLATION_NAME'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_]+$/', $charset) || !preg_match('/^[A-Za-z0-9_]+$/', $collation)) {
            return ['utf8mb4', 'utf8mb4_unicode_ci'];
        }
        return [$charset, $collation];
    }

    public static function roleLabel(string $role): string
    {
        return self::ROLE_LABELS[$role] ?? $role;
    }

    /** Adds an assignment. Returns false if the account already has one at that school. */
    public static function add(mysqli $conn, int $accountId, string $schoolCode, string $role, string $grade): bool
    {
        $stmt = $conn->prepare('INSERT IGNORE INTO staff_school_assignments (account_id, school_code, role, grade) VALUES (?, ?, ?, NULLIF(?, ""))');
        $stmt->bind_param('isss', $accountId, $schoolCode, $role, $grade);
        $stmt->execute();
        $added = $stmt->affected_rows > 0;
        $stmt->close();
        return $added;
    }

    /**
     * One account's schools (active schools only), current one first:
     * [{schoolCode, schoolName, schoolLevel, role, roleLabel, grade, isCurrent}].
     */
    public static function forAccount(mysqli $conn, int $accountId): array
    {
        $stmt = $conn->prepare("
            SELECT a.school_code, s.school_name, s.school_level, a.role, a.grade, u.school_attended
            FROM staff_school_assignments a
            JOIN schools s ON s.school_code = a.school_code AND s.is_active = 1
            JOIN users_tables u ON u.AccountID = a.account_id
            WHERE a.account_id = ?
            ORDER BY s.school_name ASC
        ");
        $stmt->bind_param('i', $accountId);
        $stmt->execute();
        $result = $stmt->get_result();

        $schools = [];
        while ($row = $result->fetch_assoc()) {
            $current = (string)($row['school_attended'] ?? '');
            $schools[] = [
                'schoolCode' => $row['school_code'],
                'schoolName' => $row['school_name'],
                'schoolLevel' => $row['school_level'] ?: 'Secondary',
                'role' => $row['role'],
                'roleLabel' => self::roleLabel($row['role']),
                'grade' => (string)($row['grade'] ?? ''),
                'isCurrent' => strcasecmp($current, $row['school_name']) === 0 || strcasecmp($current, $row['school_code']) === 0,
            ];
        }
        $stmt->close();

        usort($schools, fn ($a, $b) => ($b['isCurrent'] <=> $a['isCurrent']) ?: strcasecmp($a['schoolName'], $b['schoolName']));
        return $schools;
    }

    /**
     * Makes one of the account's assigned schools its current one: its
     * school, role and grade scope become the account's. Returns that
     * assignment, or null if the account isn't assigned to an active school
     * with that name or code.
     */
    public static function activate(mysqli $conn, int $accountId, string $school): ?array
    {
        foreach (self::forAccount($conn, $accountId) as $assignment) {
            if (strcasecmp($assignment['schoolName'], $school) !== 0 && strcasecmp($assignment['schoolCode'], $school) !== 0) {
                continue;
            }
            $stmt = $conn->prepare('UPDATE users_tables SET school_attended = ?, Type = ?, Grade = NULLIF(?, "") WHERE AccountID = ?');
            $stmt->bind_param('sssi', $assignment['schoolName'], $assignment['role'], $assignment['grade'], $accountId);
            $stmt->execute();
            $stmt->close();
            $assignment['isCurrent'] = true;
            return $assignment;
        }
        return null;
    }

    /**
     * Removes the account from one school. If that was its current school,
     * another of its schools becomes current. Returns the number of schools
     * the account still has. Callers never remove an account's last school
     * (they deactivate the account instead): ensureTable() would re-add the
     * school users_tables still points at.
     */
    public static function remove(mysqli $conn, int $accountId, string $schoolCode): int
    {
        $before = self::forAccount($conn, $accountId);
        $wasCurrent = false;
        foreach ($before as $assignment) {
            if ($assignment['schoolCode'] === $schoolCode && $assignment['isCurrent']) {
                $wasCurrent = true;
            }
        }

        $stmt = $conn->prepare('DELETE FROM staff_school_assignments WHERE account_id = ? AND school_code = ?');
        $stmt->bind_param('is', $accountId, $schoolCode);
        $stmt->execute();
        $stmt->close();

        $remaining = array_values(array_filter($before, fn ($a) => $a['schoolCode'] !== $schoolCode));
        if ($wasCurrent && !empty($remaining)) {
            self::activate($conn, $accountId, $remaining[0]['schoolCode']);
        }
        return count($remaining);
    }

    /** The page folder for a role ("counselor", "coordinator", "other-school"). */
    public static function dashboardFolder(string $role): string
    {
        foreach (EnsureActiveSession::ROLE_GROUPS as $folder => $roles) {
            if (in_array($role, $roles, true)) {
                return $folder;
            }
        }
        return '';
    }
}
