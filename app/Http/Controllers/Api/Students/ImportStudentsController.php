<?php

namespace App\Http\Controllers\Api\Students;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use RuntimeException;
use Throwable;

// Bulk student-account import for the coordinator/combined "Manage Accounts"
// page's Import Accounts modal (pages/{coordinator,other-school}/account.js).
// Two-step flow, both hitting this same endpoint so validation logic can
// never drift between the preview and the actual import:
//   action=validate — dry run, returns per-row status only, writes nothing.
//   action=commit    — re-runs the exact same validation against the CURRENT
//                       database (never trusts whatever the client marked
//                       "valid" during the earlier preview) and inserts only
//                       the rows that still pass, one account per row.
// Mirrors api/sdo-school-staff.php's createUser() — a staff member creating
// a login on someone else's behalf: password is hashed and stored directly,
// no OTP/email-verification step (email_verified stays at its default 1),
// same as how SDO creates coordinator/counselor accounts today.
class ImportStudentsController extends Controller
{
    // The exact column headers the downloadable template uses — the client
    // sends rows keyed by these same strings (SheetJS's sheet_to_json() keys
    // each row object by its header cell), so no separate mapping step exists
    // to drift out of sync with the template.
    private const IMPORT_COLUMNS = ['LRN', 'First Name', 'Last Name', 'Middle Name', 'Sex', 'Date of Birth', 'Age', 'Grade', 'Section', 'Email', 'Password'];

    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $method = $_SERVER['REQUEST_METHOD'];
            if ($method !== 'POST') {
                $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
            }

