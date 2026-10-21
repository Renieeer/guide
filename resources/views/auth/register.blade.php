<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guidance Management System - Register</title>
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
                    <span>Secure Registration</span>
                </div>
                <div class="feature">
                    <i class="bi bi-building"></i>
                    <span>School-based Access</span>
                </div>
                <div class="feature">
                    <i class="bi bi-people-fill"></i>
                    <span>Safe Environment</span>
                </div>
            </div>
        </div>

        <div class="auth-right">
            <div class="auth-box auth-register-box">
                <h1>Create Your Student Account</h1>
                <p class="auth-subtitle">Join our guidance management community today</p>

                <form id="registerForm" class="auth-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="firstName">First Name *</label>
                            <div class="input-wrapper">
                                <input type="text" id="firstName" name="firstName" placeholder="John" required>
                            </div>
                            <small class="error-text"></small>
                        </div>

                        <div class="form-group">
                            <label for="lastName">Last Name *</label>
                            <div class="input-wrapper">
                                <input type="text" id="lastName" name="lastName" placeholder="Doe" required>
                            </div>
                            <small class="error-text"></small>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="email">Email Address *</label>
                        <div class="input-wrapper">
                            <input type="email" id="email" name="email" placeholder="your@email.com" required>
                        </div>
                        <small class="error-text"></small>
                    </div>

                    <div class="form-group">
                        <label for="school">School <span id="schoolRequired" style="color: #ef4444;">*</span></label>
                        <div class="input-wrapper">
                            <select id="school" name="school" required>
                                <option value="">Loading schools...</option>
                            </select>
                        </div>
                        <small class="error-text"></small>
                    </div>

                    <!-- Fixed to student — teacher accounts register at
                         staff-register.php, and counselor/coordinator
                         accounts are SDO-only via School Management. -->
                    <input type="hidden" id="role" name="role" value="student">

                    <div class="form-row">
                        <div class="form-group">
                            <label for="password">Password * 
                                <button type="button" class="password-help-btn" id="passwordHelpBtn">
                                    <i class="bi bi-question-circle"></i>
                                </button>
                            </label>
                            <div class="input-wrapper password-wrapper">
                                <input type="password" id="password" name="password" placeholder="••••••••" required>
                                <button type="button" class="toggle-password" id="togglePassword">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </div>
                            <small class="error-text"></small>
                        </div>

                        <div class="form-group">
                            <label for="confirmPassword">Confirm Password *</label>
                            <div class="input-wrapper password-wrapper">
                                <input type="password" id="confirmPassword" name="confirmPassword" placeholder="••••••••" required>
                                <button type="button" class="toggle-password" id="toggleConfirmPassword">
                                    <i class="bi bi-eye"></i>
                                </button>

                            </div>
                            <small class="error-text"></small>
                        </div>
                    </div>

                    <div id="registerError" class="error-alert"></div>
                    <div id="registerSuccess" class="success-alert"></div>

                    <button type="submit" class="btn btn-auth-primary btn-block">
                        <span>Create Account</span>
                        <i class="bi bi-arrow-right"></i>
                    </button>
                </form>

                <!-- Password Requirements Modal -->
                <div id="passwordModal" class="password-modal-overlay">
                    <div class="password-modal-content">
                        <div class="modal-header">
                            <h3>Password Requirements</h3>
                            <button type="button" class="modal-close" id="closePasswordModal">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div id="passwordRequirements" class="password-requirements-list">
                                <div class="requirement-item">
                                    <i class="bi bi-check-circle requirement-icon"></i>
                                    <span>At least 8 characters</span>
                                </div>
                                <div class="requirement-item">
                                    <i class="bi bi-check-circle requirement-icon"></i>
                                    <span>One uppercase letter (A-Z)</span>
                                </div>
                                <div class="requirement-item">
                                    <i class="bi bi-check-circle requirement-icon"></i>
                                    <span>One lowercase letter (a-z)</span>
                                </div>
                                <div class="requirement-item">
                                    <i class="bi bi-check-circle requirement-icon"></i>
                                    <span>One number (0-9)</span>
                                </div>
                                <div class="requirement-item">
                                    <i class="bi bi-check-circle requirement-icon"></i>
                                    <span>One special character (!@#$%^&*)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="auth-divider">
                    <span>Already have an account?</span>
                    <a href="{{ url('login') }}" class="auth-link">Sign In Here <i class="bi bi-arrow-right"></i></a>
                </div>

                <p class="text-muted" style="text-align:center; margin-top: 16px; font-size: 13px;">
                    Teacher? <a href="{{ url('staff-register') }}" class="auth-link">Go to Teacher Registration</a>
                </p>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/otp-verify.js') }}"></script>
    <script src="{{ asset('js/register.js') }}"></script>
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
