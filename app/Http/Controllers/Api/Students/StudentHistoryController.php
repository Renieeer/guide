<?php

namespace App\Http\Controllers\Api\Students;

use App\Http\Controllers\Controller;
use mysqli;

class StudentHistoryController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        ensure_users_table_active_column($conn);

        /* Aggregates every guidance-office record tied to one student — referrals
           (+ their screening notes), counseling case scenarios, counseling
           follow-ups (the "appointment span" of a case over time), and online
           appointment requests — into one payload so the Student History page can
           render all four record folders from a single request instead of one
           fetch per record type. */

        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
        }

        $studentId = trim((string)($_GET['student_id'] ?? ''));
        if ($studentId === '') {
            $this->send_json(400, ['success' => false, 'message' => 'student_id is required']);
        }

        // The Stage 2 assessment document is confidential — staff (counselor,
        // other-school, coordinator) see it in the history timeline, the student
        // it's about never does. pages/student/appointment-history.js and
        // pages/student/dashboard.js pass role=student; every staff caller omits
        // role, so the default is to include it.
        $callerRole = strtolower(trim((string)($_GET['role'] ?? '')));
        $includeAssessments = $callerRole !== 'student';

        $studentStmt = $conn->prepare('
    SELECT s.StudentId, s.AccountID, s.LRN, s.FirstName, s.MiddleName, s.LastName, s.Nickname, s.Sex, s.Age, s.Grade, s.Section,
           s.EmailAccount, s.CellphoneNumber, s.DateOfBirth, s.PlaceOfBirth, s.ReligionFromBirth, s.CurrentReligion,
           s.CurrentAddress, s.PermanentAddress, u.is_active
    FROM student_table s
    LEFT JOIN users_tables u ON u.AccountID = s.AccountID
    WHERE s.StudentId = ?
');
        if (!$studentStmt) {
            $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
        }
        $studentStmt->bind_param('s', $studentId);
        if (!$studentStmt->execute()) {
            $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $studentStmt->error]);
        }
        $student = $studentStmt->get_result()->fetch_assoc();
        $studentStmt->close();

        if (!$student) {
            $this->send_json(404, ['success' => false, 'message' => 'Student not found']);
        }

        // Defense-in-depth: keep a grade-scoped counselor/coordinator from pulling
        // a student outside their assigned grade(s) even via a guessed/typed URL.
        $gradeScope = grade_scope_to_list($_GET['grade_scope'] ?? '');
        if (!empty($gradeScope)) {
            ensureSchoolsTable($conn);
            $isElementary = student_account_school_is_elementary($conn, $student['AccountID'] ?? null);
            if (!grade_matches_scope($student['Grade'] ?? null, $gradeScope, $isElementary)) {
                $this->send_json(403, ['success' => false, 'message' => 'This student is outside your assigned grade scope']);
            }
        }

        // ---------------------------------------------------------------------
        // Referrals (+ nested Stage-2 screening notes)
        // ---------------------------------------------------------------------
        $referrals = [];
        if ($this->table_exists($conn, 'referral')) {
            $stmt = $conn->prepare('
        SELECT * FROM referral
        WHERE (student_id = ? OR StudentID = ?)
        ORDER BY date_submitted DESC, ReferralID DESC
    ');
            if ($stmt) {
                $stmt->bind_param('ss', $studentId, $studentId);
                if ($stmt->execute()) {
                    $result = $stmt->get_result();
                    while ($row = $result->fetch_assoc()) {
                        $referrals[] = [
                            'id' => (int)($row['ReferralID'] ?? 0),
                            'referral_code' => $row['referral_code'] ?? null,
                            'referral_reason' => $row['Reason'] ?? '',
                            'description' => $row['description'] ?? '',
                            'intervention_attempts' => $row['intervention_attempts'] ?? '',
                            'observed_behaviors' => $row['observed_behaviors'] ?? '',
                            'parent_guardian' => $row['parent_guardian'] ?? '',
                            'parent_contact' => $row['parent_contact'] ?? '',
                            'urgency' => $row['urgency'] ?? 'normal',
                            'stage' => (int)($row['stage'] ?? 1),
                            'stage_note' => $row['stage_note'] ?? '',
                            'status' => $row['status'] ?? 'pending',
                            'teacher_name' => $row['teacher_name'] ?? '',
                            'grade' => $row['Grade'] ?? '',
                            'section' => $row['section'] ?? '',
                            'date_submitted' => $row['date_submitted'] ?? null,
                            'updated_at' => $row['updated_at'] ?? null,
                            'screenings' => [],
                            'assessments' => [],
                            'stage_log' => []
                        ];
                    }
                }
                $stmt->close();
            }

            if (!empty($referrals) && $this->table_exists($conn, 'referral_screening')) {
                $ids = array_column($referrals, 'id');
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $types = str_repeat('i', count($ids));
                $stmt = $conn->prepare("
            SELECT * FROM referral_screening
            WHERE referral_id IN ($placeholders)
            ORDER BY created_at ASC, screening_id ASC
        ");
                if ($stmt) {
                    $stmt->bind_param($types, ...$ids);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        $screeningsByReferral = [];
                        while ($row = $result->fetch_assoc()) {
                            $screeningsByReferral[(int)$row['referral_id']][] = [
                                'screening_id' => (int)$row['screening_id'],
                                'interview_notes' => $row['interview_notes'] ?? '',
                                'observations' => $row['observations'] ?? '',
                                'risk_level' => $row['risk_level'] ?? '',
                                'counselor_name' => $row['counselor_name'] ?? '',
                                // Distinguishes a Stage 1 Interview/Background entry
                                // from a Stage 2 Risk Assessment one — read by
                                // shBuildReferralThreadEntry() in student-history.js
                                // to label each "Day N" correctly. Defaults to 2 for
                                // any row inserted before this column existed.
                                'stage' => isset($row['stage']) ? (int)$row['stage'] : 2,
                                'created_at' => $row['created_at'] ?? null
                            ];
                        }
                        foreach ($referrals as &$ref) {
                            $ref['screenings'] = $screeningsByReferral[$ref['id']] ?? [];
                        }
                        unset($ref);
                    }
                    $stmt->close();
                }
            }

            // The Stage 2 assessment document itself (see api/referral-assessment.php)
            // — staff-only, per $includeAssessments above.
            if ($includeAssessments && !empty($referrals) && $this->table_exists($conn, 'referral_assessment')) {
                $ids = array_column($referrals, 'id');
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $types = str_repeat('i', count($ids));
                $stmt = $conn->prepare("
            SELECT assessment_id, referral_id, original_filename, file_size, uploaded_by, uploaded_at
            FROM referral_assessment
            WHERE referral_id IN ($placeholders)
            ORDER BY uploaded_at ASC, assessment_id ASC
        ");
                if ($stmt) {
                    $stmt->bind_param($types, ...$ids);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        $assessmentsByReferral = [];
                        while ($row = $result->fetch_assoc()) {
                            $assessmentsByReferral[(int)$row['referral_id']][] = [
                                'assessment_id' => (int)$row['assessment_id'],
                                'file_name' => $row['original_filename'] ?? '',
                                'file_size' => (int)($row['file_size'] ?? 0),
                                'uploaded_by' => $row['uploaded_by'] ?? '',
                                'uploaded_at' => $row['uploaded_at'] ?? null,
                                // The bytes live in referral_assessment.file_data (a BLOB) —
                                // this points at api/referral-assessment.php's own streaming
                                // endpoint instead of a static uploads/ path.
                                'url' => '../../api/referral-assessment?view=' . (int)$row['assessment_id']
                            ];
                        }
                        foreach ($referrals as &$ref) {
                            $ref['assessments'] = $assessmentsByReferral[$ref['id']] ?? [];
                        }
                        unset($ref);
                    }
                    $stmt->close();
                }
            }

            // Every stage transition this referral has gone through — see
            // api/update-referral.php, which writes one row here per change instead
            // of only keeping the single latest stage_note. Narrated into the
            // timeline by shDescribeStageTransition() in {counselor,other-school}/
            // student-history.js and student/appointment-history.js.
            if (!empty($referrals) && $this->table_exists($conn, 'referral_stage_log')) {
                $ids = array_column($referrals, 'id');
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $types = str_repeat('i', count($ids));
                $stmt = $conn->prepare("
            SELECT * FROM referral_stage_log
            WHERE referral_id IN ($placeholders)
            ORDER BY changed_at ASC, id ASC
        ");
                if ($stmt) {
                    $stmt->bind_param($types, ...$ids);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        $logByReferral = [];
                        while ($row = $result->fetch_assoc()) {
                            $logByReferral[(int)$row['referral_id']][] = [
                                'from_stage' => (int)$row['from_stage'],
                                'to_stage' => (int)$row['to_stage'],
                                'note' => $row['note'] ?? '',
                                'changed_by' => $row['changed_by'] ?? '',
                                'changed_at' => $row['changed_at'] ?? null
                            ];
                        }
                        foreach ($referrals as &$ref) {
                            $ref['stage_log'] = $logByReferral[$ref['id']] ?? [];
                        }
                        unset($ref);
                    }
                    $stmt->close();
                }
            }
        }

        // ---------------------------------------------------------------------
        // Counseling case scenarios that embed this student
        // ---------------------------------------------------------------------
        $counseling = [];
        $hasCaseTable = $this->table_exists($conn, 'counselor_case_scenarios');
        if ($hasCaseTable) {
            $needle = '"id":"' . $studentId . '"';
            $stmt = $conn->prepare("
        SELECT * FROM counselor_case_scenarios
        WHERE students_json LIKE CONCAT('%', ?, '%')
        ORDER BY created_at DESC
    ");
            if ($stmt) {
                $stmt->bind_param('s', $needle);
                if ($stmt->execute()) {
                    $result = $stmt->get_result();
                    while ($row = $result->fetch_assoc()) {
                        $studentsArr = json_decode((string)($row['students_json'] ?? '[]'), true) ?: [];
                        $recordsMap = json_decode((string)($row['counseling_records_json'] ?? '{}'), true) ?: [];

                        // LIKE above is a coarse prefilter (avoids a full table scan
                        // in PHP); confirm real membership here so a substring hit
                        // like "STU1" inside "STU12" can't leak another student's case.
                        $matchedStudent = null;
                        foreach ($studentsArr as $s) {
                            if ((string)($s['id'] ?? '') === $studentId) {
                                $matchedStudent = $s;
                                break;
                            }
                        }
                        if ($matchedStudent === null) {
                            continue;
                        }

                        $counseling[] = [
                            'case_uid' => $row['case_uid'] ?? '',
                            'referral_code' => $row['referral_code'] ?? '',
                            'case_title' => $row['case_title'] ?? '',
                            'section_name' => $row['section_name'] ?? '',
                            'category_name' => $row['category_name'] ?? ($recordsMap[$studentId]['categoryName'] ?? ''),
                            'case_date' => $row['case_date'] ?? null,
                            'case_summary' => $row['case_summary'] ?? '',
                            'case_objective' => $row['case_objective'] ?? '',
                            'first_action' => $row['first_action'] ?? '',
                            'status' => $row['status'] ?? 'pending',
                            'counselor_name' => $row['counselor_name'] ?? '',
                            'student_role' => $matchedStudent['role'] ?? '',
                            'student_detail' => $recordsMap[$studentId] ?? null,
                            'created_at' => $row['created_at'] ?? null,
                            'updated_at' => $row['updated_at'] ?? null
                        ];
                    }
                }
                $stmt->close();
            }
        }

        // ---------------------------------------------------------------------
        // Counseling follow-ups — the recurring "appointment span" of a case
        // ---------------------------------------------------------------------
        $followUps = [];
        if ($this->table_exists($conn, 'follow_up') && $this->table_exists($conn, 'follow_up_note')) {
            $caseTitleSelect = $hasCaseTable ? 'cs.case_title' : 'NULL';
            $caseJoin = $hasCaseTable ? 'LEFT JOIN counselor_case_scenarios cs ON cs.case_uid = fu.case_uid' : '';

            $stmt = $conn->prepare("
        SELECT fu.Follow_id AS follow_up_id, fu.Title AS title, fu.case_uid, fu.category_name, fu.follow_up_date,
               fu.counselor_name, fu.created_at, n.note, {$caseTitleSelect} AS case_title
        FROM follow_up fu
        JOIN follow_up_note n ON n.follow_up_id = fu.Follow_id
        {$caseJoin}
        WHERE n.student_id = ?
        ORDER BY fu.follow_up_date DESC, fu.Follow_id DESC
    ");
            if ($stmt) {
                $stmt->bind_param('s', $studentId);
                if ($stmt->execute()) {
                    $result = $stmt->get_result();
                    while ($row = $result->fetch_assoc()) {
                        $followUps[] = [
                            'follow_up_id' => (int)$row['follow_up_id'],
                            'title' => $row['title'] ?? '',
                            'case_uid' => $row['case_uid'] ?? '',
                            'case_title' => $row['case_title'] ?? '',
                            'category_name' => $row['category_name'] ?? '',
                            'follow_up_date' => $row['follow_up_date'] ?? null,
                            'note' => $row['note'] ?? '',
                            'counselor_name' => $row['counselor_name'] ?? '',
                            'created_at' => $row['created_at'] ?? null
                        ];
                    }
                }
                $stmt->close();
            }
        }

        // ---------------------------------------------------------------------
        // Online appointment requests
        // appointment_requests.student_id is an int, but it's populated from two
        // different flows that don't agree on what identifies a student: the
        // self-service student portal sends getCurrentUser().id (their
        // users_tables AccountID), while the counselor's "Appoint Students" case
        // action sends the case's embedded student.id (student_table.StudentId).
        // Both are matched here since either can be the true key for a given row.
        // ---------------------------------------------------------------------
        $appointments = [];
        $candidateIds = [];
        if (!empty($student['AccountID'])) {
            $candidateIds[] = (int)$student['AccountID'];
        }
        if (ctype_digit($studentId)) {
            $candidateIds[] = (int)$studentId;
        }
        $candidateIds = array_values(array_unique($candidateIds));

        if (!empty($candidateIds) && $this->table_exists($conn, 'appointment_requests')) {
            $placeholders = implode(',', array_fill(0, count($candidateIds), '?'));
            $types = str_repeat('i', count($candidateIds));
            $stmt = $conn->prepare("
        SELECT * FROM appointment_requests
        WHERE student_id IN ($placeholders)
        ORDER BY preferred_date DESC, preferred_time DESC
    ");
            if ($stmt) {
                $stmt->bind_param($types, ...$candidateIds);
                if ($stmt->execute()) {
                    $result = $stmt->get_result();
                    while ($row = $result->fetch_assoc()) {
                        $appointments[] = [
                            'id' => $row['request_id'] ?? '',
                            'preferred_date' => $row['preferred_date'] ?? null,
                            'preferred_time' => $row['preferred_time'] ?? '',
                            'reason' => $row['reason'] ?? '',
                            'notes' => $row['notes'] ?? '',
                            'status' => $row['status'] ?? 'pending',
                            'counselor_notes' => $row['counselor_notes'] ?? '',
                            'case_uid' => $row['case_uid'] ?? '',
                            'created_at' => $row['created_at'] ?? null,
                            'updated_at' => $row['updated_at'] ?? null
                        ];
                    }
                }
                $stmt->close();
            }
        }

        $studentName = trim(($student['FirstName'] ?? '') . ' ' . ($student['LastName'] ?? ''));

        $this->send_json(200, [
            'success' => true,
            'student' => [
                'student_id' => $student['StudentId'] ?? $studentId,
                'name' => $studentName,
                'first_name' => $student['FirstName'] ?? '',
                'middle_name' => $student['MiddleName'] ?? '',
                'last_name' => $student['LastName'] ?? '',
                'nickname' => $student['Nickname'] ?? '',
                'lrn' => $student['LRN'] ?? '',
                'sex' => $student['Sex'] ?? '',
                'age' => $student['Age'] ?? '',
                'date_of_birth' => $student['DateOfBirth'] ?? '',
                'place_of_birth' => $student['PlaceOfBirth'] ?? '',
                'religion_from_birth' => $student['ReligionFromBirth'] ?? '',
                'current_religion' => $student['CurrentReligion'] ?? '',
                'current_address' => $student['CurrentAddress'] ?? '',
                'permanent_address' => $student['PermanentAddress'] ?? '',
                'grade' => $student['Grade'] ?? '',
                'section' => $student['Section'] ?? '',
                'email' => $student['EmailAccount'] ?? '',
                'contact' => $student['CellphoneNumber'] ?? '',
                // No AccountID (no self-service account yet) still counts as an
                // active learner — only an explicit is_active=0 (SDO deactivation)
                // marks them inactive.
                'is_active' => $student['AccountID'] !== null && isset($student['is_active']) ? (int)$student['is_active'] : 1
            ],
            'data' => [
                'referrals' => $referrals,
                'counseling' => $counseling,
                'follow_ups' => $followUps,
                'appointments' => $appointments
            ],
            'counts' => [
                'referrals' => count($referrals),
                'counseling' => count($counseling),
                'follow_ups' => count($followUps),
                'appointments' => count($appointments)
            ]
        ]);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    private function table_exists(mysqli $conn, string $tableName): bool {
        $result = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($tableName) . "'");
        return $result && $result->num_rows > 0;
    }
}
