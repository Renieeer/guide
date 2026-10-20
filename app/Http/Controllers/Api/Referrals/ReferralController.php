<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use mysqli_stmt;
use Throwable;

class ReferralController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensureReferralSchema($conn);

            $method = $_SERVER['REQUEST_METHOD'];

            if ($method === 'GET') {
                $role = trim((string)($_GET['role'] ?? ''));
                $school = trim((string)($_GET['school'] ?? ''));
                $gradeScope = grade_scope_to_list($_GET['grade_scope'] ?? '');
                $userId = trim((string)($_GET['user_id'] ?? ''));
                $studentId = trim((string)($_GET['student_id'] ?? ''));
                $referralId = trim((string)($_GET['id'] ?? $_GET['referral_id'] ?? ''));
                $limit = (int)($_GET['limit'] ?? 0);

                // Whether this referral has a completed External Referral (DepEd
                // Appendix C) form on file — see api/referral-external-referral.php.
                // That table is only ever created lazily (on its first save), so a
                // fresh install without one yet would break this EXISTS clause;
                // reporting "not externally referred" (0) is the correct answer then
                // anyway, since no referral could have one.
                $hasExternalReferralTable = $this->tableExists($conn, 'referral_external_referral');
                $externalReferralSelect = $hasExternalReferralTable
                    ? 'EXISTS (SELECT 1 FROM referral_external_referral er WHERE er.referral_id = referral.ReferralID) AS has_external_referral'
                    : '0 AS has_external_referral';

                $sql = "
            SELECT
                ReferralID AS id,
                referral_code,
                referral_group,
                student_name,
                StudentID AS student_id,
                Grade AS grade,
                section,
                age,
                gender,
                referral_role,
                Reason AS referral_reason,
                description,
                intervention_attempts,
                observed_behaviors,
                parent_guardian,
                parent_contact,
                parent_email,
                family_background,
                urgency,
                TeacherID AS teacher_id,
                teacher_name,
                teacher_contact,
                school_attended,
                student_school,
                COALESCE(stage, 1) AS stage,
                COALESCE(status, 'pending') AS status,
                stage_note,
                consent_student,
                consent_parent,
                date_submitted,
                updated_at,
                {$externalReferralSelect}
            FROM referral
            WHERE 1=1
        ";
                $types = '';
                $params = [];

                if ($referralId !== '') {
                    $sql .= ' AND (ReferralID = ? OR referral_code = ?)';
                    $types .= 'ss';
                    $params[] = $referralId;
                    $params[] = $referralId;
                } elseif ($role === 'teacher' && $userId !== '') {
                    $sql .= ' AND TeacherID = ?';
                    $types .= 's';
                    $params[] = $userId;
                    if ($school !== '') {
                        $sql .= ' AND (school_attended = ? OR student_school = ?)';
                        $types .= 'ss';
                        $params[] = $school;
                        $params[] = $school;
                    }
                } elseif (($role === 'counselor' || $role === 'coordinator' || $role === 'other-school') && $school !== '') {
                    $sql .= ' AND (school_attended = ? OR student_school = ?)';
                    $types .= 'ss';
                    $params[] = $school;
                    $params[] = $school;

                    $gradeClause = build_grade_in_clause('Grade', $gradeScope);
                    if ($gradeClause !== null) {
                        [$clauseSql, $clauseParams, $clauseTypes] = $gradeClause;
                        $sql .= " AND {$clauseSql}";
                        $types .= $clauseTypes;
                        $params = array_merge($params, $clauseParams);
                    }
                } elseif ($studentId !== '') {
                    $sql .= ' AND (student_id = ? OR StudentID = ?)';
                    $types .= 'ss';
                    $params[] = $studentId;
                    $params[] = $studentId;
                }

                $sql .= ' ORDER BY date_submitted DESC, ReferralID DESC';
                if ($limit > 0) {
                    $sql .= ' LIMIT ' . (int)$limit;
                }

                $rows = $this->fetchReferralRows($conn, $sql, $types, $params);

                // A referral has no single "assigned counselor" column of its own —
                // whoever picks it up records themselves on referral_screening
                // (Stage 1/2) instead. Only resolved for the student's own view
                // (see pages/student/feedback.js's rating picker, which needs to
                // know who actually handled a referral to attribute a rating
                // correctly) — other callers here don't use it, so it's skipped
                // for them rather than adding a join every referral list pays for.
                if ($studentId !== '' && !empty($rows)) {
                    $referralIds = array_column($rows, 'id');
                    $placeholders = implode(',', array_fill(0, count($referralIds), '?'));
                    $types2 = str_repeat('i', count($referralIds));
                    $stmt2 = $conn->prepare("
                SELECT referral_id, counselor_id, counselor_name
                FROM referral_screening
                WHERE referral_id IN ($placeholders)
                ORDER BY created_at DESC
            ");
                    if ($stmt2) {
                        $stmt2->bind_param($types2, ...$referralIds);
                        if ($stmt2->execute()) {
                            $screeningResult = $stmt2->get_result();
                            $counselorByReferral = [];
                            while ($srow = $screeningResult->fetch_assoc()) {
                                // First row seen per referral is its most recent
                                // (ORDER BY created_at DESC above).
                                if (!isset($counselorByReferral[$srow['referral_id']])) {
                                    $counselorByReferral[$srow['referral_id']] = [
                                        'counselor_id' => $srow['counselor_id'],
                                        'counselor_name' => $srow['counselor_name']
                                    ];
                                }
                            }
                            foreach ($rows as &$row) {
                                $match = $counselorByReferral[$row['id']] ?? null;
                                $row['counselor_id'] = $match['counselor_id'] ?? null;
                                $row['counselor_name'] = $match['counselor_name'] ?? null;
                            }
                            unset($row);
                        }
                        $stmt2->close();
                    }
                }

                $this->send_json(200, [
                    'success' => true,
                    'data' => $rows,
                    'count' => count($rows)
                ]);
            }

            if ($method === 'POST') {
                $raw = file_get_contents('php://input');
                $payload = json_decode($raw, true);

                if (!is_array($payload)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
                }

                // A multi-person submission (e.g. an offender and a victim in the
                // same incident, from pages/teacher/referral-form.php) is a JSON
                // array of per-person objects; an ordinary referral is a single
                // JSON object. array_is_list() + checking the first element is
                // itself an array distinguishes the two.
                $isBatch = array_is_list($payload) && isset($payload[0]) && is_array($payload[0]);
                $items = $isBatch ? $payload : [$payload];

                if (empty($items)) {
                    $this->send_json(400, ['success' => false, 'message' => 'No referral data provided']);
                }

                // Shared incident-level fields carry forward from the first person
                // to any that omit them (every current caller already repeats them
                // on every item, but this keeps a leaner payload possible later).
                $sharedDefaults = $items[0];

                // Ties every row from one multi-person submission together so
                // they can be found as a group later; left null for a single
                // referral so existing rows/behavior are unaffected.
                $referralGroup = count($items) > 1
                    ? 'GRP-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)))
                    : null;

                $created = [];
                foreach ($items as $itemPayload) {
                    if (!is_array($itemPayload)) {
                        $this->send_json(400, ['success' => false, 'message' => 'Invalid referral entry in payload']);
                    }
                    $created[] = $this->insertReferralRecord($conn, $itemPayload, $sharedDefaults, $referralGroup);
                }

                $first = $created[0];
                $this->send_json(201, [
                    'success' => true,
                    'message' => count($created) > 1
                        ? count($created) . ' referrals submitted successfully'
                        : 'Referral submitted successfully',
                    'referral_id' => $first['id'],
                    'referral_code' => $first['referral_code'],
                    'referral_group' => $referralGroup,
                    'data' => count($created) > 1
                        ? array_map(fn($c) => $c['data'], $created)
                        : $first['data']
                ]);
            }

            $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
            $this->send_json(500, ['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
        }
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    private function tableExists(mysqli $conn, string $tableName): bool {
        $result = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($tableName) . "'");
        return $result && $result->num_rows > 0;
    }

    private function getColumns(mysqli $conn, string $tableName): array {
        $columns = [];
        $result = $conn->query("SHOW COLUMNS FROM `{$tableName}`");

        if (!$result) {
            return $columns;
        }

        while ($row = $result->fetch_assoc()) {
            $columns[$row['Field']] = true;
        }

        return $columns;
    }

    private function hasColumn(array $columns, string $columnName, array $legacyNames = []): bool {
        $normalized = [];
        foreach ($columns as $name => $value) {
            $normalized[strtolower((string) $name)] = true;
        }

        if (isset($normalized[strtolower($columnName)])) {
            return true;
        }

        foreach ($legacyNames as $legacyName) {
            if (isset($normalized[strtolower($legacyName)])) {
                return true;
            }
        }

        return false;
    }

    private function bindDynamicParams(mysqli_stmt $stmt, string $types, array &$params): void {
        $bindings = [$types];
        foreach ($params as $index => $value) {
            $bindings[] = &$params[$index];
        }

        call_user_func_array([$stmt, 'bind_param'], $bindings);
    }

    private function nextReferralId(mysqli $conn): int {
        $result = $conn->query('SELECT COALESCE(MAX(ReferralID), 0) + 1 AS next_id FROM referral');
        if (!$result) {
            return 1;
        }

        $row = $result->fetch_assoc();
        return (int)($row['next_id'] ?? 1);
    }

    private function ensureReferralSchema(mysqli $conn): void {
        if (!$this->tableExists($conn, 'referral')) {
            $create = "
            CREATE TABLE referral (
                ReferralID int NOT NULL,
                StudentID varchar(45) DEFAULT NULL,
                Grade varchar(45) DEFAULT NULL,
                Schedule varchar(45) DEFAULT NULL,
                Reason text,
                TeacherID varchar(45) DEFAULT NULL,
                case_table int DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        ";

            if (!$conn->query($create)) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to create referral table: ' . $conn->error]);
            }
        }

        $columns = $this->getColumns($conn, 'referral');
        $requiredColumns = [
            'referral_code' => 'ALTER TABLE referral ADD COLUMN referral_code VARCHAR(64) NULL AFTER ReferralID',
            'student_name' => 'ALTER TABLE referral ADD COLUMN student_name VARCHAR(255) NULL AFTER StudentID',
            'student_id' => 'ALTER TABLE referral ADD COLUMN student_id VARCHAR(45) NULL AFTER student_name',
            'section' => 'ALTER TABLE referral ADD COLUMN section VARCHAR(45) NULL AFTER Grade',
            'age' => 'ALTER TABLE referral ADD COLUMN age VARCHAR(45) NULL AFTER section',
            'gender' => 'ALTER TABLE referral ADD COLUMN gender VARCHAR(45) NULL AFTER age',
            'description' => 'ALTER TABLE referral ADD COLUMN description TEXT NULL AFTER Reason',
            'intervention_attempts' => 'ALTER TABLE referral ADD COLUMN intervention_attempts TEXT NULL AFTER description',
            'observed_behaviors' => 'ALTER TABLE referral ADD COLUMN observed_behaviors TEXT NULL AFTER intervention_attempts',
            'parent_guardian' => 'ALTER TABLE referral ADD COLUMN parent_guardian VARCHAR(255) NULL AFTER observed_behaviors',
            'parent_contact' => 'ALTER TABLE referral ADD COLUMN parent_contact VARCHAR(100) NULL AFTER parent_guardian',
            'parent_email' => 'ALTER TABLE referral ADD COLUMN parent_email VARCHAR(255) NULL AFTER parent_contact',
            'family_background' => 'ALTER TABLE referral ADD COLUMN family_background TEXT NULL AFTER parent_email',
            'urgency' => 'ALTER TABLE referral ADD COLUMN urgency VARCHAR(45) NOT NULL DEFAULT "normal" AFTER family_background',
            'teacher_id' => 'ALTER TABLE referral ADD COLUMN teacher_id VARCHAR(45) NULL AFTER TeacherID',
            'teacher_name' => 'ALTER TABLE referral ADD COLUMN teacher_name VARCHAR(255) NULL AFTER TeacherID',
            'teacher_contact' => 'ALTER TABLE referral ADD COLUMN teacher_contact VARCHAR(100) NULL AFTER teacher_name',
            'school_attended' => 'ALTER TABLE referral ADD COLUMN school_attended VARCHAR(255) NULL AFTER teacher_name',
            'student_school' => 'ALTER TABLE referral ADD COLUMN student_school VARCHAR(255) NULL AFTER school_attended',
            'stage' => 'ALTER TABLE referral ADD COLUMN stage INT NOT NULL DEFAULT 1 AFTER student_school',
            'status' => 'ALTER TABLE referral ADD COLUMN status VARCHAR(45) NOT NULL DEFAULT "pending" AFTER stage',
            // Short human-readable note on what the current stage actually means
            // for this referral — e.g. "Assessment done" once Stage 2's
            // completion question is answered Yes, or "For counseling" vs.
            // "Waiting for assessment proper" depending on whether Stage 3's
            // student/parent agreement routed it to Stage 4 or Stage 5. The
            // stage number alone can't tell those two Stage 5 arrivals apart.
            'stage_note' => 'ALTER TABLE referral ADD COLUMN stage_note VARCHAR(255) NULL AFTER status',
            // The actual Stage 3 Yes/No answers, kept separately from stage_note
            // (which the next transition overwrites/clears) so Stage 5 can still
            // reliably tell whether the student/parent originally consented to
            // counseling, long after the referral has moved past Stage 3-4. Set
            // once by confirmConsentDecision() (referral-status.js) via
            // update-referral.php; NULL for a referral that hasn't reached
            // Stage 3 yet.
            'consent_student' => 'ALTER TABLE referral ADD COLUMN consent_student VARCHAR(10) NULL AFTER stage_note',
            'consent_parent' => 'ALTER TABLE referral ADD COLUMN consent_parent VARCHAR(10) NULL AFTER consent_student',
            'date_submitted' => 'ALTER TABLE referral ADD COLUMN date_submitted DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status',
            'updated_at' => 'ALTER TABLE referral ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER date_submitted',
            // Multiple people (e.g. an offender and a victim in the same incident)
            // can be submitted together from pages/teacher/referral-form.php —
            // each still gets its own referral row, referral_role tags that
            // person's part in it, and referral_group carries the same generated
            // code across every row from one multi-person submission so they can
            // be found together later. Both NULL for an ordinary single-person
            // referral, so existing rows/callers are unaffected.
            'referral_role' => 'ALTER TABLE referral ADD COLUMN referral_role VARCHAR(20) NULL AFTER gender',
            'referral_group' => 'ALTER TABLE referral ADD COLUMN referral_group VARCHAR(64) NULL AFTER referral_code'
        ];

        foreach ($requiredColumns as $columnName => $alterSql) {
            $legacyNames = [];
            if ($columnName === 'grade') {
                $legacyNames = ['Grade'];
            } elseif ($columnName === 'referral_reason') {
                $legacyNames = ['Reason'];
            } elseif ($columnName === 'teacher_id') {
                $legacyNames = ['TeacherID'];
            } elseif ($columnName === 'student_id') {
                $legacyNames = ['StudentID'];
            }

            if (!$this->hasColumn($columns, $columnName, $legacyNames)) {
                if (!$conn->query($alterSql)) {
                    $this->send_json(500, [
                        'success' => false,
                        'message' => 'Failed to update referral schema: ' . $conn->error
                    ]);
                }
            }
        }
    }

    private function fetchReferralRows(mysqli $conn, string $sql, string $types = '', array $params = []): array {
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
        }

        if ($types !== '') {
            $this->bindDynamicParams($stmt, $types, $params);
        }

        if (!$stmt->execute()) {
            $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
        }

        $result = $stmt->get_result();
        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $row['id'] = (int)($row['id'] ?? 0);
            $row['stage'] = (int)($row['stage'] ?? 1);
            $rows[] = $row;
        }

        $stmt->close();
        return $rows;
    }

    /**
     * Validates and inserts a single referral row from one person's payload,
     * sharing $sharedDefaults (reason, teacher info, school, etc.) for whichever
     * of those fields the person's own payload doesn't override. Used both for
     * an ordinary single-person submission and for each person in a multi-person
     * batch (see the POST handler) — every person still gets their own full row.
     * Calls send_json() directly (exiting) on validation/DB failure, same as
     * every other early-exit in this file; returns the row's response data on
     * success.
     *
     * @return array{id:int,referral_code:string,data:array}
     */
    private function insertReferralRecord(mysqli $conn, array $payload, array $sharedDefaults, ?string $referralGroup): array {
        $studentId = trim((string)($payload['student_id'] ?? $payload['studentId'] ?? ''));
        $studentName = trim((string)($payload['student_name'] ?? $payload['studentName'] ?? ''));
        $grade = trim((string)($payload['grade'] ?? ''));
        $section = trim((string)($payload['section'] ?? $sharedDefaults['section'] ?? ''));
        $age = trim((string)($payload['age'] ?? ''));
        $gender = trim((string)($payload['gender'] ?? ''));
        $referralRole = trim((string)($payload['referral_role'] ?? $payload['referralRole'] ?? ''));
        $referralReason = trim((string)($payload['referral_reason'] ?? $payload['referralReason'] ?? $sharedDefaults['referral_reason'] ?? ''));
        $description = trim((string)($payload['description'] ?? $sharedDefaults['description'] ?? ''));
        $interventionAttempts = trim((string)($payload['intervention_attempts'] ?? $payload['interventionAttempts'] ?? $sharedDefaults['intervention_attempts'] ?? ''));
        $observedBehaviors = trim((string)($payload['observed_behaviors'] ?? $payload['observedBehaviors'] ?? $sharedDefaults['observed_behaviors'] ?? ''));
        $parentGuardian = trim((string)($payload['parent_guardian'] ?? $payload['parentGuardian'] ?? ''));
        $parentContact = trim((string)($payload['parent_contact'] ?? $payload['parentContact'] ?? ''));
        $parentEmail = trim((string)($payload['parent_email'] ?? $payload['parentEmail'] ?? ''));
        $familyBackground = trim((string)($payload['family_background'] ?? $payload['familyBackground'] ?? $sharedDefaults['family_background'] ?? ''));
        $urgency = trim((string)($payload['urgency'] ?? $sharedDefaults['urgency'] ?? 'normal'));
        $teacherId = trim((string)($payload['teacher_id'] ?? $payload['teacherId'] ?? $sharedDefaults['teacher_id'] ?? ''));
        $teacherName = trim((string)($payload['teacher_name'] ?? $payload['teacherName'] ?? $sharedDefaults['teacher_name'] ?? ''));
        $teacherContact = trim((string)($payload['teacher_contact'] ?? $payload['teacherContact'] ?? $sharedDefaults['teacher_contact'] ?? ''));
        $schoolAttended = trim((string)($payload['school_attended'] ?? $payload['schoolAttended'] ?? $sharedDefaults['school_attended'] ?? ''));
        $studentSchool = trim((string)($payload['student_school'] ?? $payload['studentSchool'] ?? $sharedDefaults['student_school'] ?? $schoolAttended));
        $stage = (int)($payload['stage'] ?? $sharedDefaults['stage'] ?? 1);
        $status = trim((string)($payload['status'] ?? $sharedDefaults['status'] ?? 'pending'));

        if ($studentId === '') {
            $studentId = null;
        }

        if ($referralRole === '') {
            $referralRole = null;
        }

        if ($studentName === '' || $grade === '' || $referralReason === '' || $teacherName === '') {
            $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
        }

        if ($schoolAttended === '') {
            $schoolAttended = $studentSchool;
        }

        if ($schoolAttended === '' && $teacherId !== '') {
            $schoolLookup = $conn->prepare('SELECT school_attended FROM users_tables WHERE AccountID = ? LIMIT 1');
            if ($schoolLookup) {
                $teacherIdInt = (int)$teacherId;
                $schoolLookup->bind_param('i', $teacherIdInt);
                if ($schoolLookup->execute()) {
                    $result = $schoolLookup->get_result();
                    if ($row = $result->fetch_assoc()) {
                        $schoolAttended = trim((string)($row['school_attended'] ?? ''));
                    }
                }
                $schoolLookup->close();
            }
        }

        if ($schoolAttended === '') {
            $this->send_json(400, ['success' => false, 'message' => 'School is required to save a referral']);
        }

        $referralCode = 'REF-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $referralId = $this->nextReferralId($conn);
        $dateSubmitted = date('Y-m-d H:i:s');

        $sql = "
        INSERT INTO referral (
            ReferralID,
            StudentID,
            Grade,
            Schedule,
            Reason,
            TeacherID,
            case_table,
            referral_code,
            referral_group,
            student_name,
            student_id,
            section,
            age,
            gender,
            referral_role,
            description,
            intervention_attempts,
            observed_behaviors,
            parent_guardian,
            parent_contact,
            parent_email,
            family_background,
            urgency,
            teacher_name,
            teacher_contact,
            school_attended,
            student_school,
            stage,
            status,
            date_submitted,
            updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
    ";

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
        }

        $caseTable = null;
        $params = [
            $referralId,
            $studentId,
            $grade,
            $dateSubmitted,
            $referralReason,
            $teacherId,
            $caseTable,
            $referralCode,
            $referralGroup,
            $studentName,
            $studentId,
            $section,
            $age,
            $gender,
            $referralRole,
            $description,
            $interventionAttempts,
            $observedBehaviors,
            $parentGuardian,
            $parentContact,
            $parentEmail,
            $familyBackground,
            $urgency,
            $teacherName,
            $teacherContact,
            $schoolAttended,
            $studentSchool,
            $stage,
            $status,
            $dateSubmitted,
            $dateSubmitted
        ];
        $types = str_repeat('s', count($params));

        $this->bindDynamicParams($stmt, $types, $params);

        if (!$stmt->execute()) {
            $this->send_json(500, ['success' => false, 'message' => 'Failed to save referral: ' . $stmt->error]);
        }

        $stmt->close();

        return [
            'id' => $referralId,
            'referral_code' => $referralCode,
            'data' => [
                'id' => $referralId,
                'referral_code' => $referralCode,
                'referral_group' => $referralGroup,
                'student_name' => $studentName,
                'student_id' => $studentId,
                'grade' => $grade,
                'section' => $section,
                'age' => $age,
                'gender' => $gender,
                'referral_role' => $referralRole,
                'referral_reason' => $referralReason,
                'description' => $description,
                'intervention_attempts' => $interventionAttempts,
                'observed_behaviors' => $observedBehaviors,
                'parent_guardian' => $parentGuardian,
                'parent_contact' => $parentContact,
                'parent_email' => $parentEmail,
                'family_background' => $familyBackground,
                'urgency' => $urgency,
                'teacher_id' => $teacherId,
                'teacher_name' => $teacherName,
                'teacher_contact' => $teacherContact,
                'school_attended' => $schoolAttended,
                'student_school' => $studentSchool,
                'stage' => $stage,
                'status' => $status,
                'date_submitted' => $dateSubmitted
            ]
        ];
    }
}
