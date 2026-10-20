<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Coordinator Dashboard - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-coordinator')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-speedometer2"></i> Overview
                        <span id="gradeScopeBadge" style="display:none; margin-left:8px; padding:2px 10px; border-radius:999px; background:rgba(79,70,229,0.12); color:#4338ca; font-weight:800; letter-spacing:0.3px; text-transform:none;"></span>
                    </div>
                    <h2 class="page-hero-title">Coordinator Dashboard</h2>
                    <p class="page-hero-text">Track referrals, manage schedules, and oversee guidance activities across your school.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Dashboard Grid -->
                <div class="dashboard-grid">
                    <!-- Total Referrals -->
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
                            <a href="{{ url('coordinator/referrals') }}" class="btn btn-primary btn-sm">View All</a>
                        </div>
                    </div>

                    <!-- Pending Review -->
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
                            <a href="{{ url('coordinator/referrals') }}?status=pending" class="btn btn-warning btn-sm">Review</a>
                        </div>
                    </div>

                    <!-- Active Cases -->
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Active Cases</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-arrow-repeat"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="activeCases">0</div>
                            <p>Currently in progress</p>
                        </div>
                        <div class="card-footer">
                            <a href="{{ url('coordinator/referrals') }}?status=active" class="btn btn-primary btn-sm">Manage</a>
                        </div>
                    </div>

                    <!-- Closed Cases -->
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

                <!-- Recent Referrals & Activities -->
                <div class="table-container">
                    <h2 class="mb-4">Recent Referrals</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Referral ID</th>
                                <th>Student</th>
                                <th>Reason</th>
                                <th>Submitted By</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="recentReferralsBody">
                            <tr>
                                <td colspan="6" class="text-center p-5 text-muted">No referrals yet</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/coordinator/coordinator.js') }}"></script>
    <script>renderGradeScopeBadge('gradeScopeBadge');</script>
</body>
</html>
