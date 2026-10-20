<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guidance Management System</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/1.11.0/font/bootstrap-icons.min.css">
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
</head>
<body class="landing-page">

    <!-- NAVBAR -->
    <nav id="navbar">
        <a class="nav-brand" href="{{ url('/') }}">
            <span class="nav-dot"></span> EGuide
        </a>
        <button class="nav-toggle" id="navToggle" aria-label="Menu">
            <i class="bi bi-list"></i>
        </button>
        <ul class="nav-links" id="navLinks">
            <li><a href="#features">Features</a></li>
            <li><a href="#roles">Roles</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="{{ url('staff-login') }}">Staff Login</a></li>
            <li><a href="{{ url('login') }}">Log In</a></li>
            <li><a href="{{ url('register') }}" class="btn-nav">Register</a></li>
        </ul>
    </nav>

    <!-- HERO -->
    <section class="hero">
        <div class="hero-watermark">GMS</div>
        <div class="hero-inner">
            <div class="hero-badge">
                <i class="bi bi-circle-fill" style="font-size:7px;"></i>
                <span>Academic Guidance &nbsp;·&nbsp; School Management System</span>
            </div>
            <h1 class="hero-title">
                Shaping <em>futures</em><br>through guidance
            </h1>
            <p class="hero-subtitle">
                A unified platform connecting students, teachers, and coordinators — streamlining every aspect of school counseling and academic support.
            </p>
            <div class="hero-cta">
                <a href="{{ url('login') }}" class="btn-white">
                    <i class="bi bi-box-arrow-in-right"></i> Sign In
                </a>
                <a href="{{ url('register') }}" class="btn-ghost">
                    <i class="bi bi-person-plus"></i> Create Account
                </a>
            </div>
        </div>
        <div class="scroll-hint">
            <div class="scroll-line"></div>
            Scroll
        </div>
    </section>

    <!-- STATS -->
    <div class="stats-bar reveal">
        <div class="stat-item">
            <div class="stat-num">4</div>
            <div class="stat-label">User Roles</div>
        </div>
        <div class="stat-item">
            <div class="stat-num">6</div>
            <div class="stat-label">Core Modules</div>
        </div>
        <div class="stat-item">
            <div class="stat-num">100%</div>
            <div class="stat-label">Secure Access</div>
        </div>
        <div class="stat-item">
            <div class="stat-num">24/7</div>
            <div class="stat-label">Availability</div>
        </div>
    </div>

    <!-- FEATURES -->
    <section id="features" class="section-features">
        <div class="s-header reveal">
            <div>
                <p class="s-eyebrow">What we offer</p>
                <h2 class="s-title">Built for every<br>stakeholder</h2>
            </div>
            <p class="s-desc">Six purpose-built modules that cover the full lifecycle of student guidance and counseling.</p>
        </div>
        <div class="features-grid">
            <div class="f-item reveal">
                <div class="f-num">01</div>
                <div class="f-icon"><i class="bi bi-calendar-check"></i></div>
                <div class="f-name">Appointment Management</div>
                <div class="f-desc">Schedule and manage counseling sessions with real-time availability and automated reminders.</div>
            </div>
            <div class="f-item reveal" style="transition-delay:.1s">
                <div class="f-num">02</div>
                <div class="f-icon"><i class="bi bi-graph-up"></i></div>
                <div class="f-name">Progress Tracking</div>
                <div class="f-desc">Monitor student achievements, milestones, and development over time with visual dashboards.</div>
            </div>
            <div class="f-item reveal" style="transition-delay:.2s">
                <div class="f-num">03</div>
                <div class="f-icon"><i class="bi bi-file-earmark-text"></i></div>
                <div class="f-name">Case Management</div>
                <div class="f-desc">Organize, categorize, and track student cases from referral through resolution efficiently.</div>
            </div>
            <div class="f-item reveal" style="transition-delay:.05s">
                <div class="f-num">04</div>
                <div class="f-icon"><i class="bi bi-chat-dots"></i></div>
                <div class="f-name">Communication Hub</div>
                <div class="f-desc">Seamless, secure interaction between students, parents, teachers, and coordinators.</div>
            </div>
            <div class="f-item reveal" style="transition-delay:.15s">
                <div class="f-num">05</div>
                <div class="f-icon"><i class="bi bi-shield-lock"></i></div>
                <div class="f-name">Secure Access</div>
                <div class="f-desc">Role-based permissions ensure every user sees only what they're authorized to access.</div>
            </div>
            <div class="f-item reveal" style="transition-delay:.25s">
                <div class="f-num">06</div>
                <div class="f-icon"><i class="bi bi-bar-chart"></i></div>
                <div class="f-name">Analytics & Reports</div>
                <div class="f-desc">Generate comprehensive statistical insights to inform decisions and improve outcomes.</div>
            </div>
        </div>
    </section>

    <!-- ROLES -->
    <section id="roles" class="section-roles">
        <div class="reveal">
            <p class="s-eyebrow">Who it's for</p>
            <h2 class="s-title">Four distinct<br>user roles</h2>
        </div>
        <div class="roles-grid">
            <div class="r-card reveal">
                <div class="r-watermark">01</div>
                <div class="r-icon"><i class="bi bi-person-gear"></i></div>
                <div class="r-name">SDO</div>
                <div class="r-desc">School Development Officer with full system administration privileges and oversight.</div>
            </div>
            <div class="r-card reveal" style="transition-delay:.1s">
                <div class="r-watermark">02</div>
                <div class="r-icon"><i class="bi bi-book"></i></div>
                <div class="r-name">Student</div>
                <div class="r-desc">Access personal guidance records, schedule sessions, and track academic progress.</div>
            </div>
            <div class="r-card reveal" style="transition-delay:.2s">
                <div class="r-watermark">03</div>
                <div class="r-icon"><i class="bi bi-mortarboard"></i></div>
                <div class="r-name">Teacher</div>
                <div class="r-desc">Monitor student development, submit referrals, and communicate with coordinators.</div>
            </div>
            <div class="r-card reveal" style="transition-delay:.3s">
                <div class="r-watermark">04</div>
                <div class="r-icon"><i class="bi bi-people"></i></div>
                <div class="r-name">Guidance Office Handler</div>
                <div class="r-desc">Oversee all counseling services, manage cases, and generate institutional reports.</div>
            </div>
        </div>
    </section>

    <!-- ABOUT -->
    <section id="about" class="section-about">
        <div class="reveal">
            <span class="about-eyebrow">About the system</span>
            <h2 class="about-title">Designed for<br>schools that care</h2>
            <p class="about-body">The Guidance Management System bridges the gap between students in need and the support structures around them — creating a connected, transparent, and secure environment for academic and personal growth.</p>
            <ul class="about-list">
                <li>
                    <i class="bi bi-arrow-right"></i>
                    <span><strong>Efficient Management</strong> — Streamlined processes for every school stakeholder</span>
                </li>
                <li>
                    <i class="bi bi-arrow-right"></i>
                    <span><strong>Data Security</strong> — End-to-end protected student records and confidential information</span>
                </li>
                <li>
                    <i class="bi bi-arrow-right"></i>
                    <span><strong>Real-time Updates</strong> — Instant notifications keep everyone informed and aligned</span>
                </li>
                <li>
                    <i class="bi bi-arrow-right"></i>
                    <span><strong>User-Friendly</strong> — Intuitive interface designed for all digital skill levels</span>
                </li>
            </ul>
        </div>
        <div class="about-visual reveal" style="transition-delay:.2s">
            <div class="deco-tl"></div>
            <div class="about-card">
                <i class="bi bi-building"></i>
                <div class="about-card-label">Guidance Management System</div>
            </div>
            <div class="deco-br"></div>
        </div>
    </section>

    <!-- CTA BAND -->
    <div class="cta-band reveal">
        <div>
            <p class="cta-label">Get started today</p>
            <h2 class="cta-title">Ready to transform<br>your guidance program?</h2>
        </div>
        <div class="cta-btns">
            <a href="{{ url('register') }}" class="btn-dark">
                <i class="bi bi-person-plus"></i> Create Account
            </a>
            <a href="{{ url('login') }}" class="btn-outline-dark">
                <i class="bi bi-box-arrow-in-right"></i> Sign In
            </a>
        </div>
    </div>

    <!-- FOOTER -->
    <footer>
        <div class="footer-brand">EGuide</div>
        <div class="footer-copy">&copy; {{ date('Y') }} Guidance Management System. All rights reserved.</div>
        <ul class="footer-nav">
            <li><a href="#features">Features</a></li>
            <li><a href="#roles">Roles</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="{{ url('login') }}">Login</a></li>
        </ul>
    </footer>

    <script>
        // Scroll reveal
        const observer = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('visible');
                    observer.unobserve(e.target);
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

        // Mobile nav
        document.getElementById('navToggle').addEventListener('click', () => {
            document.getElementById('navLinks').classList.toggle('open');
        });

        // Navbar shrink on scroll
        const navbar = document.getElementById('navbar');
        window.addEventListener('scroll', () => {
            navbar.style.padding = window.scrollY > 50
                ? '13px 60px' : '20px 60px';
        });
    </script>
</body>
</html>
