<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Teacher Dashboard - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-teacher')<!-- Main Content -->
        <div class="main-content teacher-page">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-speedometer2"></i> Overview</div>
                    <h2 class="page-hero-title">Teacher Dashboard</h2>
                    <p class="page-hero-text">Submit referrals, track referral status, and manage student guidance communications.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <div class="alert alert-success" id="successMessage"></div>

                <!-- Dashboard Grid -->
                <div class="dashboard-grid">
                    <!-- Referral Stats -->
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Total Referrals</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-box-arrow-up"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="totalReferrals">0</div>
                            <p>Referrals submitted by you</p>
                        </div>
                        <div class="card-footer">
                            <a href="{{ url('teacher/referral-form') }}" class="btn btn-primary btn-sm">Submit New</a>
                        </div>
                    </div>

                    <!-- Approved Referrals -->
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Approved</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-check-circle"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="approvedReferrals">0</div>
                            <p>Approved and in progress</p>
                        </div>
                    </div>

                    <!-- Closed Cases -->
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Closed Cases</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-flag"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="closedReferrals">0</div>
                            <p>Completed cases</p>
                        </div>
                    </div>
                </div>

                <!-- Recent Referrals Table -->
                <div class="table-container">
                    <h2 class="mb-4">Your Recent Referrals</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Referral ID</th>
                                <th>Student Name</th>
                                <th>Grade</th>
                                <th>Date Submitted</th>
                                <th>Status</th>
                                <th>Stage</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="referralsTableBody">
                            <tr>
                                <td colspan="7" class="text-center p-5 text-muted">
                                    No referrals yet. <a href="{{ url('teacher/referral-form') }}">Submit one now</a>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/teacher/teacher.js') }}?v={{ filemtime(public_path('pages/teacher/teacher.js')) }}"></script>
</body>
</html>
