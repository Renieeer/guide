<?php

namespace App\Support;

use mysqli;

/**
 * The one set of rules for whether a time on the school calendar is free.
 *
 * Every way of booking a counseling session (a student's own request, a
 * counselor's "Appoint Students", the Stage 6 follow-up calendar) and every
 * school event goes through these checks, so a slot that's taken can't be
 * booked again and no booking has to be declined or moved afterwards.
 * public/js/schedule-slots.js mirrors these rules so the pages can grey out
 * taken times before anything is sent.
 *
 * - A session is one 30-minute slot starting at one of SLOTS.
 * - A booking holds its slot unless it was rejected or cancelled.
 * - An all-day event blocks the whole day. A timed event blocks its
 *   [start, end) window, or one slot when it has no end time.
 * - Sessions booked together for the same counseling case (a group
 *   session) may share a slot.
 */
final class ScheduleAvailability
{
    public const SLOT_MINUTES = 30;

    // School hours: 8:00 AM - 12:00 PM and 1:00 PM - 4:00 PM.
    public const SLOTS = [
        '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    ];

    // Lower-case statuses that no longer hold a slot.
    public const INACTIVE_STATUSES = ['rejected', 'cancelled'];

    public static function toMinutes(?string $time): ?int
    {
        if (!preg_match('/^(\d{1,2}):(\d{2})/', trim((string) $time), $m)) {
            return null;
        }
        return (int) $m[1] * 60 + (int) $m[2];
    }

    // "13:30" -> "1:30 PM"; anything that isn't a time comes back as-is.
    public static function formatTime(?string $time): string
    {
        $minutes = self::toMinutes($time);
        if ($minutes === null) {
            return (string) $time;
        }
        $h = intdiv($minutes, 60) % 24;
        return sprintf('%d:%02d %s', $h % 12 ?: 12, $minutes % 60, $h < 12 ? 'AM' : 'PM');
    }

    public static function formatDate(string $date): string
    {
        return date('F j, Y', strtotime($date));
    }

    // "09:00" or "9:00" -> "09:00" when it's one of the bookable slots.
    public static function normalizeSlot(string $time): ?string
    {
        $minutes = self::toMinutes($time);
        if ($minutes === null) {
            return null;
        }
        $slot = sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
        return in_array($slot, self::SLOTS, true) ? $slot : null;
    }

    /*
    |----------------------------------------------------------------------
    | Locking
    |----------------------------------------------------------------------
    | Checking a slot and then saving into it are two queries, so two people
    | submitting the same slot at the same moment could both pass the check.
    | A named MySQL lock per school makes the check-and-save happen one at a
    | time. MySQL drops the lock itself if the connection ends.
    */

    public static function lock(mysqli $conn, string $school): bool
    {
        $name = self::lockName($school);
        $stmt = $conn->prepare('SELECT GET_LOCK(?, 10) AS got');
        $stmt->bind_param('s', $name);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return (int) ($row['got'] ?? 0) === 1;
    }

    public static function unlock(mysqli $conn, string $school): void
    {
        $name = self::lockName($school);
        $stmt = $conn->prepare('SELECT RELEASE_LOCK(?)');
        $stmt->bind_param('s', $name);
        $stmt->execute();
        $stmt->close();
    }

    private static function lockName(string $school): string
    {
        return 'gms_schedule_' . md5(strtolower(trim($school)));
    }

    /*
    |----------------------------------------------------------------------
    | Events
    |----------------------------------------------------------------------
    */

    // The [start, end) minutes an event blocks on each day it covers:
    // 'all' for the whole day, null when it blocks nothing.
    public static function eventWindow(array $event): array|string|null
    {
        $time = trim((string) ($event['event_time'] ?? ''));
        if (!empty($event['all_day']) || strcasecmp($time, 'All Day') === 0) {
            return 'all';
        }
        $start = self::toMinutes($time);
        if ($start === null) {
            return null;
        }
        $end = self::toMinutes((string) ($event['end_time'] ?? ''));
        return [$start, $end !== null && $end > $start ? $end : $start + self::SLOT_MINUTES];
    }

    // The first school event that blocks [start, end) on $date, or null.
    public static function blockingEvent(mysqli $conn, string $school, string $date, int $start, int $end): ?array
    {
        if (!self::tableExists($conn, 'schedule_events')) {
            return null;
        }
        $stmt = $conn->prepare(
            'SELECT event_id, title, event_time, end_time, all_day FROM schedule_events
             WHERE school_attended = ? AND start_date <= ? AND COALESCE(end_date, start_date) >= ?'
        );
        $stmt->bind_param('sss', $school, $date, $date);
        $stmt->execute();
        $result = $stmt->get_result();
        $found = null;
        while ($found === null && ($event = $result->fetch_assoc())) {
            $window = self::eventWindow($event);
            if ($window === 'all' || (is_array($window) && $start < $window[1] && $end > $window[0])) {
                $found = $event;
            }
        }
        $stmt->close();
        return $found;
    }

    /*
    |----------------------------------------------------------------------
    | Bookings
    |----------------------------------------------------------------------
    */

    /**
     * Bookings still holding a slot at $school between two dates, earliest
     * first.
     *
     * @return list<array{request_id: string, student_id: string, student_name: string, preferred_date: string, preferred_time: string, case_uid: ?string}>
     */
    public static function activeBookings(mysqli $conn, string $school, string $fromDate, string $toDate, string $excludeRequestId = ''): array
    {
        if (!self::tableExists($conn, 'appointment_requests')) {
            return [];
        }
        $inactive = implode(',', array_map(fn ($s) => "'" . $conn->real_escape_string($s) . "'", self::INACTIVE_STATUSES));
        $stmt = $conn->prepare(
            "SELECT request_id, student_id, student_name, preferred_date, preferred_time, case_uid
             FROM appointment_requests
             WHERE school_attended = ? AND preferred_date BETWEEN ? AND ? AND request_id <> ?
               AND LOWER(status) NOT IN ({$inactive})
             ORDER BY preferred_date ASC, preferred_time ASC"
        );
        $stmt->bind_param('ssss', $school, $fromDate, $toDate, $excludeRequestId);
        $stmt->execute();
        $result = $stmt->get_result();
        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }
        $stmt->close();
        return $rows;
    }

