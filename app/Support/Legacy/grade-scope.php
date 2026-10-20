<?php

/**
 * Shared grade-scope helpers.
 *
 * A staff account's grade scope is stored on users_tables.Grade as a
 * comma-separated list of grade numbers, e.g. "7", "11,12", "7,8,9,10".
 * Empty/NULL means "no restriction" (fail-open) so schools that don't use
 * per-grade staff splitting are unaffected.
 *
 * Student/case/appointment grade values are messy free text ("Grade 7",
 * "7", or legacy codes "1"-"6" mapping to Grade 7-12), so everything here
 * normalizes through grade_text_variants()/normalize_grade_number().
 */

/**
 * users_tables.Grade doesn't exist on every deployment of this schema yet
 * (it's newer than the original table). Add it defensively the same way
 * api/follow-up.php does for its own columns — MySQL 8 has no "ADD COLUMN
 * IF NOT EXISTS", so existence is checked via SHOW COLUMNS first.
 */
function ensure_users_table_grade_column(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    $result = $conn->query("SHOW COLUMNS FROM users_tables LIKE 'Grade'");
    if ($result && $result->num_rows > 0) {
        return;
    }

    $conn->query("ALTER TABLE users_tables ADD COLUMN Grade VARCHAR(45) DEFAULT NULL");
}

// 7-12 = secondary grade numbers; 1-6 = elementary grade numbers (East/West/
// South schools, see schools.school_level). Both ranges are valid staff scope
// values — which one applies depends on the school the account belongs to.
function grade_scope_to_list(?string $scope): array {
    $scope = trim((string)$scope);
    if ($scope === '') {
        return [];
    }

    $grades = [];
    foreach (explode(',', $scope) as $part) {
        $num = (int)trim($part);
        if ($num >= 1 && $num <= 12) {
            $grades[] = $num;
        }
    }

    return array_values(array_unique($grades));
}

/** Legacy code (as used by referral-form.js's gradeMap) -> grade number. */
function grade_legacy_code_map(): array {
    return ['1' => 7, '2' => 8, '3' => 9, '4' => 10, '5' => 11, '6' => 12];
}

// $isElementary switches the accepted range to 1-6 (East/West/South schools)
// and turns off the legacy 1-6-code-means-grade-7-12 mapping, which only
// makes sense for secondary schools. Every existing caller omits it and
// keeps the original 7-12 behavior untouched.
function normalize_grade_number($rawGrade, bool $isElementary = false): ?int {
    $raw = trim((string)$rawGrade);
    if ($raw === '') {
        return null;
    }

    $min = $isElementary ? 1 : 7;
    $max = $isElementary ? 6 : 12;

    if (ctype_digit($raw)) {
        $num = (int)$raw;
        if ($num >= $min && $num <= $max) {
            return $num;
        }
        if (!$isElementary) {
            $legacy = grade_legacy_code_map();
            if (isset($legacy[$raw])) {
                return $legacy[$raw];
            }
        }
    }

    // Free-text fields (e.g. "Grade 10 - Section Alpha") — pull the first
    // grade-shaped number out of the string rather than requiring an exact match.
    if (preg_match('/grade\s*(\d{1,2})/i', $raw, $m)) {
        $num = (int)$m[1];
        if ($num >= $min && $num <= $max) {
            return $num;
        }
    }

    return null;
}

/** Expand grade numbers into every text form that might be stored for them. */
function grade_text_variants(array $gradeNumbers): array {
    $legacy = array_flip(grade_legacy_code_map());
    $variants = [];

    foreach ($gradeNumbers as $num) {
        $num = (int)$num;
        $variants[] = 'Grade ' . $num;
        $variants[] = (string)$num;
        if (isset($legacy[$num])) {
            $variants[] = (string)$legacy[$num];
        }
    }

    return array_values(array_unique($variants));
}

/** True if $schoolName's own school_level (schools.school_level) is
 *  East/West/South — the elementary levels, same convention as
 *  api/case-report.php's schools_are_elementary(). Used to pass the correct
 *  $isElementary flag into normalize_grade_number()/grade_matches_scope()
 *  wherever a single student's own school is known. Requires the `schools`
 *  table to already exist — callers ensure that via school-config.php's
 *  ensureSchoolsTable() first. Fails closed to false (secondary) if the
 *  school isn't found, matching every other level lookup's default.
 */
function school_is_elementary(mysqli $conn, string $schoolName): bool {
    $schoolName = trim($schoolName);
    if ($schoolName === '') {
        return false;
    }

    $stmt = $conn->prepare('SELECT school_level FROM schools WHERE school_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('s', $schoolName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return $row ? in_array($row['school_level'], ['East', 'West', 'South'], true) : false;
}

/** school_is_elementary() for a student identified only by their
 *  student_table.AccountID (student_table itself has no school column —
 *  school_attended lives on users_tables, joined by AccountID). Returns
 *  false (secondary) if $accountId is empty or has no matching account. */
function student_account_school_is_elementary(mysqli $conn, $accountId): bool {
    $accountId = (int)$accountId;
    if ($accountId <= 0) {
        return false;
    }

    $stmt = $conn->prepare('SELECT school_attended FROM users_tables WHERE AccountID = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('i', $accountId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return $row ? school_is_elementary($conn, (string)$row['school_attended']) : false;
}

/** True if $scopeGrades is empty (no restriction) or $rawGrade normalizes into it.
 *  $isElementary must match the student's own school's level — omitting it for
 *  an elementary student lets normalize_grade_number()'s legacy 1-6-means-7-12
 *  code fall back in and misread e.g. a literal "Grade 1" as the old code for
 *  "Grade 7", failing the match against every elementary scope. */
function grade_matches_scope(?string $rawGrade, array $scopeGrades, bool $isElementary = false): bool {
    if (empty($scopeGrades)) {
        return true;
    }

    $normalized = normalize_grade_number($rawGrade, $isElementary);
    if ($normalized === null) {
        return false;
    }

    return in_array($normalized, $scopeGrades, true);
}

/**
 * Build a `column IN (?,?,...)` fragment (plus bound params/types) for the
 * given grade scope. Returns null when the scope is empty (no restriction —
 * caller should simply skip adding a clause in that case).
 *
 * @return array{0:string,1:array,2:string}|null [$sql, $params, $types]
 */
function build_grade_in_clause(string $column, array $scopeGrades): ?array {
    if (empty($scopeGrades)) {
        return null;
    }

    $variants = grade_text_variants($scopeGrades);
    $placeholders = implode(',', array_fill(0, count($variants), '?'));

    return [
        "{$column} IN ({$placeholders})",
        $variants,
        str_repeat('s', count($variants))
    ];
}

/** Human label for a grade scope, e.g. "Grade 8" / "Grades 11-12" / "Grades 7-10". */
function grade_scope_label(array $scopeGrades): string {
    if (empty($scopeGrades)) {
        return '';
    }

    sort($scopeGrades);
    if (count($scopeGrades) === 1) {
        return 'Grade ' . $scopeGrades[0];
    }

    $isConsecutive = true;
    for ($i = 1; $i < count($scopeGrades); $i++) {
        if ($scopeGrades[$i] !== $scopeGrades[$i - 1] + 1) {
            $isConsecutive = false;
            break;
        }
    }

    if ($isConsecutive) {
        return 'Grades ' . $scopeGrades[0] . '-' . $scopeGrades[count($scopeGrades) - 1];
    }

    return 'Grades ' . implode(', ', $scopeGrades);
}
