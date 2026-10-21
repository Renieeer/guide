<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>District Analytics - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
    <link rel="stylesheet" href="{{ asset('pages/sdo/district-analytics.css') }}?v={{ filemtime(public_path('pages/sdo/district-analytics.css')) }}">
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
                    <div class="page-hero-eyebrow"><i class="bi bi-graph-up"></i> Insights</div>
                    <h2 class="page-hero-title">District Guidance Analytics</h2>
                    <p class="page-hero-text" id="daSubtitle">Division of Oriental Mindoro &middot; Elementary &amp; Secondary</p>
                </div>
                <div class="page-hero-actions">
                    <span class="pill pill-soft"><i class="bi bi-broadcast"></i>&nbsp; Live data</span>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">

                <!-- Filter bar -->
                <div class="recent-drafts-toolbar da-filterbar">
                    <div class="toolbar-label"><i class="bi bi-sliders"></i> Filters</div>
                    <div class="filter-group">
                        <label>View</label>
                        <div class="da-tabs" id="daLevelTabs">
                            <button type="button" class="btn btn-sm btn-primary da-tab is-active" data-level="all">All</button>
                            <button type="button" class="btn btn-sm btn-outline da-tab" data-level="elementary">Elementary</button>
                            <button type="button" class="btn btn-sm btn-outline da-tab" data-level="secondary">Secondary</button>
                        </div>
                    </div>
                    <div class="filter-group">
                        <label for="daSchoolSelect">School</label>
                        <select id="daSchoolSelect">
                            <option value="">All schools</option>
                        </select>
                    </div>
                    <div class="da-filterbar-right">
                        <button type="button" class="btn btn-sm btn-outline" id="daRefreshBtn"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
                        <span class="da-updated">Updated <span id="daUpdatedAt">&mdash;</span></span>
                    </div>
                </div>

                <!-- Stat tiles -->
                <div class="dashboard-grid da-stats-grid">
                    <div class="card da-stat-card">
                        <div class="card-content">
                            <p class="da-stat-label">Active cases</p>
                            <div class="card-stats" id="daStatActiveCases">&mdash;</div>
                            <p class="da-stat-sub" id="daStatActiveCasesSub">&nbsp;</p>
                        </div>
                    </div>
                    <div class="card da-stat-card">
                        <div class="card-content">
                            <p class="da-stat-label">Guidance personnel</p>
                            <div class="card-stats" id="daStatPersonnel">&mdash;</div>
                            <p class="da-stat-sub" id="daStatPersonnelSub">&nbsp;</p>
                        </div>
                    </div>
                    <div class="card da-stat-card">
                        <div class="card-content">
                            <p class="da-stat-label">SARDO flagged</p>
                            <div class="card-stats" id="daStatSardo">&mdash;</div>
                            <p class="da-stat-sub">at risk of dropping out</p>
                        </div>
                    </div>
                    <div class="card da-stat-card">
                        <div class="card-content">
                            <p class="da-stat-label">Referral resolution</p>
                            <div class="card-stats" id="daStatResolution">&mdash;</div>
                            <p class="da-stat-sub">resolved this cycle</p>
                        </div>
                    </div>
                </div>

                <!-- Row: caseload + resolution donut -->
                <div class="da-row-2">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Caseload vs. coverage</h3>
                            <span class="da-card-eyebrow">cases per personnel</span>
                        </div>
                        <div class="da-chart-wrap da-chart-wrap-tall"><canvas id="daCaseloadChart"></canvas></div>
                        <div class="da-legend" id="daCaseloadLegend">
                            <span class="da-legend-item"><span class="da-dot da-dot-good"></span> Healthy</span>
                            <span class="da-legend-item"><span class="da-dot da-dot-warning"></span> Elevated</span>
                            <span class="da-legend-item"><span class="da-dot da-dot-critical"></span> Critical gap</span>
                        </div>
                        <p class="da-empty" id="daCaseloadEmpty" hidden>No cases logged for this selection yet.</p>
                    </div>
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Referral resolution</h3>
                            <span class="da-card-eyebrow">current cycle</span>
                        </div>
                        <div class="da-chart-wrap"><canvas id="daResolutionChart"></canvas></div>
                        <div class="da-legend" id="daResolutionLegend">
                            <span class="da-legend-item"><span class="da-dot da-dot-good"></span> Resolved</span>
                            <span class="da-legend-item"><span class="da-dot da-dot-blue"></span> In progress</span>
                            <span class="da-legend-item"><span class="da-dot da-dot-warning"></span> Pending</span>
                        </div>
                        <p class="da-empty" id="daResolutionEmpty" hidden>No referrals logged for this selection yet.</p>
                    </div>
                </div>

                <!-- Case types -->
                <div class="card da-card-block">
                    <div class="card-header">
                        <h3 class="card-title">Case types</h3>
                        <span class="da-card-eyebrow" id="daCaseTypesEyebrow">elementary vs. secondary</span>
                    </div>
                    <div class="da-chart-wrap"><canvas id="daCaseTypesChart"></canvas></div>
                    <div class="da-legend" id="daCaseTypesLegend">
                        <span class="da-legend-item"><span class="da-dot da-dot-blue"></span> Elementary</span>
                        <span class="da-legend-item"><span class="da-dot da-dot-aqua"></span> Secondary</span>
                    </div>
                    <p class="da-empty" id="daCaseTypesEmpty" hidden>No categorized cases for this selection yet.</p>
                </div>

                <!-- SARDO by grade -->
                <div class="card da-card-block">
                    <div class="card-header">
                        <h3 class="card-title">SARDO / at-risk learners by grade</h3>
                        <span class="da-card-eyebrow">by grade level</span>
                    </div>
                    <div class="da-chart-wrap"><canvas id="daSardoGradeChart"></canvas></div>
                    <p class="da-empty" id="daSardoGradeEmpty" hidden>No SARDO-flagged cases for this selection yet.</p>
                </div>

                <p class="da-footnote">Figures reflect live Division records from cases, referrals, and school staffing. Filters and refresh recompute every panel from the same data the rest of the system uses.</p>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/sdo/analytics.js') }}?v={{ filemtime(public_path('pages/sdo/analytics.js')) }}"></script>
</body>
</html>
