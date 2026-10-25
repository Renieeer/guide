{{--
    The one error page behind errors/403.blade.php and errors/404.blade.php
    (and /error?code=..., which Apache's ErrorDocument reaches through
    public/error.php). Expects $code: 403 or 404.

    Self-contained (inline CSS and SVG, no fonts or icon CDN) so it still
    renders when the app's own assets are what's missing. Never shows the
    exception message, file paths or server details.
--}}
@php
    $code = (int) $code === 403 ? 403 : 404;
    $viewer = error_page_viewer();
    // Teachers sign in on the staff portal; everyone else on the main one.
    $loginUrl = url(request()->is('teacher', 'teacher/*') ? 'staff-login' : 'login');
    $title = match (true) {
        $code === 404 => 'Page Not Found',
        $viewer === null => 'Log In Required',
        default => 'Access Denied',
    };
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>{{ $title }} - Guidance Management System</title>
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <style>
        /* Same navy ramp and neutrals as :root in public/css/style.css. */
        :root {
            --navy-900: #0b1f3a;
            --navy-700: #123a6b;
            --navy-600: #1a4c88;
            --navy-500: #1d5aa8;
            --navy-200: #c3d4e8;
            --navy-100: #e8eff7;
            --navy-050: #f2f6fb;
            --ink: #16233a;
            --ink-muted: #5a6b80;
            --border: #d8e0ea;
            --warn: #a15c00;
            --warn-bg: #fcf1e2;
        }

        *, *::before, *::after { box-sizing: border-box; }

        html, body { margin: 0; min-height: 100%; }

        body {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 32px 16px;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            line-height: 1.6;
            color: var(--ink);
            background:
                radial-gradient(ellipse at top, rgba(29, 90, 168, 0.10), transparent 60%),
                var(--navy-050);
            -webkit-font-smoothing: antialiased;
        }

        .error-card {
            width: 100%;
            max-width: 480px;
            padding: 40px 32px 32px;
            text-align: center;
            background: #fff;
            border: 1px solid var(--border);
            border-radius: 16px;
            box-shadow: 0 8px 16px rgba(11, 31, 58, 0.12), 0 4px 8px rgba(11, 31, 58, 0.08);
        }

        .error-brand {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 28px;
            font-weight: 700;
            color: var(--navy-900);
            text-decoration: none;
        }

        .error-brand img {
            width: 28px;
            height: 28px;
            border-radius: 50%;
        }

        .error-brand span {
            font-weight: 400;
            font-size: 13px;
            color: var(--ink-muted);
        }

        .error-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 64px;
            height: 64px;
            border-radius: 50%;
            color: var(--navy-700);
            background: var(--navy-100);
        }

        .error-icon.is-warn {
            color: var(--warn);
            background: var(--warn-bg);
        }

        .error-icon svg { width: 30px; height: 30px; }

        .error-code {
            margin: 12px 0 4px;
            font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
            font-size: clamp(64px, 20vw, 96px);
            font-weight: 900;
            line-height: 1;
            letter-spacing: -2px;
            color: var(--navy-700);
        }

        .error-card h1 {
            margin: 0 0 8px;
            font-size: 22px;
            line-height: 1.3;
            color: var(--ink);
        }

        .error-card p {
            margin: 0 auto;
            max-width: 36ch;
            font-size: 15px;
            color: var(--ink-muted);
        }

        .error-role {
            display: inline-block;
            margin-top: 16px;
            padding: 4px 14px;
            font-size: 14px;
            color: var(--navy-700);
            background: var(--navy-100);
            border-radius: 999px;
        }

        .error-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 12px;
            margin-top: 28px;
        }

        .error-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 44px;
            padding: 10px 22px;
            font: inherit;
            font-weight: 600;
            font-size: 15px;
            text-decoration: none;
            border-radius: 10px;
            border: 1.5px solid var(--navy-700);
            cursor: pointer;
            transition: background-color 0.15s, border-color 0.15s, color 0.15s;
        }

        .error-btn-primary {
            color: #fff;
            background: var(--navy-700);
        }

        .error-btn-primary:hover {
            background: var(--navy-600);
            border-color: var(--navy-600);
        }

        .error-btn-secondary {
            color: var(--navy-700);
            background: #fff;
            border-color: var(--navy-200);
        }

        .error-btn-secondary:hover {
            background: var(--navy-050);
            border-color: var(--navy-700);
        }

        .error-btn:focus-visible,
        .error-brand:focus-visible {
            outline: 3px solid var(--navy-500);
            outline-offset: 2px;
        }

        @media (max-width: 480px) {
            .error-card { padding: 32px 20px 24px; }
            .error-actions { flex-direction: column; }
            .error-btn { width: 100%; }
        }
    </style>
</head>
<body>
    <main class="error-card">
        <a class="error-brand" href="{{ url('/') }}">
            <img src="{{ asset('img/deped-seal.jpg') }}" alt="" width="28" height="28">
            EGuide <span>Guidance Management System</span>
        </a>

        @if ($code === 404)
            <div class="error-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M15.5 8.5l-2 5-5 2 2-5z"/>
                </svg>
            </div>
            <div class="error-code">404</div>
            <h1>Page not found</h1>
            <p>The link may be broken, or the page may have been moved.</p>

            <div class="error-actions">
                @if ($viewer)
                    <a class="error-btn error-btn-primary" href="{{ $viewer['dashboard'] }}">Go to Dashboard</a>
                @else
                    <a class="error-btn error-btn-primary" href="{{ $loginUrl }}">Go to Login</a>
                @endif
                <a class="error-btn error-btn-secondary" href="{{ url('/') }}" id="goBack">Go Back</a>
            </div>
        @elseif ($viewer === null)
            <div class="error-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="5" y="11" width="14" height="10" rx="2"/>
                    <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                    <path d="M12 15v2"/>
                </svg>
            </div>
            <div class="error-code">403</div>
            <h1>Please log in to continue</h1>
            <p>You need to be signed in to view this page. If you were, your session may have ended.</p>

            <div class="error-actions">
                <a class="error-btn error-btn-primary" href="{{ $loginUrl }}">Go to Login</a>
            </div>
        @else
            <div class="error-icon is-warn" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/>
                    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>
                </svg>
            </div>
            <div class="error-code">403</div>
            <h1>You don't have permission to view this page</h1>
            <p>Your account doesn't have access to this page.</p>
            <div class="error-role">Signed in as <strong>{{ $viewer['role'] }}</strong></div>

            <div class="error-actions">
                <a class="error-btn error-btn-primary" href="{{ $viewer['dashboard'] }}">Back to Dashboard</a>
            </div>
        @endif
    </main>

    <script>
        // "Go Back" returns to the previous page when there is one; opened in
        // a fresh tab it just follows its link to the home page.
        (function () {
            var back = document.getElementById('goBack');
            if (back && window.history.length > 1) {
                back.addEventListener('click', function (e) {
                    e.preventDefault();
                    window.history.back();
                });
            }
        })();
    </script>
</body>
</html>
