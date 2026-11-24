<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Support\StaffSchools;
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

        // Creates staff accounts, renames/closes schools and switches any
        // account on or off: SDO only.
        api_require_role(api_roles_sdo());

        try {
            ensure_users_table_grade_column($conn);
            ensure_users_table_active_column($conn);
            // One staff account can be assigned to several schools (see
            // App\Support\StaffSchools); the school lists below read from it.
            StaffSchools::ensureTable($conn);

            if ($_SERVER['REQUEST_METHOD'] === 'GET') {
                // Every guidance staff account and its schools — the "Existing
                // account" picker in School Management's assignment form.
                if (($_GET['action'] ?? '') === 'accounts') {
                    json_out([
                        'success' => true,
                        'accounts' => $this->getStaffAccounts($conn)
                    ]);
                }

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
                    // Grades are per school; without a school code this is the
                    // account's current school (older callers).
                    $schoolCode = trim((string)($data['schoolCode'] ?? ''));

                    if ($accountId <= 0) {
                        http_response_code(400);
                        json_out(['success' => false, 'message' => 'accountId is required']);
                    }

                    $assignments = StaffSchools::forAccount($conn, $accountId);
                    $target = null;
                    foreach ($assignments as $assignment) {
                        if ($schoolCode !== '' ? $assignment['schoolCode'] === $schoolCode : $assignment['isCurrent']) {
                            $target = $assignment;
                            break;
                        }
                    }
                    if ($target === null) {
                        http_response_code(404);
                        json_out(['success' => false, 'message' => 'That account is not assigned to this school.']);
                    }

                    $stmt = $conn->prepare('UPDATE staff_school_assignments SET grade = NULLIF(?, "") WHERE account_id = ? AND school_code = ?');
                    $stmt->bind_param('sis', $grade, $accountId, $target['schoolCode']);
                    $stmt->execute();
                    $stmt->close();

                    // The current school's grades are also the account's live scope.
                    if ($target['isCurrent']) {
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
                    }

                    json_out(['success' => true, 'message' => 'Grade assignment updated.']);
                }

                // Takes an account off one school while it keeps its others.
                // An account's only school can't be removed this way; that's
                // what Deactivate (or Replace Account) is for.
                if ($action === 'unassign') {
                    $accountId = (int)($data['accountId'] ?? 0);
                    $schoolCode = trim((string)($data['schoolCode'] ?? ''));
                    if ($accountId <= 0 || $schoolCode === '') {
                        http_response_code(400);
                        json_out(['success' => false, 'message' => 'accountId and schoolCode are required']);
                    }

                    $assignments = StaffSchools::forAccount($conn, $accountId);
                    $codes = array_column($assignments, 'schoolCode');
                    if (!in_array($schoolCode, $codes, true)) {
                        http_response_code(404);
                        json_out(['success' => false, 'message' => 'That account is not assigned to this school.']);
                    }
                    if (count($codes) < 2) {
                        http_response_code(400);
                        json_out(['success' => false, 'message' => 'This is the account\'s only school. Deactivate the account instead.']);
                    }

                    $conn->begin_transaction();
                    $transactionStarted = true;
                    StaffSchools::remove($conn, $accountId, $schoolCode);
                    $conn->commit();
                    $transactionStarted = false;

                    json_out(['success' => true, 'message' => 'Account removed from this school. It keeps its other schools.']);
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

            // Each role slot is either a brand-new account (mode "new") or an
            // existing staff account being added to this school too (mode
            // "existing", by accountId) — one person can then work at several
            // schools and switch between them from their own dashboard.
            $slots = [];
            if ($assignType === 'coordinator' || $assignType === 'both') {
                $slots[] = ['person' => $this->normalizePerson($data['coordinator'] ?? []), 'type' => 'coordinator', 'label' => 'Coordinator'];
            }
            if ($assignType === 'counselor' || $assignType === 'both') {
                $slots[] = ['person' => $this->normalizePerson($data['counselor'] ?? []), 'type' => 'counselor', 'label' => 'Counselor'];
            }
            if ($assignType === 'combined') {
                $slots[] = ['person' => $this->normalizePerson($data['combined'] ?? []), 'type' => 'counselor-and-coordinator', 'label' => 'Combined coordinator/counselor'];
            }

            foreach ($slots as $slot) {
                if ($slot['person']['mode'] === 'existing') {
                    if ($slot['person']['accountId'] <= 0) {
                        throw new InvalidArgumentException($slot['label'] . ': choose an existing account');
                    }
                } else {
                    $this->validatePerson($slot['person'], $slot['label']);
                }
            }

            if (count($slots) === 2) {
                [$a, $b] = [$slots[0]['person'], $slots[1]['person']];
                $sameExisting = $a['mode'] === 'existing' && $b['mode'] === 'existing' && $a['accountId'] === $b['accountId'];
                $sameNewEmail = $a['mode'] === 'new' && $b['mode'] === 'new' && strcasecmp($a['email'], $b['email']) === 0;
                if ($sameExisting || $sameNewEmail) {
                    throw new InvalidArgumentException('Coordinator and counselor must be different accounts. For one person doing both, choose the combined role.');
                }
            }

            $conn->begin_transaction();
            $transactionStarted = true;

            $createdUsers = [];
            foreach ($slots as $slot) {
                $person = $slot['person'];
                if ($person['mode'] === 'existing') {
                    $createdUsers[] = $this->addExistingAccountToSchool($conn, $person['accountId'], $slot['type'], $schoolRecord, $person['grade']);
                    continue;
                }

                $this->ensureEmailAvailable($conn, $person['email']);
                $created = $this->createUser($conn, [
                    'password' => $person['password'],
                    'firstName' => $person['firstName'],
                    'lastName' => $person['lastName'],
                    'email' => $person['email'],
                    'type' => $slot['type'],
                    'school' => $schoolRecord['school_name'],
                    'grade' => $person['grade']
                ]);
                StaffSchools::add($conn, (int)$created['accountId'], $schoolRecord['school_code'], $slot['type'], $person['grade']);
                $created['addedToExisting'] = false;
                $createdUsers[] = $created;
            }

            if ($replaceAccountId > 0) {
                $this->retireReplacedAccount($conn, $replaceAccountId, $assignType, $schoolRecord);
            }

            $conn->commit();
            $transactionStarted = false;

            $linked = array_filter($createdUsers, fn ($u) => !empty($u['addedToExisting']));
            json_out([
                'success' => true,
                'message' => $linked
                    ? 'School assignment saved. ' . implode(' and ', array_map(fn ($u) => $u['name'], $linked)) . ' can now switch to ' . $schoolRecord['school_name'] . ' from their dashboard.'
                    : 'School assignment saved successfully.',
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
            'mode' => ($person['mode'] ?? 'new') === 'existing' ? 'existing' : 'new',
            'accountId' => (int)($person['accountId'] ?? 0),
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

    // The account being swapped out by "Replace Account" leaves THIS school
    // only. If it still works at other schools it simply keeps those; if this
    // was its only school it's deactivated (not deleted), so every
    // case/referral/counseling record tied to that AccountID stays as-is.
    // Only acts when the id really holds that role at this school, so a stale
    // or mismatched id can't touch the wrong account.
    private function retireReplacedAccount(mysqli $conn, int $accountId, string $assignType, array $schoolRecord): void {
        $expectedType = $assignType === 'combined' ? 'counselor-and-coordinator' : $assignType;

        $assignments = StaffSchools::forAccount($conn, $accountId);
        $here = null;
        foreach ($assignments as $assignment) {
            if ($assignment['schoolCode'] === $schoolRecord['school_code'] && $assignment['role'] === $expectedType) {
                $here = $assignment;
            }
        }
        if ($here === null) {
            return;
        }

        if (count($assignments) > 1) {
            StaffSchools::remove($conn, $accountId, $schoolRecord['school_code']);
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
            throw new InvalidArgumentException('An account with ' . $email . ' already exists. To give that person this school too, choose "Existing account" and pick them.');
        }
    }

    // Adds an existing coordinator/counselor/combined account to one more
    // school, with the role and grade scope given for this school. Its
    // current school doesn't change; the person switches from their own
    // dashboard.
    private function addExistingAccountToSchool(mysqli $conn, int $accountId, string $type, array $schoolRecord, string $grade): array {
        $stmt = $conn->prepare('SELECT AccountID, First_name, Last_name, email, Type, is_active FROM users_tables WHERE AccountID = ?');
        $stmt->bind_param('i', $accountId);
        $stmt->execute();
        $account = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $name = $account ? trim($account['First_name'] . ' ' . $account['Last_name']) : '';
        if (!$account || !in_array($account['Type'], StaffSchools::ROLES, true)) {
            throw new InvalidArgumentException('Only coordinator, counselor, or combined accounts can be added to another school.');
        }
        if ((int)($account['is_active'] ?? 1) === 0) {
            throw new InvalidArgumentException($name . '\'s account is deactivated. Activate it before adding a school.');
        }
        if (!StaffSchools::add($conn, $accountId, $schoolRecord['school_code'], $type, $grade)) {
            throw new InvalidArgumentException($name . ' is already assigned to ' . $schoolRecord['school_name'] . '.');
        }

        return [
            'accountId' => $accountId,
            'name' => $name,
            'email' => $account['email'],
            'role' => $type,
            'school' => $schoolRecord['school_name'],
            'grade' => $grade,
            'addedToExisting' => true
        ];
    }

    // Every guidance staff account with the schools it's assigned to, for the
    // "Existing account" picker.
    private function getStaffAccounts(mysqli $conn): array {
        $result = $conn->query("
            SELECT u.AccountID, u.First_name, u.Last_name, u.email, u.Type, u.is_active,
                   s.school_code, s.school_name, a.role
            FROM users_tables u
            LEFT JOIN staff_school_assignments a ON a.account_id = u.AccountID
            LEFT JOIN schools s ON s.school_code = a.school_code AND s.is_active = 1
            WHERE u.Type IN ('coordinator', 'counselor', 'counselor-and-coordinator')
            ORDER BY u.First_name ASC, u.Last_name ASC
        ");
        if (!$result) {
            throw new RuntimeException('Failed to load staff accounts');
        }

        $accounts = [];
        while ($row = $result->fetch_assoc()) {
            $id = (int)$row['AccountID'];
            if (!isset($accounts[$id])) {
                $accounts[$id] = [
                    'accountId' => $id,
                    'name' => trim($row['First_name'] . ' ' . $row['Last_name']),
                    'email' => $row['email'],
                    'active' => (int)($row['is_active'] ?? 1) === 1,
                    'schools' => []
                ];
            }
            if (!empty($row['school_name'])) {
                $accounts[$id]['schools'][] = [
                    'schoolCode' => $row['school_code'],
                    'schoolName' => $row['school_name'],
                    'role' => $row['role'],
                    'roleLabel' => StaffSchools::roleLabel((string)$row['role'])
                ];
            }
        }
        return array_values($accounts);
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

    // One entry per active school with its staff. Staff come from
    // staff_school_assignments, so an account assigned to several schools
    // appears under each of them (with its role and grade scope there), not
    // only under the school it's currently working in. Coordinator and
    // combined are one account per school (an active one preferred, then the
    // newest); a school can have several counselors.
    private function getAssignments(mysqli $conn): array {
        $result = $conn->query("SELECT school_code, school_name, assignment_type, school_level, district FROM schools WHERE is_active = 1 ORDER BY school_name ASC");
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
                'coordinator' => null,
                'counselors' => [],
                'combined' => null,
                'totalAssigned' => 0
            ];
            $indexBySchoolCode[$row['school_code']] = count($assignments) - 1;
        }

        $staffResult = $conn->query("
            SELECT a.account_id, a.school_code, a.role, a.grade,
                   u.First_name, u.Last_name, u.email, u.is_active, u.school_attended,
                   s.school_name
            FROM staff_school_assignments a
            JOIN users_tables u ON u.AccountID = a.account_id
            JOIN schools s ON s.school_code = a.school_code AND s.is_active = 1
            ORDER BY u.is_active DESC, a.account_id DESC
        ");
        if (!$staffResult) {
            throw new RuntimeException('Failed to load staff assignments');
        }
        $rows = $staffResult->fetch_all(MYSQLI_ASSOC);

        // Every school each account works at, for "Also at ..." in the list.
        $schoolsByAccount = [];
        foreach ($rows as $row) {
            $current = (string)($row['school_attended'] ?? '');
            $schoolsByAccount[(int)$row['account_id']][] = [
                'schoolCode' => $row['school_code'],
                'schoolName' => $row['school_name'],
                'roleLabel' => StaffSchools::roleLabel($row['role']),
                'workingHere' => strcasecmp($current, $row['school_name']) === 0 || strcasecmp($current, $row['school_code']) === 0
            ];
        }

        foreach ($rows as $row) {
            $idx = $indexBySchoolCode[$row['school_code']] ?? null;
            if ($idx === null) {
                continue;
            }
            $accountId = (int)$row['account_id'];
            $current = (string)($row['school_attended'] ?? '');
            $person = [
                'accountId' => $accountId,
                'name' => trim($row['First_name'] . ' ' . $row['Last_name']),
                'email' => $row['email'],
                'grade' => $row['grade'],
                'active' => $row['is_active'] === null ? true : (bool)((int)$row['is_active']),
                // Whether this is the school the person is working in right now.
                'workingHere' => strcasecmp($current, $row['school_name']) === 0 || strcasecmp($current, $row['school_code']) === 0,
                'otherSchools' => array_values(array_filter(
                    $schoolsByAccount[$accountId] ?? [],
                    fn ($s) => $s['schoolCode'] !== $row['school_code']
                ))
            ];

            if ($person['active']) {
                $assignments[$idx]['totalAssigned']++;
            }

            if ($row['role'] === 'counselor') {
                $assignments[$idx]['counselors'][] = $person;
            } elseif ($row['role'] === 'coordinator') {
                $assignments[$idx]['coordinator'] = $assignments[$idx]['coordinator'] ?? $person;
            } elseif ($row['role'] === 'counselor-and-coordinator') {
                $assignments[$idx]['combined'] = $assignments[$idx]['combined'] ?? $person;
            }
        }

        // Counselors: active first, then oldest account first.
        foreach ($assignments as &$school) {
            usort($school['counselors'], fn ($a, $b) => ($b['active'] <=> $a['active']) ?: ($a['accountId'] <=> $b['accountId']));
        }
        unset($school);

        return $assignments;
    }
}
