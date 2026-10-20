<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use InvalidArgumentException;
use mysqli;
use RuntimeException;
use Throwable;

class SdoSchoolStaffController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $transactionStarted = false;

        try {
            ensure_users_table_grade_column($conn);
            ensure_users_table_active_column($conn);

            if ($_SERVER['REQUEST_METHOD'] === 'GET') {
                json_out([
                    'success' => true,
                    'assignments' => $this->getAssignments($conn)
                ]);
            }

            if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
                $input = file_get_contents('php://input');
                $data = json_decode($input, true);
                $action = is_array($data) ? ($data['action'] ?? '') : '';

                if ($action === 'updateGrade') {
                    $accountId = (int)($data['accountId'] ?? 0);
                    $grade = $this->normalizeGradeScopeInput($data['grade'] ?? '');

                    if ($accountId <= 0) {
                        http_response_code(400);
                        json_out(['success' => false, 'message' => 'accountId is required']);
                    }

                    $stmt = $conn->prepare('UPDATE users_tables SET Grade = NULLIF(?, "") WHERE AccountID = ?');
                    if (!$stmt) {
                        throw new RuntimeException('Failed to prepare grade update statement');
                    }
                    $stmt->bind_param('si', $grade, $accountId);
                    if (!$stmt->execute()) {
                        $stmt->close();
                        throw new RuntimeException('Failed to update grade assignment');
                    }
                    $stmt->close();

                    json_out(['success' => true, 'message' => 'Grade assignment updated.']);
                }

                if ($action === 'revokeSchool') {
                    $schoolCode = trim((string)($data['schoolCode'] ?? ''));

                    if ($schoolCode === '') {
                        http_response_code(400);
                        json_out(['success' => false, 'message' => 'schoolCode is required']);
                    }

                    $stmt = $conn->prepare('UPDATE schools SET is_active = 0 WHERE school_code = ?');
                    if (!$stmt) {
                        throw new RuntimeException('Failed to prepare school revoke statement');
                    }
                    $stmt->bind_param('s', $schoolCode);
                    if (!$stmt->execute()) {
                        $stmt->close();
                        throw new RuntimeException('Failed to revoke school access');
                    }
                    $stmt->close();

                    json_out(['success' => true, 'message' => 'School access revoked.']);
                }

                if ($action === 'updateSchoolInfo') {
                    $schoolCode = trim((string)($data['schoolCode'] ?? ''));
                    $schoolLevel = trim((string)($data['schoolLevel'] ?? ''));
                    $newSchoolName = trim((string)($data['schoolName'] ?? ''));

                    if ($schoolCode === '' || $newSchoolName === '') {
                        http_response_code(400);
                        json_out(['success' => false, 'message' => 'schoolCode and schoolName are required']);
                    }
                    if (!in_array($schoolLevel, ['Secondary', 'East', 'West', 'South'], true)) {
                        http_response_code(400);
                        json_out(['success' => false, 'message' => 'Invalid school level']);
                    }

                    $currentStmt = $conn->prepare('SELECT school_name FROM schools WHERE school_code = ?');
                    if (!$currentStmt) {
                        throw new RuntimeException('Failed to prepare school lookup statement');
                    }
                    $currentStmt->bind_param('s', $schoolCode);
                    $currentStmt->execute();
                    $current = $currentStmt->get_result()->fetch_assoc();
                    $currentStmt->close();

                    if (!$current) {
                        http_response_code(404);
                        json_out(['success' => false, 'message' => 'School not found']);
                    }
                    $oldSchoolName = $current['school_name'];

                    if (strcasecmp($oldSchoolName, $newSchoolName) !== 0) {
                        $dupStmt = $conn->prepare('SELECT school_code FROM schools WHERE school_name = ? AND school_code != ? LIMIT 1');
                        if (!$dupStmt) {
                            throw new RuntimeException('Failed to prepare school name uniqueness check');
                        }
                        $dupStmt->bind_param('ss', $newSchoolName, $schoolCode);
                        $dupStmt->execute();
                        $duplicate = $dupStmt->get_result()->fetch_assoc();
                        $dupStmt->close();

                        if ($duplicate) {
                            http_response_code(400);
                            json_out(['success' => false, 'message' => 'Another school already uses that name.']);
                        }
                    }

                    $conn->begin_transaction();
                    $transactionStarted = true;

                    // district is auto-set to match the school's own name at creation
                    // (see upsertSchoolRecord() in api/school-config.php) and has no
                    // separate editor, so a rename needs to carry district along with
                    // it to keep that invariant — otherwise the school keeps reporting
                    // under its old district name in School Reports/District Report
                    // Cases until fixed directly in the DB.
                    $stmt = $conn->prepare('UPDATE schools SET school_name = ?, school_level = ?, district = ? WHERE school_code = ?');
                    if (!$stmt) {
                        throw new RuntimeException('Failed to prepare school info update statement');
                    }
                    $stmt->bind_param('ssss', $newSchoolName, $schoolLevel, $newSchoolName, $schoolCode);
                    if (!$stmt->execute()) {
                        $stmt->close();
                        throw new RuntimeException('Failed to update school info');
                    }
                    $stmt->close();

                    // Staff accounts are matched to a school by school_attended, which
                    // can hold either the school's code or its name (see
                    // getAssignments()) — any account currently linked by the OLD
                    // name needs to move to the new one so it doesn't silently fall
                    // out of this school's roster.
                    if (strcasecmp($oldSchoolName, $newSchoolName) !== 0) {
                        $relink = $conn->prepare('UPDATE users_tables SET school_attended = ? WHERE school_attended = ?');
                        if (!$relink) {
                            throw new RuntimeException('Failed to prepare account relink statement');
                        }
                        $relink->bind_param('ss', $newSchoolName, $oldSchoolName);
                        if (!$relink->execute()) {
                            $relink->close();
                            throw new RuntimeException('Failed to relink staff accounts to the renamed school');
                        }
                        $relink->close();
                    }

                    $conn->commit();
                    $transactionStarted = false;

                    json_out(['success' => true, 'message' => 'School info updated.']);
                }

                if ($action === 'setActive') {
                    $accountId = (int)($data['accountId'] ?? 0);
                    $active = !empty($data['active']) ? 1 : 0;

                    if ($accountId <= 0) {
                        http_response_code(400);
                        json_out(['success' => false, 'message' => 'accountId is required']);
                    }

                    $stmt = $conn->prepare('UPDATE users_tables SET is_active = ? WHERE AccountID = ?');
                    if (!$stmt) {
                        throw new RuntimeException('Failed to prepare account status update statement');
                    }
                    $stmt->bind_param('ii', $active, $accountId);
                    if (!$stmt->execute()) {
                        $stmt->close();
                        throw new RuntimeException('Failed to update account status');
                    }
                    $stmt->close();

                    json_out([
                        'success' => true,
                        'message' => $active ? 'Account activated.' : 'Account deactivated.'
                    ]);
                }

                http_response_code(400);
                json_out(['success' => false, 'message' => 'Invalid request body']);
            }

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                json_out(['success' => false, 'message' => 'Method not allowed']);
            }

            $input = file_get_contents('php://input');
            $data = json_decode($input, true);

            if (!is_array($data)) {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'Invalid request body']);
            }

            $schoolName = trim((string)($data['schoolName'] ?? ''));
            $assignType = trim((string)($data['assignType'] ?? ''));
            $schoolLevel = trim((string)($data['schoolLevel'] ?? ''));
            // Set only when this submission is replacing an existing coordinator/
            // counselor/combined account (see school-management.js's "Replace
            // Account" button) — that old account is deactivated, not deleted, so
            // every record tied to it (cases, referrals, etc.) stays on file.
            $replaceAccountId = (int)($data['replaceAccountId'] ?? 0);

            if ($schoolName === '') {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'School name is required']);
            }

            if (!in_array($assignType, ['coordinator', 'counselor', 'both', 'combined'], true)) {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'Invalid assignment type']);
            }

            // East/West/South are elementary-only levels; Secondary is the default
            // for everything else (and for existing schools whose level is locked
            // client-side when just adding another account — see school-management.js).
            if (!in_array($schoolLevel, ['Secondary', 'East', 'West', 'South'], true)) {
                $schoolLevel = 'Secondary';
            }

            // schools.assignment_type only distinguishes coordinator/counselor/both;
            // "combined" (single counselor-and-coordinator login) still needs both
            // roles available at the school, so it maps onto 'both' there.
            $schoolAssignmentType = $assignType === 'combined' ? 'both' : $assignType;
            $schoolRecord = upsertSchoolRecord($conn, $schoolName, $schoolAssignmentType, $schoolLevel);

            $coordinator = $this->normalizePerson($data['coordinator'] ?? []);
            $counselor = $this->normalizePerson($data['counselor'] ?? []);
            $combined = $this->normalizePerson($data['combined'] ?? []);

            if ($assignType === 'coordinator' || $assignType === 'both') {
                $this->validatePerson($coordinator, 'Coordinator');
            }

            if ($assignType === 'counselor' || $assignType === 'both') {
                $this->validatePerson($counselor, 'Counselor');
            }

            if ($assignType === 'combined') {
                $this->validatePerson($combined, 'Combined coordinator/counselor');
            }

            if ($assignType === 'both' && strcasecmp($coordinator['email'], $counselor['email']) === 0) {
                throw new InvalidArgumentException('Coordinator and counselor must use different email addresses');
            }

            $conn->begin_transaction();
            $transactionStarted = true;

            $createdUsers = [];

            if ($assignType === 'coordinator' || $assignType === 'both') {
                $this->ensureEmailAvailable($conn, $coordinator['email']);
                $createdUsers[] = $this->createUser($conn, [
                    'password' => $coordinator['password'],
                    'firstName' => $coordinator['firstName'],
                    'lastName' => $coordinator['lastName'],
                    'email' => $coordinator['email'],
                    'type' => 'coordinator',
                    'school' => $schoolRecord['school_name'],
                    'grade' => $coordinator['grade']
                ]);
            }

            if ($assignType === 'counselor' || $assignType === 'both') {
                $this->ensureEmailAvailable($conn, $counselor['email']);
                $createdUsers[] = $this->createUser($conn, [
                    'password' => $counselor['password'],
                    'firstName' => $counselor['firstName'],
                    'lastName' => $counselor['lastName'],
                    'email' => $counselor['email'],
                    'type' => 'counselor',
                    'school' => $schoolRecord['school_name'],
                    'grade' => $counselor['grade']
                ]);
            }

            if ($assignType === 'combined') {
                $this->ensureEmailAvailable($conn, $combined['email']);
                $createdUsers[] = $this->createUser($conn, [
                    'password' => $combined['password'],
                    'firstName' => $combined['firstName'],
                    'lastName' => $combined['lastName'],
                    'email' => $combined['email'],
                    'type' => 'counselor-and-coordinator',
                    'school' => $schoolRecord['school_name'],
                    'grade' => $combined['grade']
                ]);
            }

            if ($replaceAccountId > 0) {
                $this->deactivateReplacedAccount($conn, $replaceAccountId, $assignType, $schoolRecord);
            }

            $conn->commit();
            $transactionStarted = false;

            json_out([
                'success' => true,
                'message' => 'School assignment saved successfully.',
                'createdUsers' => $createdUsers
            ]);
        } catch (InvalidArgumentException $e) {
            if ($transactionStarted) {
                $conn->rollback();
            }

            http_response_code(400);
            json_out(['success' => false, 'message' => $e->getMessage()]);
        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
            if ($transactionStarted) {
                $conn->rollback();
            }

            http_response_code(500);
            json_out(['success' => false, 'message' => 'Failed to process request: ' . $e->getMessage()]);
        }
    }

    private function normalizePerson(array $person): array {
        return [
            'firstName' => trim((string)($person['firstName'] ?? '')),
            'lastName' => trim((string)($person['lastName'] ?? '')),
            'email' => strtolower(trim((string)($person['email'] ?? ''))),
            'password' => (string)($person['password'] ?? ''),
            'grade' => $this->normalizeGradeScopeInput($person['grade'] ?? '')
        ];
    }

    // A grade scope is a comma-separated list of grade numbers 7-12 (e.g.
    // "7", "11,12"), or "" for no restriction. Anything else collapses to "".
    // Reuses the parser from grade-scope.php so this stays in sync with the
    // filtering logic applied elsewhere.
    private function normalizeGradeScopeInput($raw): string {
        return implode(',', grade_scope_to_list((string)$raw));
    }

    // Deactivates (not deletes) the account being swapped out by "Replace
    // Account" — every case/referral/counseling record tied to that AccountID
    // stays exactly as-is, since nothing else references it by name. Only
    // deactivates when the id actually matches the role+school being replaced,
    // so a stale or mismatched id can't silently deactivate the wrong account.
    // school_attended is stored inconsistently as either the school's code or
    // its name across older rows (see getAssignments()'s own OR-matched join),
    // so both are accepted here too.
    private function deactivateReplacedAccount(mysqli $conn, int $accountId, string $assignType, array $schoolRecord): void {
        $expectedType = $assignType === 'combined' ? 'counselor-and-coordinator' : $assignType;

        $check = $conn->prepare('SELECT AccountID FROM users_tables WHERE AccountID = ? AND Type = ? AND (school_attended = ? OR school_attended = ?)');
        if (!$check) {
            throw new RuntimeException('Failed to prepare replaced-account check statement');
        }
        $check->bind_param('isss', $accountId, $expectedType, $schoolRecord['school_name'], $schoolRecord['school_code']);
        $check->execute();
        $matches = (bool)$check->get_result()->fetch_assoc();
        $check->close();

        if (!$matches) {
            return;
        }

        $deactivate = $conn->prepare('UPDATE users_tables SET is_active = 0 WHERE AccountID = ?');
        if (!$deactivate) {
            throw new RuntimeException('Failed to prepare replaced-account deactivation statement');
        }
        $deactivate->bind_param('i', $accountId);
        if (!$deactivate->execute()) {
            $deactivate->close();
            throw new RuntimeException('Failed to deactivate the replaced account');
        }
        $deactivate->close();
    }

    private function validatePerson(array $person, string $label): void {
        if ($person['firstName'] === '' || $person['lastName'] === '') {
            throw new InvalidArgumentException($label . ' first name and last name are required');
        }

        if (!filter_var($person['email'], FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException($label . ' email is invalid');
        }

        if (strlen($person['password']) < 8) {
            throw new InvalidArgumentException($label . ' password must be at least 8 characters');
        }
    }

    private function ensureEmailAvailable(mysqli $conn, string $email): void {
        $check = $conn->prepare('SELECT AccountID FROM users_tables WHERE email = ? LIMIT 1');
        if (!$check) {
            throw new RuntimeException('Failed to prepare email check statement');
        }

        $check->bind_param('s', $email);
        $check->execute();
        $result = $check->get_result();
        $exists = $result->fetch_assoc();
        $check->close();

        if ($exists) {
            throw new InvalidArgumentException('Email already exists: ' . $email);
        }
    }

    private function createUser(mysqli $conn, array $input): array {
        $hashedPassword = password_hash($input['password'], PASSWORD_BCRYPT);
        $grade = (string)($input['grade'] ?? '');

        // Middle_name is intentionally omitted — this table doesn't have that
        // column on every deployment of this schema and it was never populated
        // here anyway (always inserted as NULL).
        $stmt = $conn->prepare('INSERT INTO users_tables (Password, Grade, First_name, Last_name, Type, email, school_attended) VALUES (?, NULLIF(?, ""), ?, ?, ?, ?, ?)');
        if (!$stmt) {
            throw new RuntimeException('Failed to prepare user insert statement');
        }

        $stmt->bind_param(
            'sssssss',
            $hashedPassword,
            $grade,
            $input['firstName'],
            $input['lastName'],
            $input['type'],
            $input['email'],
            $input['school']
        );

        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('Failed to create user account');
        }

        $accountId = $stmt->insert_id;
        $stmt->close();

        return [
            'accountId' => $accountId,
            'name' => $input['firstName'] . ' ' . $input['lastName'],
            'email' => $input['email'],
            'role' => $input['type'],
            'school' => $input['school'],
            'grade' => $grade
        ];
    }

    private function getAssignments(mysqli $conn): array {
        // Coordinator/combined are listed one row per school in this view — only
        // one account per role is surfaced for those, resolved to exactly one
        // AccountID via a correlated subquery (active preferred, then most
        // recently created) so every column for that role comes from the SAME
        // joined row. The previous approach (a plain GROUP BY with an
        // independent MAX(CASE...) per column) picked each column from whichever
        // row happened to have the highest value for THAT column alone — e.g.
        // AccountID from the new row but the name from the old one, whenever
        // "Old ..." alphabetically outranked "New ..." — so id/name/email could
        // end up mismatched.
        //
        // Counselor is different: a school can have SEVERAL counselors active at
        // once (e.g. one per grade band), so it's fetched as a separate list
        // query below and attached as an array, rather than picked down to one.
        $query = "SELECT
                s.school_code,
                s.school_name,
                s.assignment_type,
                s.school_level,
                s.district,
                (
                    -- Active accounts only — replacing an account leaves the
                    -- old one on file (is_active = 0) for history, and that
                    -- shouldn't keep inflating this school's account count
                    -- once a replacement is actually in the role.
                    SELECT COUNT(*) FROM users_tables u
                    WHERE (u.school_attended = s.school_code OR u.school_attended = s.school_name)
                      AND u.Type IN ('coordinator', 'counselor', 'counselor-and-coordinator')
                      AND u.is_active = 1
                ) AS totalAssigned,
                co.AccountID AS coordinator_id,
                CONCAT(co.First_name, ' ', co.Last_name) AS coordinator_name,
                co.email AS coordinator_email,
                co.Grade AS coordinator_grade,
                co.is_active AS coordinator_active,
                cb.AccountID AS combined_id,
                CONCAT(cb.First_name, ' ', cb.Last_name) AS combined_name,
                cb.email AS combined_email,
                cb.Grade AS combined_grade,
                cb.is_active AS combined_active
            FROM schools s
            LEFT JOIN users_tables co ON co.AccountID = (
                SELECT u.AccountID FROM users_tables u
                WHERE (u.school_attended = s.school_code OR u.school_attended = s.school_name) AND u.Type = 'coordinator'
                ORDER BY u.is_active DESC, u.AccountID DESC LIMIT 1
            )
            LEFT JOIN users_tables cb ON cb.AccountID = (
                SELECT u.AccountID FROM users_tables u
                WHERE (u.school_attended = s.school_code OR u.school_attended = s.school_name) AND u.Type = 'counselor-and-coordinator'
                ORDER BY u.is_active DESC, u.AccountID DESC LIMIT 1
            )
            WHERE s.is_active = 1
            ORDER BY s.school_name ASC";
        $result = $conn->query($query);

        if (!$result) {
            throw new RuntimeException('Failed to load assignments');
        }

        $assignments = [];
        $indexBySchoolCode = [];

        while ($row = $result->fetch_assoc()) {
            $assignments[] = [
                'schoolName' => $row['school_name'],
                'schoolCode' => $row['school_code'],
                'assignmentType' => $row['assignment_type'],
                'schoolLevel' => $row['school_level'] ?: 'Secondary',
                'district' => $row['district'],
                'coordinator' => $row['coordinator_name'] ? [
                    'accountId' => (int)$row['coordinator_id'],
                    'name' => $row['coordinator_name'],
                    'email' => $row['coordinator_email'],
                    'grade' => $row['coordinator_grade'],
                    'active' => $row['coordinator_active'] === null ? true : (bool)((int)$row['coordinator_active'])
                ] : null,
                'counselors' => [],
                'combined' => $row['combined_name'] ? [
                    'accountId' => (int)$row['combined_id'],
                    'name' => $row['combined_name'],
                    'email' => $row['combined_email'],
                    'grade' => $row['combined_grade'],
                    'active' => $row['combined_active'] === null ? true : (bool)((int)$row['combined_active'])
                ] : null,
                'totalAssigned' => (int)$row['totalAssigned']
            ];
            $indexBySchoolCode[$row['school_code']] = count($assignments) - 1;
        }

        // Every counselor account for a still-active school, active ones first —
        // school_attended is matched the same OR-on-code-or-name way as above
        // since older rows store either.
        $counselorQuery = "SELECT
                s.school_code,
                u.AccountID AS counselor_id,
                CONCAT(u.First_name, ' ', u.Last_name) AS counselor_name,
                u.email AS counselor_email,
                u.Grade AS counselor_grade,
                u.is_active AS counselor_active
            FROM users_tables u
            JOIN schools s ON (u.school_attended = s.school_code OR u.school_attended = s.school_name)
            WHERE u.Type = 'counselor' AND s.is_active = 1
            ORDER BY u.is_active DESC, u.AccountID ASC";
        $counselorResult = $conn->query($counselorQuery);

        if (!$counselorResult) {
            throw new RuntimeException('Failed to load counselor assignments');
        }

        while ($crow = $counselorResult->fetch_assoc()) {
            $idx = $indexBySchoolCode[$crow['school_code']] ?? null;
            if ($idx === null) {
                continue;
            }

            $assignments[$idx]['counselors'][] = [
                'accountId' => (int)$crow['counselor_id'],
                'name' => $crow['counselor_name'],
                'email' => $crow['counselor_email'],
                'grade' => $crow['counselor_grade'],
                'active' => $crow['counselor_active'] === null ? true : (bool)((int)$crow['counselor_active'])
            ];
        }

        return $assignments;
    }
}
