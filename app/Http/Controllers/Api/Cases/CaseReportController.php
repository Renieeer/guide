<?php

namespace App\Http\Controllers\Api\Cases;

use App\Http\Controllers\Controller;
use mysqli;

class CaseReportController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        ensureSchoolsTable($conn);

        $action = $_GET['action'] ?? 'categories';

        /* ── CATEGORY x GRADE x GENDER BREAKDOWN ──
           Real source: counselor_case_scenarios (section/category set by the
           counselor's case workflow) + student_table for authoritative grade/sex
           (students_json only carries a display string, not queryable fields). */
        if ($action === 'categories') {
            $school = trim((string)($_GET['school'] ?? ''));
            $district = trim((string)($_GET['district'] ?? ''));
            $gradeScope = grade_scope_to_list($_GET['grade_scope'] ?? '');

            $period = trim((string)($_GET['period'] ?? 'all'));
            $rangeStart = trim((string)($_GET['start'] ?? ''));
            $rangeEnd = trim((string)($_GET['end'] ?? ''));
            [$dateSql, $dateTypes, $dateValues] = $this->case_date_condition($period, $rangeStart, $rangeEnd);

            $schoolNames = [];
            if ($school !== '') {
                $schoolNames = [$school];
            } elseif (strcasecmp($district, 'all') === 0) {
                $schoolNames = $this->all_active_school_names($conn);
            } elseif ($district !== '') {
                $schoolNames = $this->schools_in_district($conn, $district);
            }

            // Each school's own level decides how ITS cases' grades are read —
            // East/West/South (elementary) schools use 1-6, everything else uses
            // 7-12. A selection spanning both kinds (e.g. "All Districts") reports
            // both ranges side by side instead of picking one and silently
            // dropping the other's cases.
            $levelMap = $this->schools_level_map($conn, $schoolNames);
            $levelsPresent = array_unique(array_values($levelMap));
            $hasElementary = !empty(array_intersect($levelsPresent, ['East', 'West', 'South']));
            $hasSecondary = in_array('Secondary', $levelsPresent, true) || empty($levelsPresent);
            $isElementary = $hasElementary && !$hasSecondary;

            $gradeKeys = [];
            if ($hasElementary) {
                $gradeKeys = array_merge($gradeKeys, ['1', '2', '3', '4', '5', '6']);
            }
            if ($hasSecondary) {
                $gradeKeys = array_merge($gradeKeys, ['7', '8', '9', '10', '11', '12']);
            }

            $sections = $this->fetch_sections($conn);

            // Seed every real category (plus one "uncategorized" bucket per section,
            // for cases whose category hasn't been chosen yet) with zeros, so the
            // frontend always gets a complete, predictable shape.
            $counts = [];
            foreach ($sections as $section) {
                foreach ($section['categories'] as $cat) {
                    $counts[$cat['categoryId']] = $this->zero_grade_buckets($gradeKeys);
                }
                $counts['section-' . $section['sectionId'] . '-uncategorized'] = $this->zero_grade_buckets($gradeKeys);
            }

            if ($this->table_exists($conn, 'counselor_case_scenarios') && !empty($schoolNames)) {
                $placeholders = implode(',', array_fill(0, count($schoolNames), '?'));
                $types = str_repeat('s', count($schoolNames));
                $stmt = $conn->prepare("
            SELECT case_uid, school_attended, section_id, category_id, students_json
            FROM counselor_case_scenarios
            WHERE school_attended IN ($placeholders)$dateSql
        ");

                if ($stmt) {
                    $bindTypes = $types . $dateTypes;
                    $bindValues = array_merge($schoolNames, $dateValues);
                    $stmt->bind_param($bindTypes, ...$bindValues);
                    $stmt->execute();
                    $result = $stmt->get_result();

                    $caseRows = [];
                    $studentIds = [];
                    while ($row = $result->fetch_assoc()) {
                        $students = json_decode((string)$row['students_json'], true) ?: [];
                        $ids = [];
                        foreach ($students as $s) {
                            $role = trim((string)($s['role'] ?? ''));
                            if (!$this->case_report_role_is_primary($role)) {
                                continue;
                            }
                            $sid = trim((string)($s['id'] ?? $s['StudentId'] ?? $s['studentId'] ?? ''));
                            if ($sid !== '') {
                                $ids[] = $sid;
                                $studentIds[$sid] = true;
                            }
                        }
                        $caseRows[] = [
                            'caseUid' => $row['case_uid'],
                            'school' => (string)$row['school_attended'],
                            'sectionId' => (string)$row['section_id'],
                            'categoryId' => trim((string)($row['category_id'] ?? '')),
                            'studentIds' => $ids
                        ];
                    }
                    $stmt->close();

                    $caseRows = $this->backfill_case_categories($conn, $caseRows);

                    $studentInfo = [];
                    if (!empty($studentIds)) {
                        $idList = array_keys($studentIds);
                        $idPlaceholders = implode(',', array_fill(0, count($idList), '?'));
                        $idTypes = str_repeat('s', count($idList));
                        $studentStmt = $conn->prepare("SELECT StudentId, Grade, Sex FROM student_table WHERE StudentId IN ($idPlaceholders)");
                        if ($studentStmt) {
                            $studentStmt->bind_param($idTypes, ...$idList);
                            $studentStmt->execute();
                            $studentResult = $studentStmt->get_result();
                            while ($srow = $studentResult->fetch_assoc()) {
                                // Grade stays raw here — normalizing it depends on
                                // which school the case referencing this student
                                // belongs to (a mixed "All Districts" selection can
                                // have the same student's raw grade text mean
                                // different things at different schools), so that
                                // happens per-case below instead of once here.
                                $studentInfo[$srow['StudentId']] = [
                                    'gradeRaw' => $srow['Grade'],
                                    'sex' => (string)($srow['Sex'] ?? '')
                                ];
                            }
                            $studentStmt->close();
                        }
                    }

                    foreach ($caseRows as $caseRow) {
                        $bucketKey = $caseRow['categoryId'] !== ''
                            ? $caseRow['categoryId']
                            : 'section-' . $caseRow['sectionId'] . '-uncategorized';

                        if (!isset($counts[$bucketKey])) {
                            $counts[$bucketKey] = $this->zero_grade_buckets($gradeKeys);
                        }

                        $caseIsElementary = in_array($levelMap[$caseRow['school']] ?? 'Secondary', ['East', 'West', 'South'], true);

                        foreach ($caseRow['studentIds'] as $sid) {
                            $info = $studentInfo[$sid] ?? null;
                            if (!$info) {
                                continue;
                            }

                            $grade = normalize_grade_number($info['gradeRaw'], $caseIsElementary);
                            if ($grade === null) {
                                continue;
                            }
                            if (!empty($gradeScope) && !in_array($grade, $gradeScope, true)) {
                                continue;
                            }

                            $gradeKey = (string)$grade;
                            if (!isset($counts[$bucketKey][$gradeKey])) {
                                $counts[$bucketKey][$gradeKey] = ['m' => 0, 'f' => 0];
                            }
                            if ($info['sex'] === 'Male') {
                                $counts[$bucketKey][$gradeKey]['m']++;
                            } elseif ($info['sex'] === 'Female') {
                                $counts[$bucketKey][$gradeKey]['f']++;
                            }
                        }
                    }
                }
            }

            $this->send_json(200, [
                'success' => true,
                'grades' => array_map('intval', $gradeKeys),
                'isElementary' => $isElementary,
                'sections' => $sections,
                'counts' => $counts
            ]);
        }

        /* ── INDIVIDUAL CASE LIST (filterable, "search results" style) ──
           Same real source as 'categories' (counselor_case_scenarios joined against
           student_table for authoritative grade/sex) but returns one row per case
           instead of pre-aggregated counts, so the frontend can filter by any
           combination of period/category/grade/gender/status/free-text search and
           render a list of matching cases instead of the pivot table. */
        if ($action === 'list') {
            $school = trim((string)($_GET['school'] ?? ''));
            $district = trim((string)($_GET['district'] ?? ''));
            $gradeScope = grade_scope_to_list($_GET['grade_scope'] ?? '');

            $period = trim((string)($_GET['period'] ?? 'all'));
            $rangeStart = trim((string)($_GET['start'] ?? ''));
            $rangeEnd = trim((string)($_GET['end'] ?? ''));
            [$dateSql, $dateTypes, $dateValues] = $this->case_date_condition($period, $rangeStart, $rangeEnd);

            $categoryFilter = trim((string)($_GET['category'] ?? ''));
            $gradeFilter = trim((string)($_GET['grade'] ?? ''));
            $genderFilter = trim((string)($_GET['gender'] ?? ''));
            $statusFilter = trim((string)($_GET['status'] ?? ''));
            $search = strtolower(trim((string)($_GET['search'] ?? '')));

            $schoolNames = [];
            if ($school !== '') {
                $schoolNames = [$school];
            } elseif ($district !== '') {
                $schoolNames = $this->schools_in_district($conn, $district);
            }

            $isElementary = $this->schools_are_elementary($conn, $schoolNames);

            $rows = [];

            if ($this->table_exists($conn, 'counselor_case_scenarios') && !empty($schoolNames)) {
                $placeholders = implode(',', array_fill(0, count($schoolNames), '?'));
                $types = str_repeat('s', count($schoolNames));
                $stmt = $conn->prepare("
            SELECT id, case_uid, counselor_name, section_id, section_name, category_id, category_name,
                   case_title, case_date, case_summary, status, students_json
            FROM counselor_case_scenarios
            WHERE school_attended IN ($placeholders)$dateSql
            ORDER BY case_date DESC, id DESC
        ");

                if ($stmt) {
                    $bindTypes = $types . $dateTypes;
                    $bindValues = array_merge($schoolNames, $dateValues);
                    $stmt->bind_param($bindTypes, ...$bindValues);
                    $stmt->execute();
                    $result = $stmt->get_result();

                    $caseRows = [];
                    $studentIds = [];
                    while ($row = $result->fetch_assoc()) {
                        $students = json_decode((string)$row['students_json'], true) ?: [];
                        $primary = null;
                        foreach ($students as $s) {
                            $role = trim((string)($s['role'] ?? ''));
                            if ($this->case_report_role_is_primary($role)) {
                                $primary = $s;
                                break;
                            }
                        }
                        if (!$primary && !empty($students)) {
                            $primary = $students[0];
                        }
                        $sid = $primary ? trim((string)($primary['id'] ?? '')) : '';
                        if ($sid !== '') {
                            $studentIds[$sid] = true;
                        }

                        $caseRows[] = [
                            'id' => (int)$row['id'],
                            'caseUid' => $row['case_uid'],
                            'counselorName' => $row['counselor_name'],
                            'sectionId' => (string)$row['section_id'],
                            'sectionName' => $row['section_name'],
                            'categoryId' => trim((string)($row['category_id'] ?? '')),
                            'categoryName' => trim((string)($row['category_name'] ?? '')),
                            'caseTitle' => $row['case_title'],
                            'caseDate' => $row['case_date'],
                            'summary' => $row['case_summary'],
                            'status' => $row['status'] ?: 'pending',
                            'studentId' => $sid,
                            'studentName' => $primary['name'] ?? 'Unknown student'
                        ];
                    }
                    $stmt->close();

                    // counselor_case_scenarios.category_id/category_name are never
                    // actually populated any more — category moved to being
                    // recorded per student, per follow-up (see saveFollowUp() in
                    // counseling.js) instead of once on the case itself — so every
                    // case fell back to "Uncategorized" here even when its
                    // follow-ups clearly had a category. Backfill each case's
                    // category from its own most recent follow_up row instead,
                    // matching what the counselor's own "Recent drafts" list
                    // already shows (getRecordCategoryNames() in counseling.js).
                    if (!empty($caseRows) && $this->table_exists($conn, 'follow_up')) {
                        $caseUids = array_values(array_unique(array_column($caseRows, 'caseUid')));
                        $uidPlaceholders = implode(',', array_fill(0, count($caseUids), '?'));
                        $uidTypes = str_repeat('s', count($caseUids));
                        $fuStmt = $conn->prepare("
                    SELECT case_uid, category_id, category_name
                    FROM follow_up
                    WHERE case_uid IN ($uidPlaceholders) AND category_name IS NOT NULL AND category_name != ''
                    ORDER BY created_at DESC, Follow_id DESC
                ");
                        if ($fuStmt) {
                            $fuStmt->bind_param($uidTypes, ...$caseUids);
                            $fuStmt->execute();
                            $fuResult = $fuStmt->get_result();
                            $latestCategoryByCase = [];
                            while ($fuRow = $fuResult->fetch_assoc()) {
                                // First row seen per case_uid is its most recent
                                // (ORDER BY created_at DESC above) — don't let an
                                // older follow-up overwrite it.
                                if (!isset($latestCategoryByCase[$fuRow['case_uid']])) {
                                    $latestCategoryByCase[$fuRow['case_uid']] = [
                                        'id' => (string)$fuRow['category_id'],
                                        'name' => $fuRow['category_name']
                                    ];
                                }
                            }
                            $fuStmt->close();

                            foreach ($caseRows as &$caseRow) {
                                if ($caseRow['categoryName'] === '' && isset($latestCategoryByCase[$caseRow['caseUid']])) {
                                    $caseRow['categoryId'] = $latestCategoryByCase[$caseRow['caseUid']]['id'];
                                    $caseRow['categoryName'] = $latestCategoryByCase[$caseRow['caseUid']]['name'];
                                }
                            }
                            unset($caseRow);
                        }
                    }
                    foreach ($caseRows as &$caseRow) {
                        if ($caseRow['categoryName'] === '') {
                            $caseRow['categoryName'] = 'Uncategorized';
                        }
                    }
                    unset($caseRow);

                    $studentInfo = [];
                    if (!empty($studentIds)) {
                        $idList = array_keys($studentIds);
                        $idPlaceholders = implode(',', array_fill(0, count($idList), '?'));
                        $idTypes = str_repeat('s', count($idList));
                        $studentStmt = $conn->prepare("SELECT StudentId, Grade, Sex FROM student_table WHERE StudentId IN ($idPlaceholders)");
                        if ($studentStmt) {
                            $studentStmt->bind_param($idTypes, ...$idList);
                            $studentStmt->execute();
                            $studentResult = $studentStmt->get_result();
                            while ($srow = $studentResult->fetch_assoc()) {
                                $studentInfo[$srow['StudentId']] = [
                                    'grade' => normalize_grade_number($srow['Grade'], $isElementary),
                                    'sex' => (string)($srow['Sex'] ?? '')
                                ];
                            }
                            $studentStmt->close();
                        }
                    }

                    foreach ($caseRows as $case) {
                        $info = $case['studentId'] !== '' ? ($studentInfo[$case['studentId']] ?? null) : null;
                        $grade = $info['grade'] ?? null;
                        $sex = $info['sex'] ?? '';

                        if (!empty($gradeScope) && ($grade === null || !in_array($grade, $gradeScope, true))) {
                            continue;
                        }
                        if ($gradeFilter !== '' && (string)$grade !== $gradeFilter) {
                            continue;
                        }
                        if ($genderFilter !== '' && $sex !== $genderFilter) {
                            continue;
                        }
                        if ($categoryFilter !== '') {
                            $bucketKey = $case['categoryId'] !== '' ? $case['categoryId'] : ('section-' . $case['sectionId'] . '-uncategorized');
                            if ($bucketKey !== $categoryFilter) {
                                continue;
                            }
                        }
                        if ($statusFilter !== '' && strcasecmp((string)$case['status'], $statusFilter) !== 0) {
                            continue;
                        }
                        if ($search !== '') {
                            $haystack = strtolower($case['studentName'] . ' ' . $case['caseTitle'] . ' ' . $case['categoryName'] . ' ' . $case['sectionName'] . ' ' . $case['summary'] . ' ' . $case['caseUid']);
                            if (strpos($haystack, $search) === false) {
                                continue;
                            }
                        }

                        $rows[] = [
                            'id' => $case['id'],
                            'caseUid' => $case['caseUid'],
                            'studentName' => $case['studentName'],
                            'grade' => $grade,
                            'gender' => $sex,
                            'sectionName' => $case['sectionName'],
                            'categoryName' => $case['categoryName'],
                            'caseTitle' => $case['caseTitle'],
                            'caseDate' => $case['caseDate'],
                            'summary' => $case['summary'],
                            'status' => $case['status'],
                            'counselorName' => $case['counselorName']
                        ];
                    }
                }
            }

            $this->send_json(200, ['success' => true, 'data' => $rows]);
        }

        /* ── DISTINCT DISTRICT LIST ── (for building district selector buttons) */
        if ($action === 'districts') {
            $result = $conn->query("SELECT DISTINCT district FROM schools WHERE is_active = 1 AND district IS NOT NULL AND district <> '' ORDER BY district ASC");
            $districts = [];
            if ($result) {
                while ($row = $result->fetch_assoc()) {
                    $districts[] = $row['district'];
                }
            }

            $unassignedCheck = $conn->query("SELECT 1 FROM schools WHERE is_active = 1 AND (district IS NULL OR district = '') LIMIT 1");
            $hasUnassigned = $unassignedCheck && $unassignedCheck->num_rows > 0;

            $this->send_json(200, ['success' => true, 'districts' => $districts, 'hasUnassigned' => $hasUnassigned]);
        }

        /* ── PER-SCHOOL CASE + GENDER BREAKDOWN ──
           Backs the district report's "one row per school" view: for a specific
           district, or every active school when district=all ("All Districts" —
           no need to pick each district/school individually), return each school's
           total case count and Male/Female split. Same counting rule as
           'categories' (one primary student per case = one count) but summed per
           school instead of per category/grade. */
        if ($action === 'school_breakdown') {
            $district = trim((string)($_GET['district'] ?? ''));
            $period = trim((string)($_GET['period'] ?? 'all'));
            $rangeStart = trim((string)($_GET['start'] ?? ''));
            $rangeEnd = trim((string)($_GET['end'] ?? ''));
            // Optional school_level narrowing ('Secondary'/'East'/'West'/'South') for
            // the Cases by School export's School Level picker — same levels/blank-
            // defaults-to-Secondary convention as the DMMR export below.
            $level = trim((string)($_GET['level'] ?? ''));
            // Optional Section/Case Category narrowing — same sectionId/categoryId
            // shape as the 'categories' action (see fetch_sections()), so a
            // school's total only counts cases under the picked section/category
            // instead of every case at that school.
            $sectionFilter = trim((string)($_GET['section'] ?? ''));
            $categoryFilter = trim((string)($_GET['category'] ?? ''));

            [$dateSql, $dateTypes, $dateValues] = $this->case_date_condition($period, $rangeStart, $rangeEnd);

            $schools = [];
            if ($district !== '' && strcasecmp($district, 'all') !== 0) {
                $districtLabel = strcasecmp($district, 'Unassigned') === 0 ? 'Unassigned' : $district;
                $namesInDistrict = $this->schools_in_district($conn, $district);
                $levelMap = $this->schools_level_map($conn, $namesInDistrict);
                foreach ($namesInDistrict as $name) {
                    $schoolLevel = $levelMap[$name] ?? 'Secondary';
                    if ($level !== '' && strcasecmp($level, 'all') !== 0 && strcasecmp($schoolLevel, $level) !== 0) {
                        continue;
                    }
                    $schools[$name] = ['school' => $name, 'district' => $districtLabel, 'total' => 0, 'male' => 0, 'female' => 0];
                }
            } else {
                $result = $conn->query("SELECT school_name, COALESCE(NULLIF(district, ''), 'Unassigned') AS district, COALESCE(NULLIF(school_level, ''), 'Secondary') AS school_level FROM schools WHERE is_active = 1 ORDER BY district ASC, school_name ASC");
                if ($result) {
                    while ($row = $result->fetch_assoc()) {
                        if ($level !== '' && strcasecmp($level, 'all') !== 0 && strcasecmp($row['school_level'], $level) !== 0) {
                            continue;
                        }
                        $schools[$row['school_name']] = ['school' => $row['school_name'], 'district' => $row['district'], 'total' => 0, 'male' => 0, 'female' => 0];
                    }
                }
            }

            $schoolNames = array_keys($schools);

            if ($this->table_exists($conn, 'counselor_case_scenarios') && !empty($schoolNames)) {
                $placeholders = implode(',', array_fill(0, count($schoolNames), '?'));
                $types = str_repeat('s', count($schoolNames));
                $stmt = $conn->prepare("
            SELECT case_uid, school_attended, section_id, category_id, students_json
            FROM counselor_case_scenarios
            WHERE school_attended IN ($placeholders)$dateSql
        ");

                if ($stmt) {
                    $bindTypes = $types . $dateTypes;
                    $bindValues = array_merge($schoolNames, $dateValues);
                    $stmt->bind_param($bindTypes, ...$bindValues);
                    $stmt->execute();
                    $result = $stmt->get_result();

                    $caseRows = [];
                    $studentIds = [];
                    while ($row = $result->fetch_assoc()) {
                        $students = json_decode((string)$row['students_json'], true) ?: [];
                        $ids = [];
                        foreach ($students as $s) {
                            $role = trim((string)($s['role'] ?? ''));
                            if (!$this->case_report_role_is_primary($role)) {
                                continue;
                            }
                            $sid = trim((string)($s['id'] ?? $s['StudentId'] ?? $s['studentId'] ?? ''));
                            if ($sid !== '') {
                                $ids[] = $sid;
                                $studentIds[$sid] = true;
                            }
                        }
                        $caseRows[] = [
                            'caseUid' => $row['case_uid'],
                            'school' => (string)$row['school_attended'],
                            'sectionId' => (string)$row['section_id'],
                            'categoryId' => trim((string)($row['category_id'] ?? '')),
                            'studentIds' => $ids
                        ];
                    }
                    $stmt->close();

                    $caseRows = $this->backfill_case_categories($conn, $caseRows);

                    if ($sectionFilter !== '' && strcasecmp($sectionFilter, 'all') !== 0) {
                        $caseRows = array_values(array_filter($caseRows, function ($c) use ($sectionFilter) {
                            return $c['sectionId'] === $sectionFilter;
                        }));
                    }
                    if ($categoryFilter !== '' && strcasecmp($categoryFilter, 'all') !== 0) {
                        // A blank categoryId (never actually chosen, even after the
                        // follow_up backfill above) can never match a real picked
                        // category — only the section's own 'section-N-uncategorized'
                        // bucket key would, and that's not a selectable dropdown
                        // option here.
                        $caseRows = array_values(array_filter($caseRows, function ($c) use ($categoryFilter) {
                            return $c['categoryId'] === $categoryFilter;
                        }));
                    }

                    // Recomputed from the filtered case rows, not the full query
                    // result above — a section/category filter can drop cases
                    // whose students would otherwise still be looked up.
                    $studentIds = [];
                    foreach ($caseRows as $caseRow) {
                        foreach ($caseRow['studentIds'] as $sid) {
                            $studentIds[$sid] = true;
                        }
                    }

                    $studentSex = [];
                    if (!empty($studentIds)) {
                        $idList = array_keys($studentIds);
                        $idPlaceholders = implode(',', array_fill(0, count($idList), '?'));
                        $idTypes = str_repeat('s', count($idList));
                        $studentStmt = $conn->prepare("SELECT StudentId, Sex FROM student_table WHERE StudentId IN ($idPlaceholders)");
                        if ($studentStmt) {
                            $studentStmt->bind_param($idTypes, ...$idList);
                            $studentStmt->execute();
                            $studentResult = $studentStmt->get_result();
                            while ($srow = $studentResult->fetch_assoc()) {
                                $studentSex[$srow['StudentId']] = (string)($srow['Sex'] ?? '');
                            }
                            $studentStmt->close();
                        }
                    }

                    foreach ($caseRows as $caseRow) {
                        if (!isset($schools[$caseRow['school']])) {
                            continue;
                        }
                        foreach ($caseRow['studentIds'] as $sid) {
                            $sex = $studentSex[$sid] ?? '';
                            $schools[$caseRow['school']]['total']++;
                            if ($sex === 'Male') {
                                $schools[$caseRow['school']]['male']++;
                            } elseif ($sex === 'Female') {
                                $schools[$caseRow['school']]['female']++;
                            }
                        }
                    }
                }
            }

            $this->send_json(200, ['success' => true, 'schools' => array_values($schools)]);
        }

        /* ── PER-DISTRICT ROLLUP ── (schools, staff headcounts, referrals, resolution)
           Real source: schools.district joined against users_tables/referral by
           school name — replaces the old Math.random() comparative tables in
           pages/sdo/analytics.js and pages/sdo/school-reports.js. */
        if ($action === 'district_summary') {
            $period = trim((string)($_GET['period'] ?? 'all'));
            $rangeStart = trim((string)($_GET['start'] ?? ''));
            $rangeEnd = trim((string)($_GET['end'] ?? ''));
            [$dateSql, $dateTypes, $dateValues] = $this->case_date_condition($period, $rangeStart, $rangeEnd, 'r.date_submitted');

            $staffQuery = $conn->query("
        SELECT
            COALESCE(NULLIF(s.district, ''), 'Unassigned') AS district,
            COUNT(DISTINCT s.school_code) AS school_count,
            SUM(CASE WHEN u.Type = 'teacher' THEN 1 ELSE 0 END) AS teacher_count,
            SUM(CASE WHEN u.Type IN ('coordinator', 'counselor-and-coordinator') THEN 1 ELSE 0 END) AS coordinator_count,
            SUM(CASE WHEN u.Type IN ('counselor', 'counselor-and-coordinator') THEN 1 ELSE 0 END) AS counselor_count
        FROM schools s
        LEFT JOIN users_tables u ON u.school_attended = s.school_name
        WHERE s.is_active = 1
        GROUP BY district
    ");

            $districts = [];
            if ($staffQuery) {
                while ($row = $staffQuery->fetch_assoc()) {
                    $districts[$row['district']] = [
                        'district' => $row['district'],
                        'schoolCount' => (int)$row['school_count'],
                        'teacherCount' => (int)$row['teacher_count'],
                        'coordinatorCount' => (int)$row['coordinator_count'],
                        'counselorCount' => (int)$row['counselor_count'],
                        'referralCount' => 0,
                        'studentsReferred' => 0,
                        'resolvedCount' => 0,
                        'lastActivity' => null
                    ];
                }
            }

            // Joined on a single resolved school per referral (the student's own
            // school, falling back to the referring staff's school) rather than
            // "school_attended = ? OR student_school = ?" — with a plain equality
            // that OR would have matched two different schools.rows for the same
            // referral whenever those two columns disagree, double-counting it
            // into two districts.
            $referralSql = "
        SELECT
            COALESCE(NULLIF(s.district, ''), 'Unassigned') AS district,
            COUNT(r.ReferralID) AS referral_count,
            COUNT(DISTINCT COALESCE(r.student_id, r.StudentID)) AS students_referred,
            SUM(CASE WHEN COALESCE(r.stage, 1) = 7 THEN 1 ELSE 0 END) AS resolved_count,
            MAX(COALESCE(r.updated_at, r.date_submitted)) AS last_activity
        FROM schools s
        LEFT JOIN referral r ON COALESCE(NULLIF(r.student_school, ''), r.school_attended) = s.school_name$dateSql
        WHERE s.is_active = 1
        GROUP BY district
    ";
            $referralStmt = $conn->prepare($referralSql);
            $referralQuery = false;
            if ($referralStmt) {
                if ($dateTypes !== '') {
                    $referralStmt->bind_param($dateTypes, ...$dateValues);
                }
                $referralStmt->execute();
                $referralQuery = $referralStmt->get_result();
            }

            if ($referralQuery) {
                while ($row = $referralQuery->fetch_assoc()) {
                    $district = $row['district'];
                    if (!isset($districts[$district])) {
                        $districts[$district] = [
                            'district' => $district,
                            'schoolCount' => 0,
                            'teacherCount' => 0,
                            'coordinatorCount' => 0,
                            'counselorCount' => 0,
                            'referralCount' => 0,
                            'studentsReferred' => 0,
                            'resolvedCount' => 0,
                            'lastActivity' => null
                        ];
                    }
                    $districts[$district]['referralCount'] = (int)$row['referral_count'];
                    $districts[$district]['studentsReferred'] = (int)$row['students_referred'];
                    $districts[$district]['resolvedCount'] = (int)$row['resolved_count'];
                    $districts[$district]['lastActivity'] = $row['last_activity'];
                }
            }

            $this->send_json(200, ['success' => true, 'districts' => array_values($districts)]);
        }

        /* ── PERSONAL-SOCIAL CONCERNS, PER SCHOOL LEVEL ──
           Backs the "Division Monthly Monitoring Report of Learners' Personal-Social
           Concerns" export. Same section/category set as 'categories' (every real
           section and category — plus one "uncategorized" bucket per section for
           cases whose category hasn't been chosen yet — so the report covers 100%
           of case data, not a curated subset) and the same "one count per primary
           student" counting rule as 'categories'/'school_breakdown', but bucketed
           by the case's school's school_level (Secondary/East/West/South — set
           per-school in School Management's Add School modal) instead of by grade.
           The four columns are mutually exclusive: a school's cases land in exactly
           the one column matching its own level, never also into a division-wide
           total. */
        if ($action === 'personal_social_concerns') {
            $period = trim((string)($_GET['period'] ?? 'all'));
            $rangeStart = trim((string)($_GET['start'] ?? ''));
            $rangeEnd = trim((string)($_GET['end'] ?? ''));
            [$dateSql, $dateTypes, $dateValues] = $this->case_date_condition($period, $rangeStart, $rangeEnd);

            $groups = ['Secondary', 'East', 'West', 'South'];

            $schoolLevel = [];
            $result = $conn->query("SELECT school_name, COALESCE(NULLIF(school_level, ''), 'Secondary') AS school_level FROM schools WHERE is_active = 1");
            if ($result) {
                while ($row = $result->fetch_assoc()) {
                    $schoolLevel[$row['school_name']] = $row['school_level'];
                }
            }

            $sections = $this->fetch_sections($conn);

            // Seed every real category (+ one uncategorized bucket per section) at
            // zero for every group, so the frontend always gets a complete,
            // predictable shape covering every category — not just the ones that
            // happen to already have cases.
            $counts = [];
            foreach ($groups as $g) {
                $counts[$g] = [];
            }
            foreach (array_keys($counts) as $groupKey) {
                foreach ($sections as $section) {
                    foreach ($section['categories'] as $cat) {
                        $counts[$groupKey][$cat['categoryId']] = 0;
                    }
                    $counts[$groupKey]['section-' . $section['sectionId'] . '-uncategorized'] = 0;
                }
            }

            if ($this->table_exists($conn, 'counselor_case_scenarios')) {
                $stmt = $conn->prepare("SELECT case_uid, school_attended, section_id, category_id, students_json FROM counselor_case_scenarios WHERE 1=1$dateSql");
                if ($stmt) {
                    if ($dateTypes !== '') {
                        $stmt->bind_param($dateTypes, ...$dateValues);
                    }
                    $stmt->execute();
                    $result = $stmt->get_result();

                    $rows = [];
                    while ($row = $result->fetch_assoc()) {
                        $rows[] = $row;
                    }
                    $stmt->close();

                    // counselor_case_scenarios.category_id is never actually
                    // populated any more — category moved to being recorded per
                    // student, per follow-up (see saveFollowUp() in counseling.js)
                    // instead of once on the case itself — so every case fell into
                    // its section's "uncategorized" bucket here even when its
                    // follow-ups clearly had a category. Backfill each case's
                    // category from its own most recent follow_up row instead,
                    // same as the 'categories' action above.
                    $latestCategoryByCase = [];
                    if (!empty($rows) && $this->table_exists($conn, 'follow_up')) {
                        $caseUids = array_values(array_unique(array_column($rows, 'case_uid')));
                        $uidPlaceholders = implode(',', array_fill(0, count($caseUids), '?'));
                        $uidTypes = str_repeat('s', count($caseUids));
                        $fuStmt = $conn->prepare("
                    SELECT case_uid, category_id
                    FROM follow_up
                    WHERE case_uid IN ($uidPlaceholders) AND category_id IS NOT NULL AND category_id != ''
                    ORDER BY created_at DESC, Follow_id DESC
                ");
                        if ($fuStmt) {
                            $fuStmt->bind_param($uidTypes, ...$caseUids);
                            $fuStmt->execute();
                            $fuResult = $fuStmt->get_result();
                            while ($fuRow = $fuResult->fetch_assoc()) {
                                if (!isset($latestCategoryByCase[$fuRow['case_uid']])) {
                                    $latestCategoryByCase[$fuRow['case_uid']] = (string)$fuRow['category_id'];
                                }
                            }
                            $fuStmt->close();
                        }
                    }

                    foreach ($rows as $row) {
                        $level = $schoolLevel[$row['school_attended']] ?? null;
                        if ($level === null || !in_array($level, $groups, true)) {
                            continue; // school not active / not in schools table — skip
                        }

                        $categoryId = trim((string)$row['category_id']);
                        if ($categoryId === '') {
                            $categoryId = $latestCategoryByCase[$row['case_uid']] ?? '';
                        }
                        $bucketKey = $categoryId !== '' ? $categoryId : ('section-' . $row['section_id'] . '-uncategorized');

                        $students = json_decode((string)$row['students_json'], true) ?: [];
                        $primaryCount = 0;
                        foreach ($students as $s) {
                            $role = trim((string)($s['role'] ?? ''));
                            if ($this->case_report_role_is_primary($role)) {
                                $primaryCount++;
                            }
                        }
                        if ($primaryCount === 0) {
                            continue;
                        }

                        $counts[$level][$bucketKey] = ($counts[$level][$bucketKey] ?? 0) + $primaryCount;
                    }
                }
            }

            $this->send_json(200, ['success' => true, 'districts' => $groups, 'sections' => $sections, 'counts' => $counts]);
        }

        $this->send_json(400, ['success' => false, 'message' => 'Unknown action.']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    private function table_exists(mysqli $conn, string $name): bool {
        $result = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($name) . "'");
        return $result && $result->num_rows > 0;
    }

    // Cases can list bystanders/witnesses alongside the actual subject (see the
    // studentRole select in counseling.php — now 'Offender' | 'Victim' |
    // 'Bystander' | 'Other', previously 'Primary student' | 'Peer involved' |
    // 'Witness' | 'Other') — only the subject is who the case is "about", so
    // only they should count toward tallies/exports below. Checks against both
    // vocabularies (rather than just the current one) so reports on cases saved
    // before this role list changed still exclude their bystanders/witnesses
    // correctly instead of suddenly counting them as the subject.
    private function case_report_role_is_primary(string $role): bool {
        $nonPrimaryRoles = ['Peer involved', 'Witness', 'Bystander'];
        return $role === '' || !in_array($role, $nonPrimaryRoles, true);
    }

    /** Strips invisible Unicode formatting characters (zero-width spaces/
     *  joiners, left-to-right/right-to-left marks, BOM) that can ride along
     *  unnoticed when a section/category name is copy-pasted in from Word or a
     *  PDF. They're invisible in every plain-text/HTML view (including the
     *  on-screen report table), but jsPDF's built-in fonts have no glyph for
     *  them and mis-measure the string, which spreads every character after it
     *  out across the whole column instead of wrapping normally — e.g.
     *  "Child Inconflict with the Law(CICL)" rendering with huge letter gaps in
     *  every PDF export. Applied on read here so already-saved rows display
     *  correctly regardless of how they got in. */
    private function clean_label_text(string $s): string {
        return trim(preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}\x{FEFF}]/u', '', $s) ?? $s);
    }

    /* Same 6 sections / 27 categories the counselor case workflow already uses
       (see api/get-case-section.php) — every case report table on the coordinator
       and SDO side groups by these instead of a fabricated category list. */
    private function fetch_sections(mysqli $conn): array {
        $result = $conn->query("
        SELECT s.SectionID, s.SectionCode, s.SectionName, cc.CaseId, cc.CategoryName
        FROM section s
        LEFT JOIN case_category cc ON cc.SectionID = s.SectionID
        ORDER BY s.SectionID ASC, cc.CategoryName ASC
    ");

        $sections = [];
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $sid = (string)$row['SectionID'];
                if (!isset($sections[$sid])) {
                    $sections[$sid] = [
                        'sectionId' => $sid,
                        'sectionCode' => $row['SectionCode'],
                        'sectionName' => $this->clean_label_text($row['SectionName']),
                        'categories' => []
                    ];
                }
                if ($row['CaseId']) {
                    $sections[$sid]['categories'][] = [
                        'categoryId' => (string)$row['CaseId'],
                        'categoryName' => $this->clean_label_text($row['CategoryName'])
                    ];
                }
            }
        }

        return array_values($sections);
    }

    /** Fills in each $caseRow's blank 'categoryId' from its own most recent
     *  follow_up row. counselor_case_scenarios.category_id is never actually
     *  populated any more — category moved to being recorded per student, per
     *  follow-up (see saveFollowUp() in counseling.js) instead of once on the
     *  case itself — so every case would otherwise fall into its section's
     *  "uncategorized" bucket even when its follow-ups clearly had a category.
     *  Matches what the counselor's own "Recent drafts" list already shows
     *  (getRecordCategoryNames() in counseling.js). Each row needs 'caseUid'
     *  and 'categoryId' keys; rows come back in the same order. */
    private function backfill_case_categories(mysqli $conn, array $caseRows): array {
        if (empty($caseRows) || !$this->table_exists($conn, 'follow_up')) {
            return $caseRows;
        }

        $caseUids = array_values(array_unique(array_column($caseRows, 'caseUid')));
        $uidPlaceholders = implode(',', array_fill(0, count($caseUids), '?'));
        $uidTypes = str_repeat('s', count($caseUids));
        $fuStmt = $conn->prepare("
        SELECT case_uid, category_id
        FROM follow_up
        WHERE case_uid IN ($uidPlaceholders) AND category_id IS NOT NULL AND category_id != ''
        ORDER BY created_at DESC, Follow_id DESC
    ");
        if (!$fuStmt) {
            return $caseRows;
        }
        $fuStmt->bind_param($uidTypes, ...$caseUids);
        $fuStmt->execute();
        $fuResult = $fuStmt->get_result();
        $latestCategoryByCase = [];
        while ($fuRow = $fuResult->fetch_assoc()) {
            // First row seen per case_uid is its most recent (ORDER BY
            // created_at DESC above) — don't let an older follow-up overwrite it.
            if (!isset($latestCategoryByCase[$fuRow['case_uid']])) {
                $latestCategoryByCase[$fuRow['case_uid']] = (string)$fuRow['category_id'];
            }
        }
        $fuStmt->close();

        foreach ($caseRows as &$caseRow) {
            if ($caseRow['categoryId'] === '' && isset($latestCategoryByCase[$caseRow['caseUid']])) {
                $caseRow['categoryId'] = $latestCategoryByCase[$caseRow['caseUid']];
            }
        }
        unset($caseRow);

        return $caseRows;
    }

    /** All school_name values assigned to $district ("" / "Unassigned" = no district set). */
    private function schools_in_district(mysqli $conn, string $district): array {
        if ($district === '' || strcasecmp($district, 'Unassigned') === 0) {
            $result = $conn->query("SELECT school_name FROM schools WHERE is_active = 1 AND (district IS NULL OR district = '')");
        } else {
            $stmt = $conn->prepare('SELECT school_name FROM schools WHERE is_active = 1 AND district = ?');
            if (!$stmt) {
                return [];
            }
            $stmt->bind_param('s', $district);
            $stmt->execute();
            $result = $stmt->get_result();
        }

        $names = [];
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $names[] = $row['school_name'];
            }
        }
        return $names;
    }

    /** Every active school's name, regardless of district — backs the "All
     *  Districts" view so it doesn't require picking a district at all. */
    private function all_active_school_names(mysqli $conn): array {
        $result = $conn->query("SELECT school_name FROM schools WHERE is_active = 1");
        $names = [];
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $names[] = $row['school_name'];
            }
        }
        return $names;
    }

    /** Map of school_name => school_level ('Secondary'/'East'/'West'/'South')
     *  for every school in $schoolNames. A name with no matching row (or a
     *  blank/NULL level) is simply absent — callers treat a missing entry as
     *  'Secondary', the safe default. */
    private function schools_level_map(mysqli $conn, array $schoolNames): array {
        if (empty($schoolNames)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($schoolNames), '?'));
        $types = str_repeat('s', count($schoolNames));
        $stmt = $conn->prepare("SELECT school_name, school_level FROM schools WHERE school_name IN ($placeholders)");
        if (!$stmt) {
            return [];
        }
        $stmt->bind_param($types, ...$schoolNames);
        $stmt->execute();
        $result = $stmt->get_result();

        $map = [];
        while ($row = $result->fetch_assoc()) {
            if (!empty($row['school_level'])) {
                $map[$row['school_name']] = $row['school_level'];
            }
        }
        $stmt->close();

        return $map;
    }

    /** True if every school in $schoolNames is elementary (school_level
     *  East/West/South) — false for an empty list, a Secondary school, or a
     *  mix of levels. Used by the 'list' action, which (unlike 'categories')
     *  is never queried across a mixed-level multi-school selection. */
    private function schools_are_elementary(mysqli $conn, array $schoolNames): bool {
        if (empty($schoolNames)) {
            return false;
        }

        $levelMap = $this->schools_level_map($conn, $schoolNames);
        if (empty($levelMap)) {
            return false;
        }

        foreach ($levelMap as $level) {
            if (!in_array($level, ['East', 'West', 'South'], true)) {
                return false;
            }
        }
        return true;
    }

    private function zero_grade_buckets(array $gradeKeys): array {
        $buckets = [];
        foreach ($gradeKeys as $gradeKey) {
            $buckets[$gradeKey] = ['m' => 0, 'f' => 0];
        }
        return $buckets;
    }

    /** SQL fragment + extra bind types/values for filtering a date column by
     *  period: 'weekly' (this calendar week), 'monthly' (this calendar month),
     *  'quarterly' (this calendar quarter), 'annually' (this calendar year),
     *  'custom' (explicit start/end), or anything else (no filter — all time).
     *  $column defaults to counselor_case_scenarios.case_date; district_summary
     *  passes referral.date_submitted instead. */
    private function case_date_condition(string $period, string $start, string $end, string $column = 'case_date'): array {
        switch ($period) {
            case 'weekly':
                return [" AND YEARWEEK($column, 1) = YEARWEEK(CURDATE(), 1)", '', []];
            case 'monthly':
                return [" AND YEAR($column) = YEAR(CURDATE()) AND MONTH($column) = MONTH(CURDATE())", '', []];
            case 'quarterly':
                return [" AND YEAR($column) = YEAR(CURDATE()) AND QUARTER($column) = QUARTER(CURDATE())", '', []];
            case 'annually':
                return [" AND YEAR($column) = YEAR(CURDATE())", '', []];
            case 'custom':
                if ($start !== '' && $end !== '') {
                    return [" AND $column BETWEEN ? AND ?", 'ss', [$start, $end]];
                }
                return ['', '', []];
            default:
                return ['', '', []];
        }
    }
}