            $raw = file_get_contents('php://input');
            $payload = json_decode($raw, true);
            if (!is_array($payload)) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
            }

            $action = trim((string)($payload['action'] ?? ''));
            $school = trim((string)($payload['school'] ?? ''));
            $rows = is_array($payload['rows'] ?? null) ? $payload['rows'] : [];

            if ($school === '') {
                $this->send_json(400, ['success' => false, 'message' => 'school is required']);
            }
            if (empty($rows)) {
                $this->send_json(400, ['success' => false, 'message' => 'No rows to import']);
            }
            if (count($rows) > 1000) {
                $this->send_json(400, ['success' => false, 'message' => 'Please import 1000 students or fewer at a time']);
            }

            $schoolConfig = getSchoolConfig($school);
            $isElementary = $schoolConfig ? in_array($schoolConfig['schoolLevel'], ['East', 'West', 'South'], true) : false;

            if ($action === 'validate') {
                $results = $this->validate_batch($conn, $rows, $isElementary);
                $this->send_json(200, ['success' => true, 'results' => $results, 'summary' => $this->import_summary($results)]);
            }

            if ($action === 'commit') {
                // Re-validated from scratch against the CURRENT database — a row
                // marked valid during preview may have since become a duplicate
                // (someone else imported the same LRN moments ago), so the
                // client's earlier "valid" tag is never trusted here.
                $results = $this->validate_batch($conn, $rows, $isElementary);

                foreach ($results as &$r) {
                    if ($r['status'] !== 'valid') {
                        continue;
                    }
                    try {
                        $accountId = $this->insert_imported_student($conn, $school, $r['data']);
                        $r['status'] = 'created';
                        $r['accountId'] = $accountId;
                    } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
                        $r['status'] = 'failed';
                        $r['errors'][] = $e->getMessage();
                    }
                }
                unset($r);

                $summary = $this->import_summary($results);
                $this->send_json(200, ['success' => true, 'results' => $results, 'summary' => $summary]);
            }

            $this->send_json(400, ['success' => false, 'message' => 'Unknown action']);
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

    private function import_row_value(array $row, string $key): string {
        return trim((string)($row[$key] ?? ''));
    }

    /** Accepts a Date of Birth typed as either the template's requested
     *  YYYY-MM-DD, or M/D/YYYY (or MM/DD/YYYY, or MM/DD/YY) — the formats Excel
     *  silently reformats a typed date into once it detects the cell as a date
     *  (its own regional "short date" format is often 2-digit-year, e.g. Excel
     *  turning a typed "2005-09-27" into a displayed "09/27/05"), matching the
     *  MM/DD/YYYY convention this app's own HTML date inputs already display
     *  (see pages/student/student-information.php). A 2-digit year is always
     *  read as 20YY — every student account here is for a currently-enrolled
     *  K-12 learner, so a 19YY birth year is never actually possible. Always
     *  normalizes to YYYY-MM-DD for storage, so student_table.DateOfBirth stays
     *  in one consistent format regardless of which way it was typed. Returns
     *  null for anything else (including an unrecognized separator or an
     *  impossible calendar date), so unrecognized input is rejected rather than
     *  guessed at. */
    private function normalize_dob(string $raw): ?string {
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $raw, $m)) {
            [$y, $mo, $d] = [(int)$m[1], (int)$m[2], (int)$m[3]];
        } elseif (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/', $raw, $m)) {
            [$mo, $d] = [(int)$m[1], (int)$m[2]];
            $y = strlen($m[3]) === 2 ? 2000 + (int)$m[3] : (int)$m[3];
        } else {
            return null;
        }

        if (!checkdate($mo, $d, $y)) {
            return null;
        }

        return sprintf('%04d-%02d-%02d', $y, $mo, $d);
    }

    /** Validates + normalizes one spreadsheet row in isolation (format checks
     *  only — LRN/email uniqueness is layered on afterward across the whole
     *  batch + the database, since that can't be decided per-row alone). */
    private function validate_row_shape(array $row, bool $isElementary): array {
        $errors = [];

        $lrn = $this->import_row_value($row, 'LRN');
        if ($lrn === '') {
            $errors[] = 'LRN is required';
        } elseif (!ctype_digit($lrn) || strlen($lrn) !== 12) {
            $errors[] = 'LRN must be exactly 12 digits';
        }

        $firstName = $this->import_row_value($row, 'First Name');
        if ($firstName === '') {
            $errors[] = 'First Name is required';
        }

        $lastName = $this->import_row_value($row, 'Last Name');
        if ($lastName === '') {
            $errors[] = 'Last Name is required';
        }

        $middleName = $this->import_row_value($row, 'Middle Name');

        $sexRaw = strtolower($this->import_row_value($row, 'Sex'));
        $sexMap = ['male' => 'Male', 'm' => 'Male', 'female' => 'Female', 'f' => 'Female'];
        $sex = $sexMap[$sexRaw] ?? null;
        if ($sex === null) {
            $errors[] = 'Sex must be Male or Female';
        }

        $dobRaw = $this->import_row_value($row, 'Date of Birth');
        $dob = null;
        if ($dobRaw === '') {
            $errors[] = 'Date of Birth is required';
        } else {
            $dob = $this->normalize_dob($dobRaw);
            if ($dob === null) {
                $errors[] = 'Date of Birth must be in YYYY-MM-DD format (e.g. 2012-03-20) or MM/DD/YYYY (e.g. 03/20/2012)';
            }
        }

        $ageRaw = $this->import_row_value($row, 'Age');
        $age = null;
        if ($ageRaw === '') {
            $errors[] = 'Age is required';
        } elseif (!ctype_digit($ageRaw) || (int)$ageRaw < 3 || (int)$ageRaw > 25) {
            $errors[] = 'Age must be a number between 3 and 25';
        } else {
            $age = (int)$ageRaw;
        }

        $gradeRaw = $this->import_row_value($row, 'Grade');
        $grade = null;
        $minGrade = $isElementary ? 1 : 7;
        $maxGrade = $isElementary ? 6 : 12;
        if ($gradeRaw === '') {
            $errors[] = 'Grade is required';
        } elseif (!ctype_digit($gradeRaw) || (int)$gradeRaw < $minGrade || (int)$gradeRaw > $maxGrade) {
            $errors[] = "Grade must be between {$minGrade} and {$maxGrade} for this school";
        } else {
            $grade = (int)$gradeRaw;
        }

        $section = $this->import_row_value($row, 'Section');

        $email = $this->import_row_value($row, 'Email');
        if ($email === '') {
            $errors[] = 'Email is required';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Email is invalid';
        }

        // Optional — defaults to the student's own LRN so a blank column still
        // produces a usable, communicable login, the same way many DepEd
        // school systems hand out a default password. Coordinators can always
        // reset it afterward from Manage Accounts, same as any other account.
        $passwordRaw = $this->import_row_value($row, 'Password');
        $password = $passwordRaw !== '' ? $passwordRaw : $lrn;
        if ($password !== '' && strlen($password) < 6) {
            $errors[] = 'Password must be at least 6 characters';
        }

        return [
            'errors' => $errors,
            'data' => [
                'lrn' => $lrn,
                'firstName' => $firstName,
                'lastName' => $lastName,
                'middleName' => $middleName,
                'sex' => $sex,
                'dateOfBirth' => $dob,
                'age' => $age,
                'grade' => $grade,
                'section' => $section,
                'email' => $email,
                'password' => $password,
            ],
        ];
    }

    /** Runs validate_row_shape() over the whole batch, then layers in-file and
     *  against-the-database duplicate detection on top. Shared by both
     *  action=validate and action=commit so they can never disagree. */
    private function validate_batch(mysqli $conn, array $rows, bool $isElementary): array {
        $shaped = array_map(fn($row) => $this->validate_row_shape(is_array($row) ? $row : [], $isElementary), $rows);

        // In-file duplicates — every row sharing an LRN or email with another
        // row in THIS upload is flagged (not just the second occurrence), since
        // there's no reliable way to guess which of the colliding rows is the
        // intended one; the spreadsheet needs fixing either way.
        $lrnCounts = [];
        $emailCounts = [];
        foreach ($shaped as $s) {
            $lrn = $s['data']['lrn'];
            $email = strtolower($s['data']['email']);
            if ($lrn !== '') $lrnCounts[$lrn] = ($lrnCounts[$lrn] ?? 0) + 1;
            if ($email !== '') $emailCounts[$email] = ($emailCounts[$email] ?? 0) + 1;
        }

        // Already-in-the-database check — one query for the whole batch rather
        // than one per row. LRN is checked school-wide across the whole system
        // (it's a national learner ID, not a per-school value) so a transferred
        // student who already has an account elsewhere isn't silently duplicated.
        $lrns = array_values(array_unique(array_filter(array_map(fn($s) => $s['data']['lrn'], $shaped), fn($v) => $v !== '')));
        $emails = array_values(array_unique(array_filter(array_map(fn($s) => strtolower($s['data']['email']), $shaped), fn($v) => $v !== '')));

        $existingLrns = [];
        if (!empty($lrns)) {
            $placeholders = implode(',', array_fill(0, count($lrns), '?'));
            $stmt = $conn->prepare("SELECT LRN FROM student_table WHERE LRN IN ($placeholders)");
            if ($stmt) {
                $stmt->bind_param(str_repeat('s', count($lrns)), ...$lrns);
                $stmt->execute();
                $res = $stmt->get_result();
                while ($row = $res->fetch_assoc()) {
                    $existingLrns[$row['LRN']] = true;
                }
                $stmt->close();
            }
        }

        $existingEmails = [];
        if (!empty($emails)) {
            $placeholders = implode(',', array_fill(0, count($emails), '?'));
            $stmt = $conn->prepare("SELECT LOWER(email) AS email FROM users_tables WHERE LOWER(email) IN ($placeholders)");
            if ($stmt) {
                $stmt->bind_param(str_repeat('s', count($emails)), ...$emails);
                $stmt->execute();
                $res = $stmt->get_result();
                while ($row = $res->fetch_assoc()) {
                    $existingEmails[$row['email']] = true;
                }
                $stmt->close();
            }
        }

        $results = [];
        foreach ($shaped as $index => $s) {
            $errors = $s['errors'];
            $data = $s['data'];
            $status = 'valid';

            if (!empty($errors)) {
                $status = 'invalid';
            } elseif (($lrnCounts[$data['lrn']] ?? 0) > 1 || ($emailCounts[strtolower($data['email'])] ?? 0) > 1) {
                $status = 'duplicate_in_file';
                $errors[] = 'This LRN or email appears more than once in the uploaded file';
            } elseif (isset($existingLrns[$data['lrn']])) {
                $status = 'already_exists';
                $errors[] = 'A student account with this LRN already exists';
            } elseif (isset($existingEmails[strtolower($data['email'])])) {
                $status = 'already_exists';
                $errors[] = 'A student account with this email already exists';
            }

            $results[] = [
                'row' => $index + 2, // +1 for 0-index, +1 for the template's header row
                'status' => $status,
                'errors' => $errors,
                'data' => $data,
            ];
        }

        return $results;
    }

    private function import_summary(array $results): array {
        $summary = ['valid' => 0, 'invalid' => 0, 'duplicate_in_file' => 0, 'already_exists' => 0, 'created' => 0, 'failed' => 0];
        foreach ($results as $r) {
            if (isset($summary[$r['status']])) $summary[$r['status']]++;
        }
        return $summary;
    }

    /** Same insert shape as api/sdo-school-staff.php's createUser() /
     *  api/email-verification.php's create_student_stub(), just filled in with
     *  the full profile in one shot instead of a bare stub. */
    private function insert_imported_student(mysqli $conn, string $school, array $data): int {
        $conn->begin_transaction();
        try {
            $hashedPassword = password_hash($data['password'], PASSWORD_BCRYPT);
            $stmt = $conn->prepare('INSERT INTO users_tables (Password, First_name, Last_name, Type, email, school_attended, is_active, email_verified) VALUES (?, ?, ?, ?, ?, ?, 1, 1)');
            if (!$stmt) {
                throw new RuntimeException('Failed to prepare user insert');
            }
            $type = 'student';
            $stmt->bind_param('ssssss', $hashedPassword, $data['firstName'], $data['lastName'], $type, $data['email'], $school);
            if (!$stmt->execute()) {
                throw new RuntimeException('Failed to create the account: ' . $stmt->error);
            }
            $accountId = (int)$conn->insert_id;
            $stmt->close();

            // StudentId == AccountID (as a string) — same convention
            // create_student_stub() establishes for self-registered students.
            $studentId = (string)$accountId;
            $stmt = $conn->prepare('INSERT INTO student_table (StudentId, LRN, FirstName, LastName, MiddleName, Sex, Age, DateOfBirth, Grade, Section, AccountID, EmailAccount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            if (!$stmt) {
                throw new RuntimeException('Failed to prepare student insert');
            }
            $ageStr = (string)$data['age'];
            $gradeStr = (string)$data['grade'];
            $stmt->bind_param(
                'ssssssssssis',
                $studentId,
                $data['lrn'],
                $data['firstName'],
                $data['lastName'],
                $data['middleName'],
                $data['sex'],
                $ageStr,
                $data['dateOfBirth'],
                $gradeStr,
                $data['section'],
                $accountId,
                $data['email']
            );
            if (!$stmt->execute()) {
                throw new RuntimeException('Failed to create the student record: ' . $stmt->error);
            }
            $stmt->close();

            $conn->commit();
            return $accountId;
        } catch (HttpResponseException $halt) {
        throw $halt;
    } catch (Throwable $e) {
            $conn->rollback();
            throw $e;
        }
    }
}
