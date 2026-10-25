<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Laravel doesn't send Content-Length, so under `php artisan serve` (PHP's
// built-in server) the end of a page is only marked by closing the
// connection. VS Code's port forwarding (dev tunnels) doesn't pass that
// close on, and the browser keeps waiting: the page shows but never
// finishes loading, and js/loader.js's loading screen covers it. Sending
// the length marks the end explicitly. Apache already handles this, so
// it's a no-op there.
class SetContentLength
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // getContent() is false for streamed and file responses, which
        // manage their own length; 1xx/204/304 must not carry a body.
        $content = $response->getContent();
        if ($content !== false && !$response->headers->has('Content-Length')
            && !$response->isInformational() && !$response->isEmpty()) {
            $response->headers->set('Content-Length', (string) strlen($content));
        }

        return $response;
    }
}
