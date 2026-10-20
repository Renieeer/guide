<?php

function getDefaultSchoolSeeds(): array {
    return [
        ['school_code' => 'personas', 'school_name' => 'Personas National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'community-vocational', 'school_name' => 'Community Vocational High Schools', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'oriental-mindoro', 'school_name' => 'Oriental Mindoro National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'ceriaco-abes', 'school_name' => 'Ceriaco A. Abes Memorial National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'nag-iba', 'school_name' => 'Nag-iba National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'pedro-panaligan', 'school_name' => 'Pedro V Panaligan National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'parang', 'school_name' => 'Parang National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'managpi', 'school_name' => 'Managpi National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'buvayao', 'school_name' => 'Buvayao National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary'],
        ['school_code' => 'canubing', 'school_name' => 'Canubing National High School', 'assignment_type' => 'both', 'school_level' => 'Secondary']
    ];
}

function normalizeSchoolCode(string $schoolName): string {
    $code = strtolower(trim($schoolName));
    $code = preg_replace('/[^a-z0-9]+/', '-', $code) ?? '';
    $code = trim($code, '-');

    return $code !== '' ? $code : 'school';
}

function ensureSchoolsTable(mysqli $conn): void {
    $createTable = "CREATE TABLE IF NOT EXISTS schools (
        school_code varchar(120) NOT NULL,
        school_name varchar(255) NOT NULL,
        school_level enum('East','West','South','Secondary') NOT NULL DEFAULT 'Secondary',
        assignment_type enum('coordinator','counselor','both') NOT NULL DEFAULT 'both',
        is_active tinyint(1) NOT NULL DEFAULT '1',
        created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (school_code),
        UNIQUE KEY unique_school_name (school_name),
        KEY idx_school_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci";

    $conn->query($createTable);

    // `district` and `school_level` are newer than the original table shape
    // and MySQL 8 has no "ADD COLUMN IF NOT EXISTS", so existence is checked
    // via SHOW COLUMNS first (same pattern as api/follow-up.php / api/case-scenario.php).
    $districtColumn = $conn->query("SHOW COLUMNS FROM schools LIKE 'district'");
    if (!$districtColumn || $districtColumn->num_rows === 0) {
        $conn->query("ALTER TABLE schools ADD COLUMN district VARCHAR(100) DEFAULT NULL");
        $conn->query("ALTER TABLE schools ADD INDEX idx_school_district (district)");
    }

    // East/West/South are elementary-only levels; Secondary (the default)
    // covers every high school seeded/created before this column existed.
    $levelColumn = $conn->query("SHOW COLUMNS FROM schools LIKE 'school_level'");
    if (!$levelColumn || $levelColumn->num_rows === 0) {
        $conn->query("ALTER TABLE schools ADD COLUMN school_level ENUM('East','West','South','Secondary') NOT NULL DEFAULT 'Secondary'");
    }

    $stmt = $conn->prepare('INSERT IGNORE INTO schools (school_code, school_name, assignment_type, school_level, district, is_active) VALUES (?, ?, ?, ?, ?, 1)');
    if (!$stmt) {
        return;
    }

    foreach (getDefaultSchoolSeeds() as $school) {
        $stmt->bind_param(
            'sssss',
            $school['school_code'],
            $school['school_name'],
            $school['assignment_type'],
            $school['school_level'],
            $school['school_name']
        );
        $stmt->execute();
    }

    $stmt->close();
}

function buildAvailableRoles(string $assignmentType): array {
    $roles = ['student', 'teacher'];

    if ($assignmentType === 'coordinator' || $assignmentType === 'both') {
        $roles[] = 'coordinator';
    }

    if ($assignmentType === 'counselor' || $assignmentType === 'both') {
        $roles[] = 'counselor';
    }

    if ($assignmentType === 'both') {
        $roles[] = 'counselor-and-coordinator';
    }

    return array_values(array_unique($roles));
}

function getSchoolList(): array {
    $conn = legacy_db();

    ensureSchoolsTable($conn);

    $result = $conn->query('SELECT school_code, school_name, assignment_type, school_level, district FROM schools WHERE is_active = 1 ORDER BY school_name ASC');
    if (!$result) {
        return getDefaultSchoolSeeds();
    }

    $schools = [];
    while ($row = $result->fetch_assoc()) {
        $schools[] = [
            'school_code' => $row['school_code'],
            'school_name' => $row['school_name'],
            'assignment_type' => $row['assignment_type'],
            'school_level' => $row['school_level'] ?: 'Secondary',
            'district' => $row['district'],
            'availableRoles' => buildAvailableRoles((string)$row['assignment_type'])
        ];
    }

    return $schools ?: getDefaultSchoolSeeds();
}

function upsertSchoolRecord(mysqli $conn, string $schoolName, string $assignmentType, string $schoolLevel = 'Secondary'): array {
    ensureSchoolsTable($conn);

    $schoolName = trim($schoolName);
    $assignmentType = in_array($assignmentType, ['coordinator', 'counselor', 'both'], true) ? $assignmentType : 'both';
    $schoolLevel = in_array($schoolLevel, ['Secondary', 'East', 'West', 'South'], true) ? $schoolLevel : 'Secondary';

    $lookup = $conn->prepare('SELECT school_code, school_name FROM schools WHERE school_name = ? OR school_code = ? LIMIT 1');
    if ($lookup) {
        $baseCode = normalizeSchoolCode($schoolName);
        $lookup->bind_param('ss', $schoolName, $baseCode);
        $lookup->execute();
        $existing = $lookup->get_result()->fetch_assoc();
        $lookup->close();

        if ($existing) {
            $update = $conn->prepare('UPDATE schools SET assignment_type = ?, school_level = ?, is_active = 1, updated_at = NOW() WHERE school_code = ?');
            if ($update) {
                $update->bind_param('sss', $assignmentType, $schoolLevel, $existing['school_code']);
                $update->execute();
                $update->close();
            }

            return [
                'school_code' => $existing['school_code'],
                'school_name' => $existing['school_name'],
                'assignment_type' => $assignmentType,
                'school_level' => $schoolLevel
            ];
        }
    }

    $baseCode = normalizeSchoolCode($schoolName);
    $schoolCode = $baseCode;
    $suffix = 1;

    $check = $conn->prepare('SELECT school_code FROM schools WHERE school_code = ? LIMIT 1');
    if ($check) {
        while (true) {
            $check->bind_param('s', $schoolCode);
            $check->execute();
            $exists = $check->get_result()->fetch_assoc();

            if (!$exists) {
                break;
            }

            $schoolCode = $baseCode . '-' . $suffix;
            $suffix++;
        }
        $check->close();
    }

    // New schools default their district to their own name so they show up
    // as their own row in per-district reports right away, instead of being
    // lumped into "Unassigned" until someone remembers to set it manually.
    $insert = $conn->prepare('INSERT INTO schools (school_code, school_name, assignment_type, school_level, district, is_active) VALUES (?, ?, ?, ?, ?, 1)');
    if (!$insert) {
        throw new RuntimeException('Failed to prepare school insert statement');
    }

    $insert->bind_param('sssss', $schoolCode, $schoolName, $assignmentType, $schoolLevel, $schoolName);
    if (!$insert->execute()) {
        $insert->close();
        throw new RuntimeException('Failed to save school record');
    }
    $insert->close();

    return [
        'school_code' => $schoolCode,
        'school_name' => $schoolName,
        'assignment_type' => $assignmentType,
        'school_level' => $schoolLevel,
        'district' => $schoolName
    ];
}

/** Grade 1-6 for an elementary school_level (East/West/South), Grade 7-12
 *  for everything else (Secondary, or an unrecognized/blank school) — same
 *  East/West/South-is-elementary convention as api/case-report.php's
 *  schools_are_elementary(). */
function gradesForSchoolLevel(?string $schoolLevel): array {
    $isElementary = in_array($schoolLevel, ['East', 'West', 'South'], true);
    $numbers = $isElementary ? range(1, 6) : range(7, 12);

    return [
        'isElementary' => $isElementary,
        'grades' => array_map(static fn($n) => ['id' => $n, 'grade_name' => "Grade $n"], $numbers)
    ];
}

function getSchoolConfig(string $school): ?array {
    $conn = legacy_db();

    ensureSchoolsTable($conn);

    $school = trim($school);
    if ($school === '') {
        return null;
    }

    $stmt = $conn->prepare('SELECT school_code, school_name, assignment_type, school_level, district FROM schools WHERE school_code = ? OR school_name = ? LIMIT 1');
    if (!$stmt) {
        return null;
    }

    $stmt->bind_param('ss', $school, $school);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return null;
    }

    return [
        'schoolCode' => $row['school_code'],
        'schoolName' => $row['school_name'],
        'assignmentType' => $row['assignment_type'],
        'schoolLevel' => $row['school_level'] ?: 'Secondary',
        'district' => $row['district'],
        'type' => 'school',
        'availableRoles' => buildAvailableRoles((string)($row['assignment_type'] ?? 'both'))
    ];
}
