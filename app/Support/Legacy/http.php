<?php

// Shared plumbing for the controllers ported from the old api/*.php
// scripts. Those scripts talked to MySQL through one mysqli connection and
// ended every request with `echo json_encode(...); exit;` — these helpers
// keep that same calling style working inside Laravel's request cycle.

use Illuminate\Http\Exceptions\HttpResponseException;

// The app's single mysqli connection, built from config/database.php
// (.env DB_*), replacing the old api/conn.php. Sessions are pinned to
// Asia/Manila (+08:00) so MySQL's NOW()/CURRENT_TIMESTAMP agree with PHP's
// date() — see config/app.php's timezone.
function legacy_db(): mysqli
{
    static $conn = null;
    if ($conn instanceof mysqli) {
        return $conn;
    }

    $config = config('database.connections.mysql');

    try {
        $conn = new mysqli(
            $config['host'],
            $config['username'],
            $config['password'],
            $config['database'],
            (int) ($config['port'] ?? 3306)
        );
    } catch (mysqli_sql_exception $e) {
        throw new HttpResponseException(response()->json([
            'success' => false,
            'message' => 'Database connection failed: ' . $e->getMessage(),
        ], 500));
    }

    $conn->set_charset('utf8mb4');
    $conn->query("SET time_zone = '+08:00'");

    return $conn;
}

// Ends the request with a JSON body — the Laravel stand-in for the old
// `echo json_encode($payload); exit;`. The status code is whatever the
// controller last set with http_response_code() (200 if it never did),
// matching how the old scripts paired the two calls.
function json_out(mixed $payload, int $flags = 0): never
{
    $status = http_response_code();
    if (!is_int($status) || $status < 100) {
        $status = 200;
    }

    throw new HttpResponseException(response()->json($payload, $status, [], $flags));
}

// Ends the request with an empty body and the current status code — the
// stand-in for a bare `exit;`.
function legacy_halt(): never
{
    $status = http_response_code();
    if (!is_int($status) || $status < 100) {
        $status = 200;
    }

    throw new HttpResponseException(response('', $status));
}

// EmailJS settings (config/guidance.php, from .env), replacing the old
// api/mail-config.php. Null when EmailJS isn't configured at all — the old
// code's "mail-config.php not found" case.
function legacy_mail_config(): ?array
{
    $config = config('guidance.mail');
    if (!is_array($config) || ($config['emailjs_service_id'] ?? '') === '') {
        return null;
    }

    return $config;
}

// The logged-in user array stored at login (see Auth\LoginController).
// Routes that call this sit behind the `legacy.session` middleware, which
// has already rejected requests without a valid active session.
function require_api_session(): array
{
    return (array) session('user', []);
}
