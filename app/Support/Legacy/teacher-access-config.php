<?php

/**
 * Coordinator-issued access codes for teacher self-registration
 * (staff-register.php -> api/teacher-signup-request.php).
 *
 * Two-layer verification: this code proves a coordinator authorized the
 * person (single-use, bound to one email, short expiry, emailed straight to
 * that inbox); the email OTP sent afterwards (see email-verification.php)
 * proves that person actually owns that inbox too. Neither layer alone is
 * enough — a leaked code could be handed to anyone, and self-serve OTP alone
 * (the old staff-register.php behavior) let anyone, including a student,
 * register as a teacher with their own inbox and no coordinator involved
 * at all.
 */

function ensure_teacher_access_schema(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    $conn->query("
        CREATE TABLE IF NOT EXISTS teacher_access_codes (
            id VARCHAR(64) NOT NULL,
            email VARCHAR(255) NOT NULL,
            school VARCHAR(100) NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            issued_by INT NULL,
            used TINYINT(1) NOT NULL DEFAULT 0,
            attempts INT NOT NULL DEFAULT 0,
            expires_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");
}

// Unambiguous alphabet (no 0/O/1/I) so a code copied by hand from a
// coordinator's screen, or read aloud, doesn't get misread.
const TEACHER_ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generate_teacher_access_code_plaintext(int $length = 10): string {
    $alphabet = TEACHER_ACCESS_CODE_ALPHABET;
    $max = strlen($alphabet) - 1;
    $code = '';
    for ($i = 0; $i < $length; $i++) {
        $code .= $alphabet[random_int(0, $max)];
    }
    return $code;
}

function teacher_access_code_email_content(string $code, string $school): array {
    $safeSchool = htmlspecialchars($school, ENT_QUOTES, 'UTF-8');
    $subject = 'Your teacher access code for ' . $school;
    $html = <<<HTML
        <p>Hi,</p>
        <p>Your coordinator at {$safeSchool} has authorized you to register a teacher account. Use the code below on the Staff Registration page:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">{$code}</p>
        <p>This code expires in 2 hours and can only be used once. If you weren't expecting this, you can ignore this email.</p>
        <p>&mdash; Guidance Management System</p>
    HTML;
    $text = "Hi,\n\nYour coordinator at {$school} has authorized you to register a teacher account. "
        . "Use this code on the Staff Registration page: {$code}\n\n"
        . "This code expires in 2 hours and can only be used once. If you weren't expecting this, you can ignore this email.\n\n"
        . "-- Guidance Management System";
    return ['subject' => $subject, 'html' => $html, 'text' => $text];
}

function teacher_password_is_strong(string $password): bool {
    return strlen($password) >= 8
        && preg_match('/[A-Z]/', $password)
        && preg_match('/[a-z]/', $password)
        && preg_match('/[0-9]/', $password)
        && preg_match('/[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]/', $password);
}

/**
 * Generates a new code for $email, replacing any earlier *unused* one for
 * that address (only one live code per email at a time). Throttled to one
 * issuance every 60s per email so a coordinator double-clicking "Generate"
 * doesn't spam the teacher with mismatched codes.
 *
 * @return array{success: bool, message: string, code?: string, expiresAt?: string}
 */
function issue_teacher_access_code(mysqli $conn, string $email, string $school, ?int $issuedBy): array {
    ensure_teacher_access_schema($conn);

    $throttleStmt = $conn->prepare("SELECT created_at FROM teacher_access_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1");
    $throttleStmt->bind_param('s', $email);
    $throttleStmt->execute();
    $lastRow = $throttleStmt->get_result()->fetch_assoc();
    $throttleStmt->close();

    if ($lastRow) {
        $secondsSinceLast = time() - strtotime($lastRow['created_at']);
        if ($secondsSinceLast < 60) {
            $wait = 60 - $secondsSinceLast;
            return ['success' => false, 'message' => "Please wait {$wait}s before issuing another code to this email."];
        }
    }

    $plainCode = generate_teacher_access_code_plaintext();
    $hash = password_hash($plainCode, PASSWORD_BCRYPT);
    // Computed in PHP rather than MySQL's own NOW() — see the matching
    // comment on generate_and_send_otp() in email-verification.php for why
    // (PHP/MySQL clock & timezone can otherwise drift on this host).
    $now = time();
    $createdAt = date('Y-m-d H:i:s', $now);
    $expiresAt = date('Y-m-d H:i:s', $now + 7200); // 2 hours
    $id = 'tac_' . bin2hex(random_bytes(8));

    $deleteStmt = $conn->prepare("DELETE FROM teacher_access_codes WHERE email = ? AND used = 0");
    $deleteStmt->bind_param('s', $email);
    $deleteStmt->execute();
    $deleteStmt->close();

    $insertStmt = $conn->prepare("INSERT INTO teacher_access_codes (id, email, school, code_hash, issued_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $insertStmt->bind_param('ssssiss', $id, $email, $school, $hash, $issuedBy, $expiresAt, $createdAt);
    $insertStmt->execute();
    $insertStmt->close();

    $emailSent = false;
    if (is_mail_enabled()) {
        $config = legacy_mail_config();
        $content = teacher_access_code_email_content($plainCode, $school);
        $mailer = new \App\Services\EmailJsMailer($config);
        $sendResult = $mailer->send($email, '', $content['subject'], $content['html'], $content['text']);
        $emailSent = $sendResult['success'];
        otp_log(($emailSent ? 'Sent' : 'Failed') . " teacher access code to {$email}: " . $sendResult['message']);
    } else {
        otp_log("Skipped teacher access code email to {$email}: mail sending disabled (MAIL_ENABLED=false in .env)");
    }

    return [
        'success' => true,
        'message' => $emailSent
            ? 'Access code emailed to the teacher.'
            : 'Access code generated, but the email could not be sent — copy it and give it to the teacher directly.',
        'code' => $plainCode,
        'expiresAt' => $expiresAt,
        'emailSent' => $emailSent
    ];
}

/**
 * Looks up (without consuming) the latest unused code for $email and checks
 * it against $code. Deliberately collapses "no code", "expired", "wrong
 * code", and "too many wrong tries" into a single null result — the caller
 * should surface one generic message for all of them (never reveal which
 * check failed, or whether $email has ever had a code issued to it).
 *
 * Consumption (used = 1) happens later, once the OTP step also succeeds —
 * see burn_teacher_access_code().
 *
 * @return array{id: string, school: string}|null
 */
function find_valid_teacher_access_code(mysqli $conn, string $email, string $code): ?array {
    ensure_teacher_access_schema($conn);

    $stmt = $conn->prepare("SELECT id, school, code_hash, expires_at, attempts FROM teacher_access_codes WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1");
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return null;
    }

    if ((int)$row['attempts'] >= 10 || strtotime($row['expires_at']) < time()) {
        return null;
    }

    if (!password_verify($code, $row['code_hash'])) {
        $incStmt = $conn->prepare("UPDATE teacher_access_codes SET attempts = attempts + 1 WHERE id = ?");
        $incStmt->bind_param('s', $row['id']);
        $incStmt->execute();
        $incStmt->close();
        return null;
    }

    return ['id' => (string)$row['id'], 'school' => (string)$row['school']];
}

/** Marks a code consumed. Called once the OTP step also succeeds. */
function burn_teacher_access_code(mysqli $conn, string $codeId): void {
    $stmt = $conn->prepare("UPDATE teacher_access_codes SET used = 1 WHERE id = ?");
    $stmt->bind_param('s', $codeId);
    $stmt->execute();
    $stmt->close();
}

/** Burns the latest unused code for $email, if any — a no-op otherwise. */
function burn_teacher_access_code_for_email(mysqli $conn, string $email): void {
    ensure_teacher_access_schema($conn);

    $stmt = $conn->prepare("SELECT id FROM teacher_access_codes WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1");
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row) {
        burn_teacher_access_code($conn, (string)$row['id']);
    }
}
