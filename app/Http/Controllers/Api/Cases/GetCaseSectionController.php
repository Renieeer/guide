<?php

namespace App\Http\Controllers\Api\Cases;

use App\Http\Controllers\Controller;
use mysqli;

/* ── ADD SECTION / ADD CASE CATEGORY (SDO Case Management) ── */
class GetCaseSectionController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = json_decode(file_get_contents('php://input'), true);
            $action = is_array($input) ? ($input['action'] ?? '') : '';

            if ($action === 'add_section') {
                $sectionName = $this->clean_label_text((string)($input['sectionName'] ?? ''));

                if ($sectionName === '') {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'Section name is required.']);
                }

                $dup = $conn->prepare('SELECT SectionID FROM section WHERE LOWER(SectionName) = LOWER(?) LIMIT 1');
                $dup->bind_param('s', $sectionName);
                $dup->execute();
                $exists = $dup->get_result()->fetch_assoc();
                $dup->close();

                if ($exists) {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'A section with that name already exists.']);
                }

                // SectionID/SectionCode have no auto-increment — assigned by hand,
                // same as the seed data (1..6 -> A..F). Keep that scheme going with
                // a spreadsheet-style letter (A..Z, then AA, AB, ...) so it never
                // collides once the alphabet runs out.
                $next = $conn->query('SELECT COALESCE(MAX(SectionID), 0) + 1 AS nextId FROM section')->fetch_assoc();
                $nextId = (int)$next['nextId'];
                $code = $this->numberToLetters($nextId);

                $stmt = $conn->prepare('INSERT INTO section (SectionID, SectionCode, SectionName) VALUES (?, ?, ?)');
                $stmt->bind_param('iss', $nextId, $code, $sectionName);

                if (!$stmt->execute()) {
                    $stmt->close();
                    http_response_code(500);
                    json_out(['success' => false, 'message' => 'Failed to add section.']);
                }
                $stmt->close();

                json_out([
                    'success' => true,
                    'message' => 'Section added successfully.',
                    'section' => ['SectionID' => $nextId, 'SectionCode' => $code, 'SectionName' => $sectionName]
                ]);
            }

            if ($action === 'edit_section') {
                $sectionId = (int)($input['sectionId'] ?? 0);
                $sectionName = $this->clean_label_text((string)($input['sectionName'] ?? ''));

                if ($sectionId <= 0 || $sectionName === '') {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'Section and new name are required.']);
                }

                $existsCheck = $conn->prepare('SELECT SectionID FROM section WHERE SectionID = ?');
                $existsCheck->bind_param('i', $sectionId);
                $existsCheck->execute();
                $found = $existsCheck->get_result()->fetch_assoc();
                $existsCheck->close();

                if (!$found) {
                    http_response_code(404);
                    json_out(['success' => false, 'message' => 'Section was not found.']);
                }

                $dup = $conn->prepare('SELECT SectionID FROM section WHERE LOWER(SectionName) = LOWER(?) AND SectionID != ? LIMIT 1');
                $dup->bind_param('si', $sectionName, $sectionId);
                $dup->execute();
                $exists = $dup->get_result()->fetch_assoc();
                $dup->close();

                if ($exists) {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'A section with that name already exists.']);
                }

                $stmt = $conn->prepare('UPDATE section SET SectionName = ? WHERE SectionID = ?');
                $stmt->bind_param('si', $sectionName, $sectionId);

                if (!$stmt->execute()) {
                    $stmt->close();
                    http_response_code(500);
                    json_out(['success' => false, 'message' => 'Failed to update section.']);
                }
                $stmt->close();

                json_out([
                    'success' => true,
                    'message' => 'Section updated successfully.',
                    'section' => ['SectionID' => $sectionId, 'SectionName' => $sectionName]
                ]);
            }

            if ($action === 'add_case_category') {
                $sectionId = (int)($input['sectionId'] ?? 0);
                $categoryName = $this->clean_label_text((string)($input['categoryName'] ?? ''));

                if ($sectionId <= 0 || $categoryName === '') {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'Section and category name are required.']);
                }

                $section = $conn->prepare('SELECT SectionID, SectionCode, SectionName FROM section WHERE SectionID = ?');
                $section->bind_param('i', $sectionId);
                $section->execute();
                $sectionRow = $section->get_result()->fetch_assoc();
                $section->close();

                if (!$sectionRow) {
                    http_response_code(404);
                    json_out(['success' => false, 'message' => 'Selected section was not found.']);
                }

                $dup = $conn->prepare('SELECT CaseId FROM case_category WHERE SectionID = ? AND LOWER(CategoryName) = LOWER(?) LIMIT 1');
                $dup->bind_param('is', $sectionId, $categoryName);
                $dup->execute();
                $exists = $dup->get_result()->fetch_assoc();
                $dup->close();

                if ($exists) {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'That category already exists under this section.']);
                }

                // CaseId is a varchar PK with no auto-increment, but every existing
                // row holds a plain numeric string — keep assigning the next one.
                $next = $conn->query('SELECT COALESCE(MAX(CAST(CaseId AS UNSIGNED)), 0) + 1 AS nextId FROM case_category')->fetch_assoc();
                $nextId = (string)(int)$next['nextId'];

                $stmt = $conn->prepare('INSERT INTO case_category (CaseId, SectionID, CategoryName) VALUES (?, ?, ?)');
                $stmt->bind_param('sis', $nextId, $sectionId, $categoryName);

                if (!$stmt->execute()) {
                    $stmt->close();
                    http_response_code(500);
                    json_out(['success' => false, 'message' => 'Failed to add case category.']);
                }
                $stmt->close();

                json_out([
                    'success' => true,
                    'message' => 'Case category added successfully.',
                    'category' => [
                        'CaseId' => $nextId,
                        'SectionID' => $sectionId,
                        'SectionCode' => $sectionRow['SectionCode'],
                        'SectionName' => $sectionRow['SectionName'],
                        'CategoryName' => $categoryName
                    ]
                ]);
            }

            if ($action === 'edit_case_category') {
                $caseId = trim((string)($input['caseId'] ?? ''));
                $sectionId = (int)($input['sectionId'] ?? 0);
                $categoryName = $this->clean_label_text((string)($input['categoryName'] ?? ''));

                if ($caseId === '' || $sectionId <= 0 || $categoryName === '') {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'Category, section, and name are required.']);
                }

                $existsCheck = $conn->prepare('SELECT CaseId FROM case_category WHERE CaseId = ?');
                $existsCheck->bind_param('s', $caseId);
                $existsCheck->execute();
                $found = $existsCheck->get_result()->fetch_assoc();
                $existsCheck->close();

                if (!$found) {
                    http_response_code(404);
                    json_out(['success' => false, 'message' => 'Case category was not found.']);
                }

                $section = $conn->prepare('SELECT SectionID, SectionCode, SectionName FROM section WHERE SectionID = ?');
                $section->bind_param('i', $sectionId);
                $section->execute();
                $sectionRow = $section->get_result()->fetch_assoc();
                $section->close();

                if (!$sectionRow) {
                    http_response_code(404);
                    json_out(['success' => false, 'message' => 'Selected section was not found.']);
                }

                $dup = $conn->prepare('SELECT CaseId FROM case_category WHERE SectionID = ? AND LOWER(CategoryName) = LOWER(?) AND CaseId != ? LIMIT 1');
                $dup->bind_param('iss', $sectionId, $categoryName, $caseId);
                $dup->execute();
                $exists = $dup->get_result()->fetch_assoc();
                $dup->close();

                if ($exists) {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'That category already exists under this section.']);
                }

                $stmt = $conn->prepare('UPDATE case_category SET SectionID = ?, CategoryName = ? WHERE CaseId = ?');
                $stmt->bind_param('iss', $sectionId, $categoryName, $caseId);

                if (!$stmt->execute()) {
                    $stmt->close();
                    http_response_code(500);
                    json_out(['success' => false, 'message' => 'Failed to update case category.']);
                }
                $stmt->close();

                json_out([
                    'success' => true,
                    'message' => 'Case category updated successfully.',
                    'category' => [
                        'CaseId' => $caseId,
                        'SectionID' => $sectionId,
                        'SectionCode' => $sectionRow['SectionCode'],
                        'SectionName' => $sectionRow['SectionName'],
                        'CategoryName' => $categoryName
                    ]
                ]);
            }

            if ($action === 'delete_case_category') {
                $caseId = trim((string)($input['caseId'] ?? ''));

                if ($caseId === '') {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'Case category is required.']);
                }

                $existsCheck = $conn->prepare('SELECT CaseId FROM case_category WHERE CaseId = ?');
                $existsCheck->bind_param('s', $caseId);
                $existsCheck->execute();
                $found = $existsCheck->get_result()->fetch_assoc();
                $existsCheck->close();

                if (!$found) {
                    http_response_code(404);
                    json_out(['success' => false, 'message' => 'Case category was not found.']);
                }

                // A category is "in use" once a real counseling case or follow-up
                // entry has been tagged with it — both counselor_case_scenarios and
                // follow_up store that as their own category_id column (a plain
                // varchar copy of case_category.CaseId, not an FK — this table has
                // no auto-increment/FK setup, see add_case_category above), so the
                // only reliable check is a direct lookup in each rather than
                // trusting a constraint the schema doesn't have.
                $inUse = false;
                foreach (['counselor_case_scenarios', 'follow_up'] as $table) {
                    $check = $conn->prepare("SELECT 1 FROM `$table` WHERE category_id = ? LIMIT 1");
                    $check->bind_param('s', $caseId);
                    $check->execute();
                    $hit = $check->get_result()->fetch_assoc();
                    $check->close();
                    if ($hit) { $inUse = true; break; }
                }

                if ($inUse) {
                    http_response_code(409);
                    json_out([
                        'success' => false,
                        'blocked' => true,
                        'message' => 'This case category cannot be deleted because it has existing case data.'
                    ]);
                }

                $stmt = $conn->prepare('DELETE FROM case_category WHERE CaseId = ?');
                $stmt->bind_param('s', $caseId);

                if (!$stmt->execute()) {
                    $stmt->close();
                    http_response_code(500);
                    json_out(['success' => false, 'message' => 'Failed to delete case category.']);
                }
                $stmt->close();

                json_out([
                    'success' => true,
                    'message' => 'Case category deleted successfully.',
                    'caseId' => $caseId
                ]);
            }

            http_response_code(400);
            json_out(['success' => false, 'message' => 'Unknown action.']);
        }

        $action = $_GET['action'] ?? 'sections';

        /* ── GET SECTIONS + CATEGORIES ── */
        if ($action === 'sections') {
            $result = $conn->query("
        SELECT
            s.SectionID,
            s.SectionCode,
            s.SectionName,
            cc.CaseId,
            cc.CategoryName
        FROM section s
        LEFT JOIN case_category cc ON cc.SectionID = s.SectionID
        ORDER BY s.SectionID ASC, cc.CategoryName ASC
    ");

            if (!$result) {
                http_response_code(500);
                json_out(['success' => false, 'message' => 'Query failed: ' . $conn->error]);
            }

            $sections = [];
            while ($row = $result->fetch_assoc()) {
                $sid = $row['SectionID'];
                if (!isset($sections[$sid])) {
                    $sections[$sid] = [
                        'SectionID'   => $sid,
                        'SectionCode' => $row['SectionCode'],
                        'SectionName' => $this->clean_label_text($row['SectionName']),
                        'categories'  => []
                    ];
                }
                if ($row['CaseId']) {
                    $sections[$sid]['categories'][] = [
                        'CaseId'       => $row['CaseId'],
                        'CategoryName' => $this->clean_label_text($row['CategoryName'])
                    ];
                }
            }

            json_out(['success' => true, 'sections' => array_values($sections)]);
        }

        /* ── SEARCH STUDENTS (same school as counselor) ── */
        elseif ($action === 'students') {
            $counselorSchool = session('school_attended') ?? '';

            if (empty($counselorSchool)) {
                json_out(['success' => false, 'message' => 'No school found in session.']);
            }

            $search = trim($_GET['q'] ?? '');

            if (strlen($search) < 2) {
                json_out(['success' => true, 'students' => []]);
            }

            $like   = '%' . $conn->real_escape_string($search) . '%';
            $school = $conn->real_escape_string($counselorSchool);

            $result = $conn->query("
        SELECT
            st.StudentId,
            st.FirstName,
            st.MiddleName,
            st.LastName,
            st.Grade,
            st.Section
        FROM student_table st
        JOIN users_tables ut ON ut.AccountID = st.AccountID
        WHERE ut.school_attended = '$school'
          AND (
            CONCAT(st.FirstName, ' ', st.LastName) LIKE '$like'
            OR CONCAT(st.FirstName, ' ', st.MiddleName, ' ', st.LastName) LIKE '$like'
            OR st.LastName  LIKE '$like'
            OR st.FirstName LIKE '$like'
          )
        ORDER BY st.LastName ASC, st.FirstName ASC
        LIMIT 10
    ");

            if (!$result) {
                http_response_code(500);
                json_out(['success' => false, 'message' => 'Query failed: ' . $conn->error]);
            }

            $students = [];
            while ($row = $result->fetch_assoc()) {
                $mid      = $row['MiddleName'] ? ' ' . $row['MiddleName'] . ' ' : ' ';
                $fullName = trim($row['FirstName'] . $mid . $row['LastName']);
                $grade    = trim(($row['Grade'] ?? '') . ($row['Section'] ? ' - ' . $row['Section'] : ''));
                $students[] = [
                    'StudentId' => $row['StudentId'],
                    'name'      => $fullName,
                    'grade'     => $grade ?: 'Grade not set',
                ];
            }

            json_out(['success' => true, 'students' => $students]);
        }

        else {
            http_response_code(400);
            json_out(['success' => false, 'message' => 'Unknown action.']);
        }

        if (isset($conn) && $conn instanceof mysqli) {
            $conn->close();
        }
    }

    /** Strips invisible Unicode formatting characters (zero-width spaces/
     *  joiners, left-to-right/right-to-left marks, BOM) that can ride along
     *  unnoticed when a section/category name is copy-pasted in from Word or a
     *  PDF — invisible in every plain-text/HTML view, but jsPDF's built-in
     *  fonts have no glyph for them and mis-measure the string, spreading every
     *  character after it across the whole PDF column instead of wrapping
     *  normally. Applied both on read (case-report.php's fetch_sections() has
     *  the same helper, for already-saved rows) and here on write, so a new
     *  section/category can't reintroduce the same rendering bug. */
    private function clean_label_text(string $s): string {
        return trim(preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}\x{FEFF}]/u', '', $s) ?? $s);
    }

    // 1 -> A, 26 -> Z, 27 -> AA, 28 -> AB, ... (spreadsheet column naming).
    private function numberToLetters(int $n): string {
        $letters = '';
        while ($n > 0) {
            $rem = ($n - 1) % 26;
            $letters = chr(65 + $rem) . $letters;
            $n = intdiv($n - 1, 26);
        }
        return $letters;
    }
}
