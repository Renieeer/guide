<?php

// App-specific settings that used to live in api/mail-config.php.

return [

    // EmailJS (https://www.emailjs.com) — used for OTP verification codes,
    // teacher access codes and appointment notifications. Needs ONE EmailJS
    // "Email Template" whose "To Email" field is {{to_email}} and whose body
    // references {{message_html}} (or {{message}} for plain text).
    'mail' => [
        'emailjs_service_id' => env('EMAILJS_SERVICE_ID', ''),
        'emailjs_template_id' => env('EMAILJS_TEMPLATE_ID', ''),
        'emailjs_public_key' => env('EMAILJS_PUBLIC_KEY', ''),
        'emailjs_private_key' => env('EMAILJS_PRIVATE_KEY', ''),
        'from_name' => env('EMAILJS_FROM_NAME', 'Guidance Management System'),
        'enabled' => (bool) env('EMAILJS_ENABLED', false),

        // Shared secret for /api/send-appointment-reminders?key=...
        // (pinged by an external cron), and for `php artisan
        // appointments:send-reminders`.
        'reminder_secret' => env('REMINDER_SECRET', ''),
    ],

];
