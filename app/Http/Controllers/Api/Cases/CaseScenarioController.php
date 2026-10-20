<?php

namespace App\Http\Controllers\Api\Cases;

use App\Http\Controllers\Controller;
use mysqli;
use stdClass;

class CaseScenarioController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $this->ensure_case_scenario_table($conn);
        $this->ensure_follow_up_tables($conn);

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $school = trim((string)($_GET['school_attended'] ?? ''));
            $limit = (int)($_GET['limit'] ?? 50);
            if ($limit <= 0 || $limit > 200) {
                $limit = 50;
            }

            $gradeScope = grade_scope_to_list($_GET['grade_scope'] ?? '');
            // Grade filtering happens in PHP below (cases embed students as JSON,
            // no grade column to filter in SQL), so over-fetch up to the 200 cap
            // when scoped — otherwise the real LIMIT could cut off matching cases
            // before they're ever seen.
            $fetchLimit = !empty($gradeScope) ? 200 : $limit;

            if ($school !== '') {
                $stmt = $conn->prepare('
            SELECT *
            FROM counselor_case_scenarios
            WHERE school_attended = ?
            ORDER BY created_at DESC
            LIMIT ?
        ');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $stmt->bind_param('si', $school, $fetchLimit);
            } else {
                $stmt = $conn->prepare('
            SELECT *
            FROM counselor_case_scenarios
            ORDER BY created_at DESC
            LIMIT ?
        ');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }
                $stmt->bind_param('i', $fetchLimit);
            }

            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Query failed: ' . $stmt->error]);
            }

            $result = $stmt->get_result();
            $records = [];
            while ($row = $result->fetch_assoc()) {
                $records[] = $this->normalize_record($row);
            }

            $stmt->close();

            // Keep a case if any embedded student's grade falls within scope.
            if (!empty($gradeScope)) {
                ensureSchoolsTable($conn);
                // $school is the grade-scoped caller's own school (a grade-scoped
                // account is always school-scoped too), used so an elementary "1"
                // isn't misread via the legacy 1-6-means-7-12 secondary code — see
                // school_is_elementary()'s own doc comment.
                $isElementary = school_is_elementary($conn, $school);
                $records = array_values(array_filter($records, function ($rec) use ($gradeScope, $isElementary) {
                    foreach ($rec['students'] as $student) {
                        if (grade_matches_scope($student['grade'] ?? null, $gradeScope, $isElementary)) {
                            return true;
                        }
                    }
                    return false;
                }));
                $records = array_slice($records, 0, $limit);
            }

            $followUpsByCase = $this->fetch_follow_ups_by_case($conn, array_column($records, 'id'));
            foreach ($records as &$rec) {
                $rec['followUps'] = $followUpsByCase[$rec['id']] ?? [];
            }
            unset($rec);

            $this->send_json(200, ['success' => true, 'data' => $records]);
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
        }

        $body = $this->read_json_body();
        $action = trim((string)($body['action'] ?? 'create'));
        $record = isset($body['record']) && is_array($body['record']) ? $body['record'] : $body;

        if ($action === 'update') {
            $caseUid = trim((string)($record['id'] ?? ''));
            if ($caseUid === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Case id is required for update.']);
            }

            $status = trim((string)($record['status'] ?? 'pending'));
            $categoryId = trim((string)($record['categoryId'] ?? ''));
            $categoryName = trim((string)($record['categoryName'] ?? ''));
            $followUpDate = trim((string)($record['followUpDate'] ?? ''));
            $studentsJson = json_encode($record['students'] ?? [], JSON_UNESCAPED_UNICODE);
            $counselingJson = json_encode($record['counselingRecords'] ?? new stdClass(), JSON_UNESCAPED_UNICODE);
            $followUpsJson = json_encode($record['followUps'] ?? [], JSON_UNESCAPED_UNICODE);

            $stmt = $conn->prepare('
        UPDATE counselor_case_scenarios
        SET status = ?,
            category_id = ?,
            category_name = ?,
            follow_up_date = NULLIF(?, ""),
            students_json = ?,
            counseling_records_json = ?,
            follow_ups_json = ?
        WHERE case_uid = ?
    ');

            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }

            $stmt->bind_param(
                'ssssssss',
                $status,
                $categoryId,
                $categoryName,
                $followUpDate,
                $studentsJson,
                $counselingJson,
                $followUpsJson,
                $caseUid
            );

            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Update failed: ' . $stmt->error]);
            }

            $stmt->close();
            $this->send_json(200, ['success' => true, 'message' => 'Case scenario updated.']);
        }

        $caseUid = trim((string)($record['id'] ?? ''));
        $sectionId = trim((string)($record['sectionId'] ?? ''));
        $categoryId = trim((string)($record['categoryId'] ?? ''));
        $caseSummary = trim((string)($record['caseSummary'] ?? ''));
        $students = $record['students'] ?? [];

        // Category is now recorded per student in the follow-up / counseling-info step,
        // so it's no longer required at case creation.
        if ($caseUid === '' || $sectionId === '' || $caseSummary === '' || !is_array($students) || count($students) === 0) {
            $this->send_json(400, ['success' => false, 'message' => 'Missing required case scenario fields.']);
        }

        $counselorId = trim((string)($record['counselorId'] ?? ''));
        $counselor = trim((string)($record['counselor'] ?? ''));
        $school = trim((string)($record['schoolAttended'] ?? ''));
        $sectionName = trim((string)($record['sectionName'] ?? ''));
        $categoryName = trim((string)($record['categoryName'] ?? ''));
        $caseTitle = trim((string)($record['caseTitle'] ?? ''));
        $caseDate = trim((string)($record['caseDate'] ?? ''));
        $caseObjective = trim((string)($record['caseObjective'] ?? ''));
        $firstAction = trim((string)($record['firstAction'] ?? ''));
        $followUpDate = trim((string)($record['followUpDate'] ?? ''));
        $confidentialityAck = !empty($record['confidentialityAck']) ? 1 : 0;
        $status = trim((string)($record['status'] ?? 'pending'));
        // Real link back to the referral this case was opened from (see
        // openCounselingCaseForReferral() in referral-status.js) — replaces the old
        // "(Linked to Referral <code>)" text marker that used to be appended to
        // case_summary. Blank for a case created directly from the Counseling page
        // with no originating referral.
        $referralCode = trim((string)($record['referralCode'] ?? ''));

        $studentsJson = json_encode($students, JSON_UNESCAPED_UNICODE);
        $counselingJson = json_encode($record['counselingRecords'] ?? new stdClass(), JSON_UNESCAPED_UNICODE);
        $followUpsJson = json_encode($record['followUps'] ?? [], JSON_UNESCAPED_UNICODE);

        $stmt = $conn->prepare('
    INSERT INTO counselor_case_scenarios (
        case_uid,
        counselor_id,
        counselor_name,
        school_attended,
        section_id,
        section_name,
        category_id,
        category_name,
        case_title,
        case_date,
        case_summary,
        case_objective,
        first_action,
        follow_up_date,
        confidentiality_ack,
        status,
        referral_code,
        students_json,
        counseling_records_json,
        follow_ups_json
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        NULLIF(?, ""), ?, ?, ?,
        NULLIF(?, ""), ?, ?, NULLIF(?, ""), ?, ?, ?
    )
');

        if (!$stmt) {
            $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
        }

        $stmt->bind_param(
            'ssssssssssssssisssss',
            $caseUid,
            $counselorId,
            $counselor,
            $school,
            $sectionId,
            $sectionName,
            $categoryId,
            $categoryName,
            $caseTitle,
            $caseDate,
            $caseSummary,
            $caseObjective,
            $firstAction,
            $followUpDate,
            $confidentialityAck,
            $status,
            $referralCode,
            $studentsJson,
            $counselingJson,
            $followUpsJson
        );

        if (!$stmt->execute()) {
            if ($stmt->errno === 1062) {
                $this->send_json(409, ['success' => false, 'message' => 'Case scenario already exists.']);
            }
            $this->send_json(500, ['success' => false, 'message' => 'Insert failed: ' . $stmt->error]);
        }

        $stmt->close();
        $this->send_json(201, ['success' => true, 'message' => 'Case scenario saved to database.']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    /* Follow-ups now live in their own relational tables (see api/follow-up.php)
       instead of the follow_ups_json blob column below — one `follow_up` row per
       recorded session (shared category/date for the whole case) with one
       `follow_up_note` row per student (their individual note). ensure_* is
       duplicated here (rather than requiring follow-up.php) so this endpoint's
       GET can join against them even if follow-up.php has never run yet. */
    private function ensure_follow_up_tables(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS follow_up (
            Follow_id INT NOT NULL AUTO_INCREMENT,
            PRIMARY KEY (Follow_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");

        $columns = [
            // Reused (not new) — see api/follow-up.php's own ensure_follow_up_tables()
            // for the full explanation of why Title tells a "Counseling Session"
            // row apart from a "Follow-up" row.
            'Title'          => "VARCHAR(45) DEFAULT NULL",
            'case_uid'       => "VARCHAR(45) NOT NULL DEFAULT ''",
            'category_id'    => "VARCHAR(45) DEFAULT NULL",
            'category_name'  => "VARCHAR(150) DEFAULT NULL",
            'follow_up_date' => "DATE DEFAULT NULL",
            'counselor_id'   => "VARCHAR(45) DEFAULT NULL",
            'counselor_name' => "VARCHAR(150) DEFAULT NULL",
            'created_at'     => "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
        ];

        // Plain MySQL 8 (unlike MariaDB) has no "ADD COLUMN IF NOT EXISTS"
        // clause, so existence is checked via SHOW COLUMNS/SHOW INDEX first —
        // confirmed against this DB's actual MySQL 8.0.30 server, which
        // rejects that clause outright.
        $existingColumns = [];
        $colResult = $conn->query('SHOW COLUMNS FROM follow_up');
        if ($colResult) {
            while ($col = $colResult->fetch_assoc()) {
                $existingColumns[$col['Field']] = true;
            }
        }

        foreach ($columns as $name => $definition) {
            if (!isset($existingColumns[$name])) {
                $conn->query("ALTER TABLE follow_up ADD COLUMN {$name} {$definition}");
            }
        }

        $indexExists = false;
        $idxResult = $conn->query("SHOW INDEX FROM follow_up WHERE Key_name = 'idx_case_uid'");
        if ($idxResult && $idxResult->num_rows > 0) {
            $indexExists = true;
        }
        if (!$indexExists) {
            $conn->query('ALTER TABLE follow_up ADD INDEX idx_case_uid (case_uid)');
        }

        $conn->query("
        CREATE TABLE IF NOT EXISTS follow_up_note (
            note_id INT NOT NULL AUTO_INCREMENT,
            follow_up_id INT NOT NULL,
            student_id VARCHAR(45) NOT NULL,
            student_name VARCHAR(150) DEFAULT NULL,
            note TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (note_id),
            KEY idx_follow_up_id (follow_up_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");
    }

    /* Fetches every follow_up + follow_up_note row for the given case_uids in
       one query and groups them into the same {studentId, categoryId,
       categoryName, initialAction, followUpDate, recordedAt} shape the client
       has always used, so nothing downstream (category filters, per-student
       history, "N follow-ups" counts) needs to change. */
    private function fetch_follow_ups_by_case(mysqli $conn, array $caseUids): array {
        if (empty($caseUids)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($caseUids), '?'));
        $types = str_repeat('s', count($caseUids));

        $stmt = $conn->prepare("
        SELECT fu.case_uid, fu.Follow_id AS follow_up_id, fu.Title, fu.category_id, fu.category_name,
               fu.follow_up_date, fu.created_at, fu.counselor_name, n.student_id, n.student_name, n.note
        FROM follow_up fu
        JOIN follow_up_note n ON n.follow_up_id = fu.Follow_id
        WHERE fu.case_uid IN ($placeholders)
        ORDER BY fu.created_at ASC, fu.Follow_id ASC
    ");
        if (!$stmt) {
            return [];
        }

        $stmt->bind_param($types, ...$caseUids);
        if (!$stmt->execute()) {
            $stmt->close();
            return [];
        }

        $result = $stmt->get_result();
        $byCase = [];
        while ($row = $result->fetch_assoc()) {
            $byCase[$row['case_uid']][] = [
                'followUpId'    => 'FU-' . $row['follow_up_id'] . '-' . $row['student_id'],
                'title'         => (string)($row['Title'] ?? ''),
                'studentId'     => (string)$row['student_id'],
                'categoryId'    => (string)$row['category_id'],
                'categoryName'  => (string)$row['category_name'],
                'initialAction' => (string)$row['note'],
                'followUpDate'  => (string)$row['follow_up_date'],
                'recordedAt'    => (string)$row['created_at'],
                'counselorName' => (string)($row['counselor_name'] ?? '')
            ];
        }
        $stmt->close();

        return $byCase;
    }

    private function ensure_case_scenario_table(mysqli $conn): void {
        $sql = "
        CREATE TABLE IF NOT EXISTS counselor_case_scenarios (
            id INT NOT NULL AUTO_INCREMENT,
            case_uid VARCHAR(45) NOT NULL,
            referral_code VARCHAR(64) DEFAULT NULL,
            counselor_id VARCHAR(45) DEFAULT NULL,
            counselor_name VARCHAR(150) DEFAULT NULL,
            school_attended VARCHAR(150) DEFAULT NULL,
            section_id VARCHAR(20) DEFAULT NULL,
            section_name VARCHAR(100) DEFAULT NULL,
            category_id VARCHAR(45) DEFAULT NULL,
            category_name VARCHAR(150) DEFAULT NULL,
            case_title VARCHAR(180) DEFAULT NULL,
            case_date DATE DEFAULT NULL,
            case_summary TEXT,
            case_objective TEXT,
            first_action TEXT,
            follow_up_date DATE DEFAULT NULL,
            confidentiality_ack TINYINT(1) DEFAULT 0,
            status VARCHAR(30) DEFAULT 'pending',
            students_json LONGTEXT,
            counseling_records_json LONGTEXT,
            follow_ups_json LONGTEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_case_uid (case_uid),
            KEY idx_school_created (school_attended, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ";

        if (!$conn->query($sql)) {
            $this->send_json(500, ['success' => false, 'message' => 'Failed creating counselor_case_scenarios table: ' . $conn->error]);
        }

        // Defensive migration for installations where this table already
        // existed before referral_code was added — the real link to the
        // referral that created this case, replacing the old "(Linked to
        // Referral <code>)" text marker that used to be appended to
        // case_summary. Plain MySQL 8 has no "ADD COLUMN IF NOT EXISTS", so
        // existence is checked via SHOW COLUMNS/SHOW INDEX first (same pattern
        // as ensure_follow_up_tables() above).
        $colResult = $conn->query("SHOW COLUMNS FROM counselor_case_scenarios LIKE 'referral_code'");
        if ($colResult && $colResult->num_rows === 0) {
            $conn->query("ALTER TABLE counselor_case_scenarios ADD COLUMN referral_code VARCHAR(64) DEFAULT NULL AFTER case_uid");
        }

        $idxResult = $conn->query("SHOW INDEX FROM counselor_case_scenarios WHERE Key_name = 'idx_referral_code'");
        if ($idxResult && $idxResult->num_rows === 0) {
            $conn->query("ALTER TABLE counselor_case_scenarios ADD INDEX idx_referral_code (referral_code)");
        }
    }

    private function read_json_body(): array {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return [];
        }

        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function normalize_record(array $row): array {
        return [
            'id' => (string)($row['case_uid'] ?? ''),
            'referralCode' => (string)($row['referral_code'] ?? ''),
            'status' => (string)($row['status'] ?? 'pending'),
            'counselor' => (string)($row['counselor_name'] ?? ''),
            'sectionId' => (string)($row['section_id'] ?? ''),
            'sectionName' => (string)($row['section_name'] ?? ''),
            'categoryId' => (string)($row['category_id'] ?? ''),
            'categoryName' => (string)($row['category_name'] ?? ''),
            'caseTitle' => (string)($row['case_title'] ?? ''),
            'caseDate' => (string)($row['case_date'] ?? ''),
            'caseSummary' => (string)($row['case_summary'] ?? ''),
            'caseObjective' => (string)($row['case_objective'] ?? ''),
            'firstAction' => (string)($row['first_action'] ?? ''),
            'followUpDate' => (string)($row['follow_up_date'] ?? ''),
            'confidentialityAck' => (bool)($row['confidentiality_ack'] ?? 0),
            'students' => json_decode((string)($row['students_json'] ?? '[]'), true) ?: [],
            'counselingRecords' => json_decode((string)($row['counseling_records_json'] ?? '{}'), true) ?: new stdClass(),
            'followUps' => [], // populated after the query from the follow_up/follow_up_note tables
            'createdAt' => (string)($row['created_at'] ?? ''),
            'updatedAt' => (string)($row['updated_at'] ?? '')
        ];
    }
}
