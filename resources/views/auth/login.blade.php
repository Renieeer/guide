<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guidance Management System - Login</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body class="auth-page">
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
            <li><a href="{{ url('login') }}">Log In</a></li>
            <li><a href="{{ url('register') }}" class="btn-nav">Register</a></li>
        </ul>
    </nav>

    <div class="auth-container">
        <div class="auth-left">
            <div class="auth-brand">
                <div class="brand-icon">
                    <img src="{{ asset('img/deped-seal.jpg') }}" alt="DepEd seal">
                </div>
                <h2>Guidance Management</h2>
                <p>Comprehensive Student Counselling & Referral System</p>
            </div>
            
            <div class="auth-features">
                <div class="feature">
                    <i class="bi bi-shield-check"></i>
                    <span>Secure & Private</span>
                </div>
                <div class="feature">
                    <i class="bi bi-people-fill"></i>
                    <span>Student Support</span>
                </div>
                <div class="feature">
                    <i class="bi bi-graph-up"></i>
                    <span>Track Progress</span>
                </div>
            </div>
        </div>

        <div class="auth-right">
            <div class="auth-box">
                <h1>Welcome Back</h1>
                <p class="auth-subtitle">Sign in to your account to continue</p>

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
                    <span>Don't have an account?</span>
                    <a href="{{ url('register') }}" class="auth-link">Create New Account <i class="bi bi-arrow-right"></i></a>
                </div>

                <p class="text-muted" style="text-align:center; margin-top: 16px; font-size: 13px;">
                    Teacher? <a href="{{ url('staff-login') }}" class="auth-link">Go to Staff Login</a>
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
