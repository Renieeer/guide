<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

// Same job as GET /api/send-appointment-reminders?key=..., for hosts that
// can run Laravel's scheduler (see App\Console\Kernel::schedule()).
// Idempotent: each approved appointment gets at most one reminder attempt,
// tracked in email_notifications (event='reminder').
class SendAppointmentReminders extends Command
{
    protected $signature = 'appointments:send-reminders';

    protected $description = 'Email a reminder for every approved appointment happening tomorrow';

    public function handle(): int
    {
        $conn = legacy_db();
        ensure_email_notifications_table($conn);

        $result = $conn->query("
            SELECT request_id FROM appointment_requests
            WHERE status = 'approved'
              AND preferred_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
              AND request_id NOT IN (
                  SELECT request_id FROM email_notifications WHERE event = 'reminder'
              )
        ");

        $sent = 0;
        $failed = 0;
        while ($row = $result->fetch_assoc()) {
            $r = notify_appointment_email($conn, $row['request_id'], 'reminder');
            if ($r['success']) {
                $sent++;
            } else {
                $failed++;
                $this->warn("{$row['request_id']}: {$r['message']}");
            }
        }

        $this->info("Reminders sent: {$sent}, failed: {$failed}");

        return self::SUCCESS;
    }
}
