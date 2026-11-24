<?php

namespace App\Http\Controllers\Api\Appointments;

use App\Http\Controllers\Controller;
use App\Support\ScheduleAvailability;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use Throwable;

class ScheduleEventsController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensure_schedule_table($conn);

            $method = $_SERVER['REQUEST_METHOD'];

            if ($method === 'GET') {
                $this->api_log('GET request: ' . json_encode($_GET));
                // The school calendar: staff and students of the school (school is
                // pinned to the account by the legacy.session middleware).
                api_require_role(array_merge(api_roles_guidance(), ['student'], api_roles_sdo()));
                $school = trim((string)($_GET['school'] ?? ''));
                $month = trim((string)($_GET['month'] ?? ''));

                $sql = "
            SELECT
                event_id AS id,
                title,
                event_type AS type,
                start_date AS date,
                end_date AS endDate,
                event_time AS time,
                end_time AS endTime,
                all_day AS allDay,
                description,
                location,
                created_at AS createdAt,
                created_by AS createdBy,
                created_role AS createdRole
            FROM schedule_events
            WHERE 1=1
        ";
                $types = '';
                $params = [];

                if ($school !== '') {
                    $sql .= ' AND school_attended = ?';
                    $types .= 's';
                    $params[] = $school;
                }

                if ($month !== '') {
                    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
                        $this->send_json(400, ['success' => false, 'message' => 'Invalid month format. Use YYYY-MM']);
                    }

                    $monthStart = $month . '-01';
                    $monthEnd = date('Y-m-t', strtotime($monthStart));
                    $sql .= " AND start_date <= ? AND COALESCE(end_date, start_date) >= ?";
                    $types .= 'ss';
                    $params[] = $monthEnd;
                    $params[] = $monthStart;
                }

                $sql .= ' ORDER BY start_date ASC, event_time ASC, title ASC';

                $stmt = $conn->prepare($sql);
                if (!$stmt) {
                    $this->api_log('GET prepare failed: ' . $conn->error . ' SQL: ' . $sql);
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }

                if ($types !== '') {
                    $stmt->bind_param($types, ...$params);
                }
                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
                }

                $result = $stmt->get_result();
                $rows = [];
                while ($row = $result->fetch_assoc()) {
                    $row['allDay'] = (bool)$row['allDay'];
                    $rows[] = $row;
                }
                $stmt->close();

                $this->api_log('GET returned ' . count($rows) . ' rows for school=' . $school . ' month=' . $month);

                // Times already taken by a counseling session that month, for
                // every page that adds events or books sessions to grey them
                // out. Only date and time: who booked it isn't shown, so a
                // coordinator can plan events without seeing students' sessions.
                $booked = [];
                if ($month !== '' && $school !== '') {
                    foreach (ScheduleAvailability::activeBookings($conn, $school, $monthStart, $monthEnd) as $booking) {
                        $booked[] = ['date' => $booking['preferred_date'], 'time' => $booking['preferred_time']];
                    }
                }

                $this->send_json(200, ['success' => true, 'data' => $rows, 'booked' => $booked]);
            }

            if ($method === 'POST') {
                $raw = file_get_contents('php://input');
                $this->api_log('POST raw: ' . substr($raw, 0, 4000));
                $payload = json_decode($raw, true);
                $this->api_log('POST decoded: ' . json_encode(is_array($payload) ? $payload : ['invalid_json' => true]));
                if (!is_array($payload)) {
                    $this->api_log('POST invalid JSON payload');
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
                }

                $title = trim((string)($payload['title'] ?? ''));
                // Creator, role and school come from the logged-in account; they
                // used to be request fields, and leaving the role out entirely
                // was let through "for backward compatibility".
                api_require_role(api_roles_guidance());
                $school = api_school();
                $role = api_role();
                $createdBy = (string) api_user_id();

                if ($title === '' || $school === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Title and school are required']);
                }

                if (!$this->is_allowed_editor_role($role)) {
                    // If role is missing but createdBy is present, allow for backward compatibility
                    if (trim($createdBy) === '') {
                        $this->api_log('POST rejected role: ' . $role . ' createdBy:' . $createdBy);
                        $this->send_json(403, ['success' => false, 'message' => 'Only counselor or coordinator can create calendar events']);
                    } else {
                        $this->api_log('POST: role not provided but createdBy present; allowing creation for createdBy=' . $createdBy);
                    }
                }

                $startDate = $this->normalize_date_input($payload['date'] ?? null);
                $endDate = $this->normalize_date_input($payload['endDate'] ?? null);

                if ($startDate === null) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid start date']);
                }

                if ($endDate !== null && $endDate < $startDate) {
                    $this->send_json(400, ['success' => false, 'message' => 'End date must be on or after start date']);
                }

                // Reject scheduling a new event in the past - enforced server-side
                // too, not just in the UI, since the client-side check can be
                // bypassed. Editing an existing (possibly past) event is handled by
                // the PUT branch and isn't subject to this check.
                if ($startDate < date('Y-m-d')) {
                    $this->send_json(400, ['success' => false, 'message' => 'You cannot schedule an event for a date that has already passed.']);
                }

                $eventType = trim((string)($payload['type'] ?? 'None'));
                $eventTime = trim((string)($payload['time'] ?? ''));
                $endTime = trim((string)($payload['endTime'] ?? ''));
                $description = trim((string)($payload['description'] ?? ''));
                $location = trim((string)($payload['location'] ?? ''));
                $allDay = !empty($payload['allDay']) ? 1 : 0;

                if (!$allDay && $eventTime !== '' && $endTime !== '' && $endTime <= $eventTime) {
                    $this->send_json(400, ['success' => false, 'message' => 'End time must be after start time']);
                }

                $eventId = trim((string)($payload['id'] ?? ''));
                if ($eventId === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $eventId)) {
                    $eventId = $this->generate_event_id();
                }

                $insertSql = "
            INSERT INTO schedule_events (
                event_id, title, event_type, start_date, end_date, event_time, end_time,
                all_day, description, location, school_attended, created_by, created_role
            ) VALUES (?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?)
        ";

                $dbEndDate = $endDate ?: '';
                $dbLocation = $location;
                $dbDescription = $description;

                // An event blocks its time for bookings, so it can't be put over
                // a counseling session that's already booked. Checked and saved
                // under the same per-school lock the booking endpoint uses.
                $this->lock_schedule($conn, $school);
                try {
                    $this->reject_if_covers_bookings($conn, $school, [
                        'start_date' => $startDate,
                        'end_date' => $endDate,
                        'event_time' => $eventTime,
                        'end_time' => $endTime,
                        'all_day' => $allDay,
                    ]);

                    $stmt = $conn->prepare($insertSql);
                    if (!$stmt) {
                        $this->api_log('POST prepare failed: ' . $conn->error . ' SQL: ' . $insertSql);
                        $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                    }

                    $stmt->bind_param(
                        'sssssssisssss',
                        $eventId,
                        $title,
                        $eventType,
                        $startDate,
                        $dbEndDate,
                        $eventTime,
                        $endTime,
                        $allDay,
                        $dbDescription,
                        $dbLocation,
                        $school,
                        $createdBy,
                        $role
                    );

                    if (!$stmt->execute()) {
                        $this->api_log('POST execute failed: ' . $stmt->error);
                        $this->send_json(500, ['success' => false, 'message' => 'Failed to save event: ' . $stmt->error]);
                    }
                    $stmt->close();
                } finally {
                    ScheduleAvailability::unlock($conn, $school);
                }

                $this->api_log('POST saved event: ' . $eventId . ' school=' . $school . ' createdBy=' . $createdBy . ' role=' . $role);

                $this->send_json(201, [
                    'success' => true,
                    'message' => 'Event saved successfully',
                    'data' => [
                        'id' => $eventId,
                        'title' => $title,
                        'type' => $eventType,
                        'date' => $startDate,
                        'endDate' => $endDate,
                        'time' => $eventTime,
                        'endTime' => $endTime,
                        'allDay' => (bool)$allDay,
                        'description' => $description,
                        'location' => $location,
                        'createdBy' => $createdBy,
                        'createdRole' => $role
                    ]
                ]);
            }

            if ($method === 'PUT') {
                $raw = file_get_contents('php://input');
                $this->api_log('PUT raw: ' . substr($raw, 0, 4000));
                $payload = json_decode($raw, true);
                if (!is_array($payload)) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
                }

                $eventId = trim((string)($payload['id'] ?? ''));
                api_require_role(api_roles_guidance());
                $school = api_school();
                $role = api_role();

                if ($eventId === '' || $school === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Event id and school are required']);
                }

                if (!$this->is_allowed_editor_role($role)) {
                    $this->send_json(403, ['success' => false, 'message' => 'Only counselor or coordinator can edit calendar events']);
                }

                $title = trim((string)($payload['title'] ?? ''));
                if ($title === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Title is required']);
                }

                $startDate = $this->normalize_date_input($payload['date'] ?? null);
                $endDate = $this->normalize_date_input($payload['endDate'] ?? null);

                if ($startDate === null) {
                    $this->send_json(400, ['success' => false, 'message' => 'Invalid start date']);
                }

                if ($endDate !== null && $endDate < $startDate) {
                    $this->send_json(400, ['success' => false, 'message' => 'End date must be on or after start date']);
                }

                $eventType = trim((string)($payload['type'] ?? 'None'));
                $eventTime = trim((string)($payload['time'] ?? ''));
                $endTime = trim((string)($payload['endTime'] ?? ''));
                $description = trim((string)($payload['description'] ?? ''));
                $location = trim((string)($payload['location'] ?? ''));
                $allDay = !empty($payload['allDay']) ? 1 : 0;
                $dbEndDate = $endDate ?: '';

                if (!$allDay && $eventTime !== '' && $endTime !== '' && $endTime <= $eventTime) {
                    $this->send_json(400, ['success' => false, 'message' => 'End time must be after start time']);
                }

                $updateSql = "
            UPDATE schedule_events SET
                title = ?, event_type = ?, start_date = ?, end_date = NULLIF(?, ''),
                event_time = ?, end_time = ?, all_day = ?, description = NULLIF(?, ''), location = NULLIF(?, '')
            WHERE event_id = ? AND school_attended = ?
        ";

                // Looked up first so "not found" doesn't depend on affected_rows,
                // which is 0 when an edit is saved without changing anything.
                $existingStmt = $conn->prepare('SELECT start_date, end_date, event_time, end_time, all_day FROM schedule_events WHERE event_id = ? AND school_attended = ?');
                $existingStmt->bind_param('ss', $eventId, $school);
                $existingStmt->execute();
                $existing = $existingStmt->get_result()->fetch_assoc();
                $existingStmt->close();
                if (!$existing) {
                    $this->send_json(404, ['success' => false, 'message' => 'Event not found']);
                }

                $this->lock_schedule($conn, $school);
                try {
                    // Moving or widening the event can't cover a booked session.
                    // Sessions it already covered before this edit (booked before
                    // the rule existed) don't stop a title or description fix.
                    $this->reject_if_covers_bookings($conn, $school, [
                        'start_date' => $startDate,
                        'end_date' => $endDate,
                        'event_time' => $eventTime,
                        'end_time' => $endTime,
                        'all_day' => $allDay,
                    ], $existing);

                    $stmt = $conn->prepare($updateSql);
                    if (!$stmt) {
                        $this->api_log('PUT prepare failed: ' . $conn->error . ' SQL: ' . $updateSql);
                        $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                    }

                    $stmt->bind_param(
                        'ssssssissss',
                        $title,       // s
                        $eventType,   // s
                        $startDate,   // s
                        $dbEndDate,   // s
                        $eventTime,   // s
                        $endTime,     // s
                        $allDay,      // i
                        $description, // s
                        $location,    // s
                        $eventId,     // s (WHERE)
                        $school       // s (WHERE)
                    );

                    if (!$stmt->execute()) {
                        $this->api_log('PUT execute failed: ' . $stmt->error);
                        $this->send_json(500, ['success' => false, 'message' => 'Failed to update event: ' . $stmt->error]);
                    }

                    $stmt->close();
                } finally {
                    ScheduleAvailability::unlock($conn, $school);
                }
                $this->api_log('PUT updated event: ' . $eventId . ' school=' . $school);

                $this->send_json(200, [
                    'success' => true,
                    'message' => 'Event updated successfully',
                    'data' => [
                        'id' => $eventId,
                        'title' => $title,
                        'type' => $eventType,
                        'date' => $startDate,
                        'endDate' => $endDate,
                        'time' => $eventTime,
                        'endTime' => $endTime,
                        'allDay' => (bool)$allDay,
                        'description' => $description,
                        'location' => $location
                    ]
                ]);
            }

            if ($method === 'DELETE') {
                $eventId = trim((string)($_GET['id'] ?? ''));
                api_require_role(api_roles_guidance());
                $school = api_school();
                $role = api_role();
                $this->api_log('DELETE request id=' . $eventId . ' school=' . $school . ' role=' . $role . ' GET=' . json_encode($_GET));

                if ($eventId === '' || $school === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'Event id and school are required']);
                }

                if (!$this->is_allowed_editor_role($role)) {
                    $this->send_json(403, ['success' => false, 'message' => 'Only counselor or coordinator can delete calendar events']);
                }

                $stmt = $conn->prepare('DELETE FROM schedule_events WHERE event_id = ? AND school_attended = ?');
                if (!$stmt) {
                    $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                }

                $stmt->bind_param('ss', $eventId, $school);
                if (!$stmt->execute()) {
                    $this->send_json(500, ['success' => false, 'message' => 'Delete failed: ' . $stmt->error]);
                }

                if ($stmt->affected_rows === 0) {
                    $this->send_json(404, ['success' => false, 'message' => 'Event not found']);
                }

                $stmt->close();
                $this->send_json(200, ['success' => true, 'message' => 'Event deleted']);
            }

            $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
            $this->send_json(500, ['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
        }
    }

    private function lock_schedule(mysqli $conn, string $school): void {
        if (!ScheduleAvailability::lock($conn, $school)) {
            $this->send_json(503, ['success' => false, 'message' => 'The schedule is busy right now. Please try again in a moment.']);
        }
    }

    // Stops the request with a 409 when the event would cover a booked
    // counseling session. With $previous (the event before an edit), sessions
    // the old event already covered are let through. The message names only
    // dates and times, never students.
    private function reject_if_covers_bookings(mysqli $conn, string $school, array $event, ?array $previous = null): void {
        $covered = ScheduleAvailability::bookingsUnderEvent($conn, $school, $event);
        if ($previous !== null && !empty($covered)) {
            $alreadyCovered = array_column(ScheduleAvailability::bookingsUnderEvent($conn, $school, $previous), 'request_id');
            $covered = array_values(array_filter($covered, fn ($b) => !in_array($b['request_id'], $alreadyCovered, true)));
        }
        if (empty($covered)) {
            return;
        }
        $count = count($covered);
        $sessions = $count === 1 ? 'a counseling session that is' : "{$count} counseling sessions that are";
        $this->send_json(409, [
            'success' => false,
            'conflict' => true,
            'message' => "This event overlaps {$sessions} already booked: "
                . ScheduleAvailability::describeBookingTimes($covered)
                . '. Please choose a time or day outside them.',
        ]);
    }

    private function api_log(string $line): void {
        $logDir = storage_path('logs');
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0755, true);
        }
        $file = $logDir . DIRECTORY_SEPARATOR . 'schedule-events.log';
        $time = date('Y-m-d H:i:s');
        @file_put_contents($file, "[{$time}] " . $line . "\n", FILE_APPEND | LOCK_EX);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    private function normalize_date_input($value): ?string {
        $raw = trim((string)($value ?? ''));
        if ($raw === '') {
            return null;
        }

        $raw = str_replace('/', '-', $raw);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
            return $raw;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}[T\s].*$/', $raw)) {
            return substr($raw, 0, 10);
        }

        $ts = strtotime($raw);
        if ($ts === false) {
            return null;
        }

        return date('Y-m-d', $ts);
    }

    private function is_allowed_editor_role(string $role): bool {
        $normalized = strtolower(trim($role));
        if ($normalized === '') {
            return false;
        }

        if (in_array($normalized, ['coordinator', 'counselor', 'counselor-and-coordinator'], true)) {
            return true;
        }

        return strpos($normalized, 'coordinator') !== false || strpos($normalized, 'counselor') !== false;
    }

    private function ensure_schedule_table(mysqli $conn): void {
        $sql = "
        CREATE TABLE IF NOT EXISTS schedule_events (
            event_id VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL,
            event_type VARCHAR(80) DEFAULT 'None',
            start_date DATE NOT NULL,
            end_date DATE DEFAULT NULL,
            event_time VARCHAR(20) DEFAULT '',
            all_day TINYINT(1) NOT NULL DEFAULT 0,
            description TEXT,
            location VARCHAR(255) DEFAULT NULL,
            school_attended VARCHAR(100) NOT NULL,
            created_by VARCHAR(45) DEFAULT NULL,
            created_role VARCHAR(45) DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (event_id),
            INDEX idx_school_date (school_attended, start_date, end_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";

        if (!$conn->query($sql)) {
            $this->send_json(500, [
                'success' => false,
                'message' => 'Failed to initialize schedule table: ' . $conn->error
            ]);
        }

        // `end_time` is newer than the original table shape and MySQL 8 has no
        // "ADD COLUMN IF NOT EXISTS", so existence is checked via SHOW COLUMNS
        // first (same pattern as api/school-config.php's `district` column).
        $endTimeColumn = $conn->query("SHOW COLUMNS FROM schedule_events LIKE 'end_time'");
        if (!$endTimeColumn || $endTimeColumn->num_rows === 0) {
            $conn->query("ALTER TABLE schedule_events ADD COLUMN end_time VARCHAR(20) DEFAULT '' AFTER event_time");
        }
    }

    private function generate_event_id(): string {
        return 'evt_' . bin2hex(random_bytes(8));
    }
}
