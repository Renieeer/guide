<?php

namespace App\Http\Controllers\Api\Students;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Exception;
use mysqli;
use mysqli_stmt;

class GetStudentsController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $school     = isset($_GET['school']) ? trim($_GET['school']) : '';
            $search     = isset($_GET['search']) ? trim($_GET['search']) : '';
            $limit      = isset($_GET['limit'])  ? (int)$_GET['limit']  : 0;
            $gradeScope = grade_scope_to_list($_GET['grade_scope'] ?? '');

            if ($school === '' && $search === '') {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'school is required when no search query is provided']);
            }

            // ------------------------------------------------------------------
            // Referral count sub-join (optional table)
            // ------------------------------------------------------------------
            $referralCountJoin = '';
            if ($this->tableExists($conn, 'referral')) {
                $referralCountJoin = 'LEFT JOIN (
            SELECT StudentID, COUNT(*) AS referral_count
            FROM referral GROUP BY StudentID
        ) r ON r.StudentID = s.StudentId';
            }

            // ------------------------------------------------------------------
            // BASE SELECT
            // LEFT JOIN users_tables so students with AccountID = NULL are kept.
            // (INNER JOIN was silently dropping every unlinked student row.)
            // ------------------------------------------------------------------
            $baseSelect = "
        SELECT
            s.StudentId AS id,
            s.StudentId,
            s.FirstName  AS first_name,
            s.LastName   AS last_name,
            s.MiddleName AS middle_name,
            s.Nickname   AS nickname,
            s.Sex        AS sex,
            s.Age        AS age,
            s.DateOfBirth  AS date_of_birth,
            s.Grade        AS grade_level,
            s.Grade        AS grade_id,
            s.Section      AS section,
            s.EmailAccount AS student_email,
            u.email           AS email,
            u.school_attended AS school_attended,
            COALESCE(r.referral_count, 0) AS referral_count
        FROM student_table s
        LEFT JOIN users_tables u ON u.AccountID = s.AccountID
        {$referralCountJoin}
    ";

            // ------------------------------------------------------------------
            // WHERE clauses
            // ------------------------------------------------------------------
            $params       = [];
            $types        = '';
            $whereClauses = [];

            // School filter — match against users_tables.school_attended.
            // Students with no linked account (AccountID IS NULL, so
            // u.school_attended is also NULL) have no determinable school and are
            // therefore EXCLUDED when a school filter is applied — showing them to
            // every school regardless of the filter would leak them across schools.
            if ($school !== '') {
                // Build allowed-school list (check schools table for aliases)
                $allowedSchools = [$school];
                if ($this->tableExists($conn, 'schools')) {
                    $sl = $conn->prepare(
                        'SELECT school_name, school_code FROM schools
                 WHERE school_name = ? OR school_code = ? LIMIT 1'
                    );
                    if ($sl) {
                        $sl->bind_param('ss', $school, $school);
                        if ($sl->execute()) {
                            $r = $sl->get_result();
                            if ($row = $r->fetch_assoc()) {
                                $allowedSchools[] = $row['school_name'];
                                $allowedSchools[] = $row['school_code'];
                            }
                        }
                        $sl->close();
                    }
                }
                $allowedSchools = array_values(array_unique(array_filter(
                    $allowedSchools,
                    fn($v) => trim((string)$v) !== ''
                )));

                $likes        = array_map(fn($v) => "%{$v}%", $allowedSchools);
                $placeholders = implode(' OR ', array_fill(0, count($likes), 'u.school_attended LIKE ?'));

                $whereClauses[] = "({$placeholders})";
                $types          .= str_repeat('s', count($likes));
                $params          = array_merge($params, $likes);
            }

            // Grade-scope filter — restricts a per-grade counselor/coordinator to
            // only the grade(s) they're assigned. Empty scope means no restriction.
            $gradeClause = build_grade_in_clause('s.Grade', $gradeScope);
            if ($gradeClause !== null) {
                [$sql, $clauseParams, $clauseTypes] = $gradeClause;
                $whereClauses[] = $sql;
                $types          .= $clauseTypes;
                $params          = array_merge($params, $clauseParams);
            }

            // Search filter — name, nickname, email
            if ($search !== '') {
                $whereClauses[] = "(
            s.FirstName  LIKE ? OR
            s.LastName   LIKE ? OR
            CONCAT(s.FirstName, ' ', s.LastName) LIKE ? OR
            s.MiddleName   LIKE ? OR
            s.Nickname     LIKE ? OR
            s.EmailAccount LIKE ? OR
            u.email        LIKE ?
        )";
                $types .= 'sssssss';
                $like   = "%{$search}%";
                for ($i = 0; $i < 7; $i++) $params[] = $like;
            }

            $whereSql   = count($whereClauses) ? 'WHERE ' . implode(' AND ', $whereClauses) : '';
            $orderLimit = 'ORDER BY s.LastName ASC, s.FirstName ASC';
            if ($limit > 0) {
                $orderLimit .= ' LIMIT ?';
                $types      .= 'i';
                $params[]    = $limit;
            }

            $query = $baseSelect . ' ' . $whereSql . ' ' . $orderLimit;

            $stmt = $conn->prepare($query);
            if (!$stmt) throw new Exception('Prepare failed: ' . $conn->error);

            if ($types !== '') $this->bindDynamicParams($stmt, $types, $params);

            if (!$stmt->execute()) throw new Exception('Execute failed: ' . $stmt->error);

            $result   = $stmt->get_result();
            $rawStudents = $result->fetch_all(MYSQLI_ASSOC);
            $stmt->close();

            $elementaryFlags = $this->elementary_flags_by_school($conn, array_column($rawStudents, 'school_attended'));

            $students = [];
            foreach ($rawStudents as $row) {
                $isElementary = $elementaryFlags[$row['school_attended'] ?? ''] ?? false;
                $row['grade_name'] = $this->formatGradeLabel($row['grade_id'] ?? $row['grade_level'] ?? $row['Grade'] ?? '', $isElementary);
                $students[] = $row;
            }

            $response = [
                'success' => true,
                'data'    => $students,
                'count'   => count($students),
                'school'  => $school,
            ];

            // Temporary debug output — remove when done testing
            if (!empty($_GET['debug'])) {
                $response['debug_sql']    = $query;
                $response['debug_params'] = $params;
            }

            json_out($response);

        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Exception $e) {
            http_response_code(500);
            json_out(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function tableExists(mysqli $conn, string $tableName): bool {
        $result = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($tableName) . "'");
        return $result && $result->num_rows > 0;
    }

    private function bindDynamicParams(mysqli_stmt $stmt, string $types, array &$params): void {
        $bindings = [$types];
        foreach ($params as $index => $value) {
            $bindings[] = &$params[$index];
        }
        call_user_func_array([$stmt, 'bind_param'], $bindings);
    }

    // Elementary schools store a LITERAL grade number (1-6) in student_table.Grade
    // — same as secondary schools store a literal 7-12 for any record created
    // through the current grade dropdown (see gradesForSchoolLevel() in
    // api/school-config.php). Only OLD secondary records predating that still
    // use a legacy 1-4 shorthand for Grade 7-10 (mirrors normalizeGradeValue()'s
    // isElementarySchool guard in pages/student/student-information.js — that
    // legacy map only ever went up to 4->10, nothing for 5/6, since Grade 11/12
    // never had a shorthand code). Applying it unconditionally regardless of
    // school level — as this used to — mislabels a real elementary Grade 6
    // student as "Grade 12", since '6' collides with the old secondary shorthand.
    private function formatGradeLabel($grade, bool $isElementary): string {
        $grade = trim((string)$grade);
        if ($grade === '') {
            return '';
        }

        if (preg_match('/^grade\s*(\d+)$/i', $grade, $matches)) {
            return 'Grade ' . $matches[1];
        }

        if (!$isElementary) {
            $legacyMap = [
                '1' => 'Grade 7',
                '2' => 'Grade 8',
                '3' => 'Grade 9',
                '4' => 'Grade 10',
            ];

            if (isset($legacyMap[$grade])) {
                return $legacyMap[$grade];
            }
        }

        if (ctype_digit($grade)) {
            return 'Grade ' . $grade;
        }

        return $grade;
    }

    /** Batch-looks-up each given school name/code's level in one query, keyed
     *  by every alias (name AND code) so a row's school_attended — which can
     *  hold either — resolves either way. Missing/unknown schools default to
     *  non-elementary (the old, pre-fix behavior) rather than guessing. */
    private function elementary_flags_by_school(mysqli $conn, array $schoolNames): array {
        $schoolNames = array_values(array_unique(array_filter($schoolNames, fn($v) => trim((string)$v) !== '')));
        if (empty($schoolNames) || !$this->tableExists($conn, 'schools')) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($schoolNames), '?'));
        $types = str_repeat('s', count($schoolNames));
        $stmt = $conn->prepare("SELECT school_name, school_code, school_level FROM schools WHERE school_name IN ($placeholders) OR school_code IN ($placeholders)");
        if (!$stmt) {
            return [];
        }
        $stmt->bind_param($types . $types, ...array_merge($schoolNames, $schoolNames));
        $stmt->execute();
        $result = $stmt->get_result();

        $flags = [];
        while ($row = $result->fetch_assoc()) {
            $isElementary = in_array($row['school_level'], ['East', 'West', 'South'], true);
            $flags[$row['school_name']] = $isElementary;
            $flags[$row['school_code']] = $isElementary;
        }
        $stmt->close();

        return $flags;
    }
}
