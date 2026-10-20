<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// The API controllers were ported from plain PHP scripts, where a PHP
// warning or notice (e.g. reading a missing array key) was logged and the
// request carried on. Laravel turns every warning into an exception, which
// would change those endpoints' behaviour, so they run with warnings and
// notices reported to the log instead of thrown.
class LegacyErrorReporting
{
    public function handle(Request $request, Closure $next): Response
    {
        $previous = error_reporting(E_ALL & ~E_WARNING & ~E_NOTICE & ~E_USER_WARNING & ~E_USER_NOTICE & ~E_DEPRECATED & ~E_USER_DEPRECATED);

        set_error_handler(function (int $level, string $message, string $file = '', int $line = 0) {
            if (in_array($level, [E_WARNING, E_NOTICE, E_USER_WARNING, E_USER_NOTICE], true)) {
                logger()->warning("PHP warning: {$message}", ['file' => $file, 'line' => $line]);
            }
            return true;
        }, E_WARNING | E_NOTICE | E_USER_WARNING | E_USER_NOTICE);

        try {
            return $next($request);
        } finally {
            restore_error_handler();
            error_reporting($previous);
        }
    }
}
