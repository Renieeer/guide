<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guidance Management System - Staff Login</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body class="auth-page" data-portal="staff">
    <nav id="navbar">
        <a class="nav-brand" href="{{ url('/') }}">
            <span class="nav-dot"></span> EGuide
        </a>
        <button class="nav-toggle" id="navToggle" aria-label="Menu">
            <i class="bi bi-list"></i>
        </button>
        <ul class="nav-links" id="navLinks">
            <li><a href="{{ url('/') }}#features">Features</a></li>
            <li><a href="{{ url('/') }}#roles">Roles</a></li>
            <li><a href="{{ url('/') }}#about">About</a></li>
            <li><a href="{{ url('login') }}">Student Login</a></li>
            <li><a href="{{ url('staff-login') }}" class="btn-nav">Staff Login</a></li>
        </ul>
    </nav>

    <div class="auth-container">
        <div class="auth-left">
            <div class="auth-brand">
                <div class="brand-icon">
                    <i class="bi bi-briefcase"></i>
                </div>
                <h2>Teacher Portal</h2>
                <p>For Teachers</p>
            </div>

            <div class="auth-features">
                <div class="feature">
                    <i class="bi bi-person-workspace"></i>
                    <span>Teacher Referrals</span>
                </div>
                <div class="feature">
                    <i class="bi bi-clipboard2-pulse"></i>
                    <span>Counseling &amp; Cases</span>
                </div>
                <div class="feature">
                    <i class="bi bi-bar-chart-line"></i>
                    <span>Guidance Oversight</span>
                </div>
            </div>
        </div>

        <div class="auth-right">
            <!-- No separate access-code gate here — a teacher account only
                 exists once it's been through the coordinator-issued access
                 code + email OTP in staff-register.php, so a plain
                 email/password sign-in is already backed by both checks.
                 See js/auth.js's staff-portal role guard for what keeps
                 non-teacher accounts off this form. -->
            <div class="auth-box" id="staffLoginBox">
                <h1>Teacher Sign In</h1>
                <p class="auth-subtitle">Sign in with your teacher account</p>

                <form id="loginForm" class="auth-form">
                    <div id="loginError" class="error-alert"></div>

                    <div class="form-group">
                        <label for="email">Email Address</label>
                        <div class="input-wrapper">
                            <input type="email" id="email" name="email" placeholder="your@email.com" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="password">Password</label>
                        <div class="input-wrapper password-wrapper">
                            <input type="password" id="password" name="password" placeholder="••••••••" required>
                            <button type="button" class="toggle-password" id="togglePassword">
                                <i class="bi bi-eye"></i>
                            </button>
                        </div>
                    </div>

                    <button type="submit" class="btn btn-auth-primary">
                        <span>Sign In</span>
                        <i class="bi bi-arrow-right"></i>
                    </button>
                </form>

                <div class="auth-divider">
                    <span>New teacher?</span>
                    <a href="{{ url('staff-register') }}" class="auth-link">Create Teacher Account <i class="bi bi-arrow-right"></i></a>
                </div>

                <p class="text-muted" style="text-align:center; margin-top: 16px; font-size: 13px;">
                    Not a teacher? <a href="{{ url('login') }}" class="auth-link">Go to Login</a>
                </p>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/otp-verify.js') }}"></script>
    <script src="{{ asset('js/auth.js') }}"></script>
    <script>
        const navToggle = document.getElementById('navToggle');
        const navLinks = document.getElementById('navLinks');

        if (navToggle && navLinks) {
            navToggle.addEventListener('click', () => {
                navLinks.classList.toggle('open');
            });
        }
    </script>
</body>
</html>
