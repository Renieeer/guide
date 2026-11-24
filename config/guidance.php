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

    // Profanity filter for what students write: feedback threads, replies
    // and rating comments (App\Support\ProfanityFilter). The word lists in
    // resources/profanity always run; see the README there to add words.
    'profanity' => [
        'enabled' => (bool) env('PROFANITY_FILTER_ENABLED', true),

        // Also block milder words (stupid, damn, bobo, tanga, bwisit...).
        'block_mild' => (bool) env('PROFANITY_BLOCK_MILD', true),

        // Optional second check with Sightengine (https://sightengine.com):
        // rule-based profanity detection in 18 languages, including
        // Tagalog. Free plan: 2,000 checks a month, at most 500 a day. Runs
        // only when a student submits (never while typing), and identical
        // texts are checked once a day. Leave the keys empty to use the word
        // lists alone; if Sightengine can't be reached the lists still apply.
        'sightengine' => [
            'api_user' => env('SIGHTENGINE_API_USER', ''),
            'api_secret' => env('SIGHTENGINE_API_SECRET', ''),
            // Languages to check, comma-separated (Sightengine detects which
            // one a text is in). The 18 it supports for profanity.
            'languages' => env('SIGHTENGINE_LANGUAGES', 'en,tl,es,fr,de,it,pt,nl,pl,ro,ru,tr,zh,ko,da,fi,no,sv'),
            'timeout' => (int) env('SIGHTENGINE_TIMEOUT', 4),
        ],
    ],

];
