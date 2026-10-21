<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SDO Dashboard - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-sdo')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-speedometer2"></i> Overview</div>
                    <h2 class="page-hero-title">SDO Dashboard</h2>
                    <p class="page-hero-text">Monitor district-wide guidance activities, school performance, and coordination with all schools.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- District Selection -->
                <div class="card mb-5">
                    <label class="fw-500 mb-2">View District Analytics:</label>
                    <select id="districtFilter" class="form-control" style="max-width: 300px;">
                        <option value="">All Districts</option>
                    </select>
                </div>

                <!-- Overview Stats -->
                <div class="dashboard-grid">
                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Total Referrals</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-box-arrow-up"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="totalReferrals">0</div>
                            <p>Across all districts</p>
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
                            <p>Currently in progress</p>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Resolution Rate</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-check-circle"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="resolutionRate">0%</div>
                            <p>Cases closed/resolved</p>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">Schools Reporting</h3>
                            </div>
                            <div class="card-icon"><i class="bi bi-buildings"></i></div>
                        </div>
                        <div class="card-content">
                            <div class="card-stats" id="schoolsReporting">0</div>
                            <p>Active in system</p>
                        </div>
                    </div>
                </div>

                <!-- District Performance Table -->
                <div class="table-container mt-5">
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom: 16px;">
                        <h2 class="mb-0">District Performance Summary</h2>
                        <select id="districtPageSizeFilter" class="form-control" style="max-width: 140px;" title="Rows per page">
                            <option value="10">Show 10</option>
                            <option value="20" selected>Show 20</option>
                            <option value="30">Show 30</option>
                            <option value="all">Show All</option>
                        </select>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>District</th>
                                <th>Schools</th>
                                <th>Referrals</th>
                                <th>Resolved</th>
                                <th>Resolution Rate</th>
                                <th>Last Activity</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="districtTableBody">
                            <tr>
                                <td colspan="7" class="text-center p-5 text-muted">Loading district data...</td>
                            </tr>
                        </tbody>
                    </table>
                    <div id="districtPagination" class="accounts-pagination"></div>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/sdo/sdo.js') }}?v={{ filemtime(public_path('pages/sdo/sdo.js')) }}"></script>
</body>
</html>
