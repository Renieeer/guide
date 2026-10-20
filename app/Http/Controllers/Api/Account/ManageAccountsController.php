<?php

namespace App\Http\Controllers\Api\Account;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Throwable;

class ManageAccountsController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        ensure_users_table_active_column($conn);

        try {
            $method = $_SERVER['REQUEST_METHOD'];

            if ($method === 'GET') {
                // Fetch all accounts from the same school
                $school = trim((string)($_GET['school'] ?? ''));
                $search = trim((string)($_GET['search'] ?? ''));
                $includeInactive = !empty($_GET['include_inactive']);

                if ($school === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'School is required']);
                }

                $sql = "SELECT
                    u.AccountID AS id,
                    u.First_name,
                    u.Last_name,
                    u.email,
                    u.Type,
                    u.school_attended,
                    COALESCE(NULLIF(u.Grade, ''), st.Grade) AS Grade,
                    u.created_at,
                    u.is_active,
                    st.Age AS Age
                FROM users_tables u
                LEFT JOIN student_table st ON st.AccountID = u.AccountID
                WHERE u.school_attended = ?";

                $types = 's';
                $params = [$school];

                if ($search !== '') {
                    $sql .= " AND (u.First_name LIKE ? OR u.Last_name LIKE ? OR u.email LIKE ?)";
                    $searchTerm = '%' . $search . '%';
                    $types .= 'sss';
                    $params[] = $searchTerm;
                    $params[] = $searchTerm;
                    $params[] = $searchTerm;
                }

                // Deactivated students (e.g. transferred/graduated) are hidden from
                // the default view — only "Show inactive students" surfaces them.
                // Staff account status is managed by the SDO, not scoped here.
                if (!$includeInactive) {
                    $sql .= " AND (u.Type != 'student' OR u.is_active = 1)";
                }

                $sql .= " ORDER BY u.created_at DESC";

                $stmt = $conn->prepare($sql);
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }

                $stmt->bind_param($types, ...$params);

                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
                }

                $result = $stmt->get_result();
                $rows = [];
                while ($row = $result->fetch_assoc()) {
                    $rows[] = $row;
                }
                $stmt->close();

                $this->send_json(200, ['success' => true, 'data' => $rows]);
            }

            if ($method === 'PUT') {
                // Update account information
                $raw = file_get_contents('php://input');
                $payload = json_decode($raw, true);

                if (!is_array($payload)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
                }

                if (($payload['action'] ?? '') === 'setActive') {
                    // Coordinator-only toggle, and only for student accounts (a
                    // student who has left the school) — staff account status stays
                    // an SDO-only action (see account-status.php).
                    $id = (int)($payload['id'] ?? 0);
                    $school = trim((string)($payload['school'] ?? ''));
                    $active = !empty($payload['active']) ? 1 : 0;

                    if ($id === 0 || $school === '') {
                        $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
                    }

                    $stmt = $conn->prepare(
                        "UPDATE users_tables SET is_active = ? WHERE AccountID = ? AND school_attended = ? AND Type = 'student'"
                    );
                    if (!$stmt) {
                        $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                    }
                    $stmt->bind_param('iis', $active, $id, $school);

                    if (!$stmt->execute()) {
                        $this->send_json(500, ['success' => false, 'message' => 'Update failed: ' . $stmt->error]);
                    }
                    if ($stmt->affected_rows === 0) {
                        $this->send_json(404, ['success' => false, 'message' => 'Student account not found or access denied']);
                    }
                    $stmt->close();

                    $this->send_json(200, [
                        'success' => true,
                        'message' => $active ? 'Account activated' : 'Account deactivated'
                    ]);
                }

                $id = (int)($payload['id'] ?? 0);
                $first_name = trim((string)($payload['first_name'] ?? ''));
                $last_name = trim((string)($payload['last_name'] ?? ''));
                $new_password = trim((string)($payload['password'] ?? ''));
                $school = trim((string)($payload['school'] ?? ''));

                if ($id === 0 || $first_name === '' || $last_name === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Missing required fields']);
                }

                // Checked up front, separately from the UPDATE's own affected_rows
                // — mysqli reports 0 affected rows both when no row matches the
                // WHERE clause AND when a row matches but every SET value is
                // already identical (a plain "Save Changes" with no actual edits).
                // Relying on affected_rows alone to mean "not found" turned a
                // harmless no-op save into a false "Account not found" error.
                $existsStmt = $conn->prepare('SELECT 1 FROM users_tables WHERE AccountID = ? AND school_attended = ?');
                $existsStmt->bind_param('is', $id, $school);
                $existsStmt->execute();
                $accountExists = $existsStmt->get_result()->num_rows > 0;
                $existsStmt->close();

                if (!$accountExists) {
                    $this->send_json(404, ['success' => false, 'message' => 'Account not found or access denied']);
                }

                if ($new_password !== '') {
                    // Update with password
                    if (strlen($new_password) < 6) {
                        $this->send_json(400, ['success' => false, 'message' => 'Password must be at least 6 characters']);
                    }

                    $hashedPassword = password_hash($new_password, PASSWORD_BCRYPT);
                    $sql = "UPDATE users_tables SET First_name = ?, Last_name = ?, Password = ? WHERE AccountID = ? AND school_attended = ?";
                    $stmt = $conn->prepare($sql);
                    if (!$stmt) {
                        $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                    }
                    // 'i' before the final 's' — $id is the integer AccountID, $school
                    // is the string school name; these two were swapped (both here
                    // and in the no-password branch below), which made mysqli bind
                    // the school name as an integer and MySQL reject it with
                    // "Truncated incorrect DOUBLE value" the moment the school name
                    // wasn't purely numeric.
                    $stmt->bind_param('sssis', $first_name, $last_name, $hashedPassword, $id, $school);
                } else {
                    // Update without password
                    $sql = "UPDATE users_tables SET First_name = ?, Last_name = ? WHERE AccountID = ? AND school_attended = ?";
                    $stmt = $conn->prepare($sql);
                    if (!$stmt) {
                        $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                    }
                    $stmt->bind_param('ssis', $first_name, $last_name, $id, $school);
                }

                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Update failed: ' . $stmt->error]);
                }

                $stmt->close();

                $this->send_json(200, ['success' => true, 'message' => 'Account updated successfully']);
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
}
