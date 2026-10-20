<?php

namespace App\Services;

// Sends email via EmailJS's REST API (https://api.emailjs.com/api/v1.0/email/send)
// instead of raw SMTP — used because the school's email account can't
// provide direct SMTP/App Password access. Same public send() signature as
// the old SmtpMailer, so every caller (OTP verification, appointment
// notifications) plugs in without further changes.
//
// Requires ONE EmailJS "Email Template" whose "To Email" field is set to
// {{to_email}}, and whose body references {{message_html}} (or {{message}}
// for the plain-text variant) — see config/guidance.php for the EMAILJS_* .env settings.
class EmailJsMailer
{
    private const ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

    private string $serviceId;
    private string $templateId;
    private string $publicKey;
    private string $privateKey;
    private string $fromName;
    private int $timeoutSeconds;

    public function __construct(array $config)
    {
        $this->serviceId = (string)($config['emailjs_service_id'] ?? '');
        $this->templateId = (string)($config['emailjs_template_id'] ?? '');
        $this->publicKey = (string)($config['emailjs_public_key'] ?? '');
        $this->privateKey = (string)($config['emailjs_private_key'] ?? '');
        $this->fromName = (string)($config['from_name'] ?? '');
        $this->timeoutSeconds = 15;
    }

    /**
     * @return array{success: bool, message: string}
     */
    public function send(string $toEmail, string $toName, string $subject, string $htmlBody, string $textBody = ''): array
    {
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'message' => "Invalid recipient email: {$toEmail}"];
        }
        if ($this->serviceId === '' || $this->templateId === '' || $this->publicKey === '') {
            return ['success' => false, 'message' => 'EmailJS is not fully configured (service/template/public key missing)'];
        }

        if ($textBody === '') {
            $textBody = trim(strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", $htmlBody)));
        }

        $payload = [
            'service_id' => $this->serviceId,
            'template_id' => $this->templateId,
            'user_id' => $this->publicKey,
            'template_params' => [
                'to_email' => $toEmail,
                'to_name' => $toName !== '' ? $toName : $toEmail,
                'from_name' => $this->fromName !== '' ? $this->fromName : 'Guidance Management System',
                'subject' => $subject,
                'message_html' => $htmlBody,
                'message' => $textBody,
            ],
        ];
        // Private key bypasses EmailJS's default browser-Origin check, which
        // a server-side PHP request would otherwise fail (no Origin header).
        if ($this->privateKey !== '') {
            $payload['accessToken'] = $this->privateKey;
        }

        $ch = curl_init(self::ENDPOINT);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            return ['success' => false, 'message' => "EmailJS request failed: {$curlError}"];
        }
        if ($httpCode < 200 || $httpCode >= 300) {
            return ['success' => false, 'message' => "EmailJS error ({$httpCode}): " . trim((string)$response)];
        }

        return ['success' => true, 'message' => 'Email sent'];
    }
}
