<?php

// Sends the "2.4 Receive notifications via email regarding their
// appointments" emails. Kept as a standalone include (rather than living
// inside appointment-request.php) so it can also be called from a manual
// resend endpoint without duplicating logic.

function appointment_email_log(string $line): void
{
    $logDir = storage_path('logs');
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $file = $logDir . DIRECTORY_SEPARATOR . 'appointment-email.log';
    $time = date('Y-m-d H:i:s');
    @file_put_contents($file, "[{$time}] " . $line . "\n", FILE_APPEND | LOCK_EX);
}

function ensure_email_notifications_table(mysqli $conn): void
{
    $conn->query("
        CREATE TABLE IF NOT EXISTS email_notifications (
            id VARCHAR(64) NOT NULL,
            request_id VARCHAR(64) NOT NULL,
            recipient_email VARCHAR(255) NOT NULL,
            event VARCHAR(45) NOT NULL,
            status VARCHAR(20) NOT NULL,
            error_message VARCHAR(500) DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_request (request_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");
}

function appointment_email_content(string $event, array $appointment): array
{
    $name = $appointment['student_name'] ?: 'Student';
    $date = date('F j, Y', strtotime($appointment['preferred_date']));
    $time = $appointment['preferred_time'];
    $reason = $appointment['reason'];
    $notes = trim((string)($appointment['counselor_notes'] ?? ''));

    switch ($event) {
        case 'submitted':
            $subject = 'Appointment Request Received';
            $intro = "We've received your counselling appointment request and it is now pending review.";
            break;
        case 'approved':
            $subject = 'Appointment Confirmed';
            $intro = 'Your counselling appointment has been confirmed. Please see the details below.';
            break;
        case 'rejected':
            $subject = 'Appointment Request Declined';
            $intro = 'Your counselling appointment request could not be approved as scheduled.';
            break;
        case 'proposed_change':
            $subject = 'Appointment Change Proposed';
            $intro = 'Your guidance counselor has proposed a change to your requested appointment.';
            break;
        case 'reminder':
            $subject = 'Reminder: Your Appointment Is Tomorrow';
            $intro = 'This is a friendly reminder that your counselling appointment is scheduled for tomorrow.';
            break;
        default:
            $subject = 'Appointment Status Updated';
            $intro = 'There has been an update to your counselling appointment.';
            break;
    }

    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeDate = htmlspecialchars($date, ENT_QUOTES, 'UTF-8');
    $safeTime = htmlspecialchars($time, ENT_QUOTES, 'UTF-8');
    $safeReason = htmlspecialchars($reason, ENT_QUOTES, 'UTF-8');
    $safeIntro = htmlspecialchars($intro, ENT_QUOTES, 'UTF-8');

    $notesHtml = '';
    $notesText = '';
    if ($notes !== '') {
        $safeNotes = htmlspecialchars($notes, ENT_QUOTES, 'UTF-8');
        $notesHtml = "<p><strong>Counselor notes:</strong> {$safeNotes}</p>";
        $notesText = "Counselor notes: {$notes}\n";
    }

    $html = <<<HTML
        <p>Hi {$safeName},</p>
        <p>{$safeIntro}</p>
        <ul>
            <li><strong>Date:</strong> {$safeDate}</li>
            <li><strong>Time:</strong> {$safeTime}</li>
            <li><strong>Reason:</strong> {$safeReason}</li>
        </ul>
        {$notesHtml}
        <p>You can review this appointment anytime from your student portal.</p>
        <p>&mdash; Guidance Management System</p>
    HTML;

    $text = "Hi {$name},\n\n{$intro}\n\n"
        . "Date: {$date}\n"
        . "Time: {$time}\n"
        . "Reason: {$reason}\n"
        . $notesText
        . "\nYou can review this appointment anytime from your student portal.\n\n-- Guidance Management System";

    return ['subject' => $subject, 'html' => $html, 'text' => $text];
}

/**
 * Best-effort: sends (and logs) an appointment notification email. Never
 * throws — a mail failure must not block the appointment request/update
 * itself, it's only ever called after that already succeeded.
 *
 * @return array{success: bool, message: string}
 */
function notify_appointment_email(mysqli $conn, string $requestId, string $event): array
{
    try {
        ensure_email_notifications_table($conn);

        $config = legacy_mail_config();
        if ($config === null) {
            appointment_email_log("Skipped ({$event}) for {$requestId}: EmailJS is not configured in .env");
            return ['success' => false, 'message' => 'Mail is not configured'];
        }
        if (empty($config['enabled'])) {
            appointment_email_log("Skipped ({$event}) for {$requestId}: mail sending disabled (MAIL_ENABLED=false in .env)");
            return ['success' => false, 'message' => 'Mail sending is disabled'];
        }

        $stmt = $conn->prepare("SELECT student_id, student_name, preferred_date, preferred_time, reason, counselor_notes FROM appointment_requests WHERE request_id = ?");
        $stmt->bind_param('s', $requestId);
        $stmt->execute();
        $appointment = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$appointment) {
            appointment_email_log("Failed ({$event}) for {$requestId}: appointment not found");
            return ['success' => false, 'message' => 'Appointment not found'];
        }

        $studentStmt = $conn->prepare("SELECT email, First_name, Last_name FROM users_tables WHERE AccountID = ?");
        $studentStmt->bind_param('i', $appointment['student_id']);
        $studentStmt->execute();
        $account = $studentStmt->get_result()->fetch_assoc();
        $studentStmt->close();

        if (!$account || empty($account['email'])) {
            appointment_email_log("Failed ({$event}) for {$requestId}: no email on file for student_id {$appointment['student_id']}");
            return ['success' => false, 'message' => 'Student has no email on file'];
        }

        $recipientEmail = $account['email'];
        $recipientName = trim(($account['First_name'] ?? '') . ' ' . ($account['Last_name'] ?? ''));

        $content = appointment_email_content($event, $appointment);
        $mailer = new \App\Services\EmailJsMailer($config);
        $result = $mailer->send($recipientEmail, $recipientName, $content['subject'], $content['html'], $content['text']);

        $logId = 'mail_' . bin2hex(random_bytes(8));
        $status = $result['success'] ? 'sent' : 'failed';
        $errorMessage = $result['success'] ? null : substr($result['message'], 0, 500);

        $logStmt = $conn->prepare("INSERT INTO email_notifications (id, request_id, recipient_email, event, status, error_message) VALUES (?, ?, ?, ?, ?, ?)");
        $logStmt->bind_param('ssssss', $logId, $requestId, $recipientEmail, $event, $status, $errorMessage);
        $logStmt->execute();
        $logStmt->close();

        appointment_email_log(sprintf(
            '%s (%s) for %s to %s: %s',
            $result['success'] ? 'Sent' : 'Failed',
            $event,
            $requestId,
            $recipientEmail,
            $result['message']
        ));

        return $result;
    } catch (\Illuminate\Http\Exceptions\HttpResponseException $halt) {
    throw $halt;
} catch (Throwable $e) {
        appointment_email_log("Exception ({$event}) for {$requestId}: " . $e->getMessage());
        return ['success' => false, 'message' => $e->getMessage()];
    }
}
