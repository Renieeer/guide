<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Combined Dashboard - Guidance Management System (Other School)</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-other-school')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-speedometer2"></i> Overview
                        <span id="gradeScopeBadge" style="display:none; margin-left:8px; padding:2px 10px; border-radius:999px; background:rgba(79,70,229,0.12); color:#4338ca; font-weight:800; letter-spacing:0.3px; text-transform:none;"></span>
                    </div>
                    <h2 class="page-hero-title">Dashboard</h2>
                    <p class="page-hero-text">Monitor guidance activities and coordination with your school's counselor and district office.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Quick Stats Grid -->
                <div class="dashboard-grid">
                    <!-- Total Referrals (Coordinator feature) -->
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Total Referrals</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-box-arrow-up"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="totalReferrals">0</div>
                            <p>All referrals in system</p>
                        </div>
                        <div class="card-footer">
                            <a href="{{ url('other-school/referrals') }}" class="btn btn-primary btn-sm">View All</a>
                        </div>
                    </div>

                    <!-- Pending Review (Coordinator feature) -->
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Pending Review</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-hourglass-split"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="pendingReferrals">0</div>
                            <p>Awaiting review</p>
                        </div>
                        <div class="card-footer">
                            <a href="{{ url('other-school/referrals') }}" class="btn btn-warning btn-sm">Review</a>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Active Cases</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-arrow-repeat"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="activeCases">0</div>
                            <p>Currently under counseling</p>
                        </div>
                        <div class="card-footer">
                            <a href="{{ url('other-school/referrals') }}" class="btn btn-primary btn-sm">Manage</a>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">This Week</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-calendar3"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="weekSessions">0</div>
                            <p>Sessions scheduled</p>
                        </div>
                        <div class="card-footer">
                            <a href="{{ url('other-school/schedule') }}" class="btn btn-primary btn-sm">View Schedule</a>
                        </div>
                    </div>

                </div>

                <!-- Secondary Stats Grid -->
                <div class="dashboard-grid dashboard-grid-3">
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Total Students</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-people"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="totalStudents">0</div>
                            <p>in your caseload</p>
                        </div>
                        <div class="card-footer">
                            <a href="{{ url('other-school/student-history') }}" class="btn btn-primary btn-sm">Records</a>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Follow-ups</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-file-earmark-text"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="followUps">0</div>
                            <p>Pending follow-ups</p>
                        </div>
                    </div>

                    <!-- Closed Cases (Coordinator feature) -->
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Closed Cases</h3>
                            </div>
                            <div class="card-icon">✅</div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="closedCases">0</div>
                            <p>Completed cases</p>
                        </div>
                    </div>
                </div>

                <!-- Recent Referrals -->
                <div class="content-section">
                    <h2>Recent Referrals</h2>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Student Name</th>
                                <th>Reason</th>
                                <th>Submitted By</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="recentReferralsBody">
                            <tr>
                                <td colspan="6" style="text-align: center; padding: 30px; color: #999;">Loading...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('pages/other-school/other-school.js') }}"></script>
    <script>
        document.addEventListener('DOMContentLoaded', loadCombinedDashboard);
        renderGradeScopeBadge('gradeScopeBadge');
    </script>
</body>
</html>