    // Another booking whose slot overlaps [start, end) on $date, or null.
    // Bookings for $sameCaseUid are skipped: a counselor can book several
    // students of one case into the same group session.
    public static function overlappingBooking(mysqli $conn, string $school, string $date, int $start, int $end, ?string $sameCaseUid = null): ?array
    {
        foreach (self::activeBookings($conn, $school, $date, $date) as $booking) {
            if ($sameCaseUid !== null && $sameCaseUid !== '' && strcasecmp((string) $booking['case_uid'], $sameCaseUid) === 0) {
                continue;
            }
            $bStart = self::toMinutes($booking['preferred_time']);
            if ($bStart !== null && $start < $bStart + self::SLOT_MINUTES && $end > $bStart) {
                return $booking;
            }
        }
        return null;
    }

    // Bookings an event would cover: every booking on the event's days that
    // falls inside its window.
    public static function bookingsUnderEvent(mysqli $conn, string $school, array $event): array
    {
        $window = self::eventWindow($event);
        if ($window === null) {
            return [];
        }
        $from = (string) $event['start_date'];
        $to = (string) ($event['end_date'] ?: $from);
        return array_values(array_filter(
            self::activeBookings($conn, $school, $from, $to),
            function ($booking) use ($window) {
                if ($window === 'all') {
                    return true;
                }
                $bStart = self::toMinutes($booking['preferred_time']);
                return $bStart !== null && $bStart < $window[1] && $bStart + self::SLOT_MINUTES > $window[0];
            }
        ));
    }

    // "November 26, 2026 at 9:00 AM, 9:30 AM; November 27, 2026 at 8:00 AM"
    // Times only, no names, so it's safe to show anyone who can add events.
    public static function describeBookingTimes(array $bookings, int $maxDays = 4): string
    {
        $byDate = [];
        foreach ($bookings as $b) {
            $byDate[$b['preferred_date']][] = self::formatTime($b['preferred_time']);
        }
        $parts = [];
        foreach (array_slice($byDate, 0, $maxDays, true) as $date => $times) {
            $parts[] = self::formatDate($date) . ' at ' . implode(', ', array_unique($times));
        }
        if (count($byDate) > $maxDays) {
            $parts[] = 'and ' . (count($byDate) - $maxDays) . ' more day(s)';
        }
        return implode('; ', $parts);
    }

    private static function tableExists(mysqli $conn, string $table): bool
    {
        static $known = [];
        if (!isset($known[$table])) {
            $escaped = $conn->real_escape_string($table);
            $result = $conn->query("SHOW TABLES LIKE '{$escaped}'");
            $known[$table] = $result && $result->num_rows > 0;
        }
        return $known[$table];
    }
}
