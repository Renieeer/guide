<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Dashboard - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-student')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-speedometer2"></i> Overview</div>
                    <h2 class="page-hero-title">My Home</h2>
                    <p class="page-hero-text">View your guidance information, appointments, and messages from your counselor.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Dashboard Grid -->
                <div class="dashboard-grid">
                    <!-- Referral Status Card -->
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0;"><i class="bi bi-clipboard-data"></i> Referral Status</h3>
                            <span class="badge" id="referralCount" style="background: #3b82f6; padding: 6px 12px; border-radius: 20px; color: white; font-size: 0.85em;">0</span>
                        </div>
                        <p style="color: #64748b; margin-bottom: 12px;">View your referral progress</p>
                        <div id="referralProgressPreview" style="margin-bottom: 12px; font-size: 0.9em;">
                            <!-- Quick progress preview will appear here -->
                        </div>
                        <a href="{{ url('student/referral-status') }}" id="viewReferralsLink" class="btn btn-primary" style="width: 100%;">View Referrals</a>
                    </div>

                    <!-- Appointments Card -->
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0;"><i class="bi bi-calendar3"></i> Appointments</h3>
                            <span class="badge" id="appointmentCount" style="background: #8b5cf6; padding: 6px 12px; border-radius: 20px; color: white; font-size: 0.85em;">0</span>
                        </div>
                        <p style="color: #64748b; margin-bottom: 12px;">Check your scheduled appointments</p>
                        <a href="{{ url('student/schedule') }}" class="btn btn-primary" style="width: 100%;">View Schedule</a>
                    </div>

                    <!-- Feedback Card -->
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0;"><i class="bi bi-chat-dots"></i> Feedback</h3>
                        </div>
                        <p style="color: #64748b; margin-bottom: 12px;">Send feedback to counselor</p>
                        <a href="{{ url('student/feedback') }}" class="btn btn-primary" style="width: 100%;">Send Feedback</a>
                    </div>

                    <!-- History Card -->
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0;"><i class="bi bi-calendar-check"></i> History</h3>
                            <span class="badge" id="historyCount" style="background: #ec4899; padding: 6px 12px; border-radius: 20px; color: white; font-size: 0.85em;">0</span>
                        </div>
                        <p style="color: #64748b; margin-bottom: 12px;">View past appointments and sessions</p>
                        <a href="{{ url('student/appointment-history') }}" class="btn btn-primary" style="width: 100%;">View History</a>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="card mt-5">
                    <h2 class="card-title">Recent Activity</h2>
                    <div id="activityFeed" style="max-height: 400px; overflow-y: auto;">
                        <p style="text-align: center; color: #999; padding: 30px;">No recent activity</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/student/dashboard.js') }}"></script>
</body>
</html>
