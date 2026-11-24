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
    <!-- Charts are for the screen only; downloads are text and tables. -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>
    <script src="{{ asset('pages/sdo/sdo-report-assets.js') }}?v={{ filemtime(public_path('pages/sdo/sdo-report-assets.js')) }}"></script>
    <script src="{{ asset('pages/sdo/sdo-report-letterhead.js') }}?v={{ filemtime(public_path('pages/sdo/sdo-report-letterhead.js')) }}"></script>
    <link rel="stylesheet" href="{{ asset('pages/sdo/dashboard.css') }}?v={{ filemtime(public_path('pages/sdo/dashboard.css')) }}">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        @include('partials.sidebar-sdo')
        <div class="main-content">
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-speedometer2"></i> Overview</div>
                    <h2 class="page-hero-title">SDO Dashboard</h2>
                    <p class="page-hero-text">Division-wide guidance activity across every school. Filter by school level, school and period. Every figure below and every download follows the same filters.</p>
                </div>
                <div class="page-hero-actions">
                    <span class="pill pill-soft"><i class="bi bi-broadcast"></i>&nbsp; Live data</span>
                </div>
            </div>

            <div class="page-content">
                <!-- Filters: drive every tile, chart, table and download. -->
                <section class="card sdb-filters" aria-labelledby="sdbFiltersTitle">
                    <div class="sdb-filters-head">
                        <h3 id="sdbFiltersTitle" class="sdb-filters-title"><i class="bi bi-sliders"></i> Filters</h3>
                        <div class="sdb-filters-meta">
                            <span class="sdb-updated" aria-live="polite"><span id="sdbStatus">Loading&hellip;</span></span>
                            <button type="button" class="btn btn-sm btn-outline" id="sdbRefreshBtn"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
                        </div>
                    </div>

                    <div class="sdb-filters-grid">
                        <div class="sdb-field">
                            <span class="sdb-field-label" id="sdbLevelLabel">School level</span>
                            <div class="sdb-segmented" role="group" aria-labelledby="sdbLevelLabel" id="sdbLevel">
                                <button type="button" data-level="all" aria-pressed="true">All</button>
                                <button type="button" data-level="elementary" aria-pressed="false">Elementary</button>
                                <button type="button" data-level="secondary" aria-pressed="false">Secondary</button>
                            </div>
                        </div>
                        <div class="sdb-field">
                            <label for="sdbSchool">School</label>
                            <select id="sdbSchool">
                                <option value="">All schools</option>
                            </select>
                        </div>
                        <div class="sdb-field">
                            <label for="sdbPeriod">Period</label>
                            <select id="sdbPeriod">
                                <option value="all">All time</option>
                                <option value="month">Month</option>
                                <option value="quarter">Quarter</option>
                                <option value="year">Year</option>
                                <option value="custom">Custom range</option>
                            </select>
                        </div>
                        <!-- Shown only for the period type that needs it. -->
                        <div class="sdb-field" data-period-field="month" hidden>
                            <label for="sdbMonth">Month</label>
                            <input type="month" id="sdbMonth">
                        </div>
                        <div class="sdb-field" data-period-field="quarter" hidden>
                            <label for="sdbQuarter">Quarter</label>
                            <select id="sdbQuarter">
                                <option value="1">Q1 (Jan&ndash;Mar)</option>
                                <option value="2">Q2 (Apr&ndash;Jun)</option>
                                <option value="3">Q3 (Jul&ndash;Sep)</option>
                                <option value="4">Q4 (Oct&ndash;Dec)</option>
                            </select>
                        </div>
                        <div class="sdb-field" data-period-field="quarter year" hidden>
                            <label for="sdbYear">Year</label>
                            <select id="sdbYear"></select>
                        </div>
                        <div class="sdb-field" data-period-field="custom" hidden>
                            <label for="sdbFrom">From</label>
                            <input type="date" id="sdbFrom">
                        </div>
                        <div class="sdb-field" data-period-field="custom" hidden>
                            <label for="sdbTo">To</label>
                            <input type="date" id="sdbTo">
                        </div>
                    </div>

                    <div class="sdb-filters-foot">
                        <p class="sdb-scope" id="sdbScope">&nbsp;</p>
                        <div class="sdb-actions">
                            <button type="button" class="btn btn-secondary btn-sm" id="sdbResetBtn"><i class="bi bi-x-circle"></i> Reset filters</button>
                            <button type="button" class="btn btn-danger btn-sm" id="sdbPdfBtn"><i class="bi bi-file-earmark-pdf"></i> Download PDF</button>
                            <button type="button" class="btn btn-success btn-sm" id="sdbExcelBtn"><i class="bi bi-file-earmark-excel"></i> Download Excel</button>
                        </div>
                    </div>
                </section>

                <!-- Key figures -->
                <div class="sdb-kpis" id="sdbKpis" aria-live="polite"></div>

                <!-- Charts (screen only) -->
                <div class="sdb-grid-2">
                    <section class="card sdb-card" aria-labelledby="sdbStatusTitle">
                        <div class="card-header">
                            <h3 class="card-title" id="sdbStatusTitle">Referral status</h3>
                            <span class="sdb-eyebrow">by workflow stage</span>
                        </div>
                        <div class="sdb-chart sdb-chart-donut">
                            <canvas id="sdbStatusChart" role="img" aria-label="Referral status breakdown"></canvas>
                            <div class="sdb-donut-center" id="sdbStatusCenter" hidden>
                                <strong id="sdbStatusTotal">0</strong>
                                <span id="sdbStatusTotalLabel">referrals</span>
                            </div>
                        </div>
                        <div class="sdb-legend" id="sdbStatusLegend"></div>
                        <p class="sdb-empty" id="sdbStatusEmpty" hidden>No referrals for this selection.</p>
                    </section>

                    <section class="card sdb-card" aria-labelledby="sdbTrendTitle">
                        <div class="card-header">
                            <h3 class="card-title" id="sdbTrendTitle">Monthly referrals</h3>
                            <span class="sdb-eyebrow" id="sdbTrendEyebrow">&nbsp;</span>
                        </div>
                        <div class="sdb-chart"><canvas id="sdbTrendChart" role="img" aria-label="Referrals and resolved referrals per month"></canvas></div>
                        <div class="sdb-legend">
                            <span class="sdb-legend-item"><span class="sdb-dot" style="background: var(--sdb-blue);"></span> Referrals</span>
                            <span class="sdb-legend-item"><span class="sdb-dot" style="background: var(--sdb-good);"></span> Resolved</span>
                        </div>
                        <p class="sdb-empty" id="sdbTrendEmpty" hidden>No referrals in this year for this selection.</p>
                    </section>
                </div>

                <div class="sdb-grid-2">
                    <section class="card sdb-card" aria-labelledby="sdbCaseloadTitle">
                        <div class="card-header">
                            <h3 class="card-title" id="sdbCaseloadTitle">Caseload vs. coverage</h3>
                            <span class="sdb-eyebrow">top schools by counseling cases</span>
                        </div>
                        <div class="sdb-chart sdb-chart-tall"><canvas id="sdbCaseloadChart" role="img" aria-label="Counseling cases per school, colored by caseload per guidance staff"></canvas></div>
                        <div class="sdb-legend">
                            <span class="sdb-legend-item"><span class="sdb-dot" style="background: var(--sdb-good);"></span> Healthy (&le;5 per staff)</span>
                            <span class="sdb-legend-item"><span class="sdb-dot" style="background: var(--sdb-warn);"></span> Elevated (6&ndash;10)</span>
                            <span class="sdb-legend-item"><span class="sdb-dot" style="background: var(--sdb-critical);"></span> Critical gap</span>
                        </div>
                        <p class="sdb-empty" id="sdbCaseloadEmpty" hidden>No counseling cases for this selection.</p>
                    </section>

                    <section class="card sdb-card" aria-labelledby="sdbSardoTitle">
                        <div class="card-header">
                            <h3 class="card-title" id="sdbSardoTitle">SARDO / at-risk learners</h3>
                            <span class="sdb-eyebrow">by grade level</span>
                        </div>
                        <div class="sdb-chart sdb-chart-tall"><canvas id="sdbSardoChart" role="img" aria-label="SARDO-flagged learners per grade"></canvas></div>
                        <p class="sdb-empty" id="sdbSardoEmpty" hidden>No SARDO-flagged learners for this selection.</p>
                    </section>
                </div>

                <section class="card sdb-card" aria-labelledby="sdbCaseTypesTitle">
                    <div class="card-header">
                        <h3 class="card-title" id="sdbCaseTypesTitle">Case types by section</h3>
                        <span class="sdb-eyebrow" id="sdbCaseTypesEyebrow">elementary vs. secondary</span>
                    </div>
                    <div class="sdb-chart"><canvas id="sdbCaseTypesChart" role="img" aria-label="Counseling cases per case section"></canvas></div>
                    <div class="sdb-legend" id="sdbCaseTypesLegend">
                        <span class="sdb-legend-item"><span class="sdb-dot" style="background: var(--sdb-blue);"></span> Elementary</span>
                        <span class="sdb-legend-item"><span class="sdb-dot" style="background: var(--sdb-aqua);"></span> Secondary</span>
                    </div>
                    <p class="sdb-empty" id="sdbCaseTypesEmpty" hidden>No categorized cases for this selection.</p>
                </section>

                <!-- Detail tables (also in the downloads) -->
                <section class="card sdb-card" aria-labelledby="sdbSchoolTitle">
                    <div class="card-header sdb-card-header-tools">
                        <h3 class="card-title" id="sdbSchoolTitle">School breakdown</h3>
                        <div class="sdb-table-tools">
                            <label class="sdb-inline-field">
                                <span>Search</span>
                                <input type="search" id="sdbSchoolSearch" placeholder="School name..." autocomplete="off">
                            </label>
                            <label class="sdb-inline-field">
                                <span>Show</span>
                                <select id="sdbSchoolPageSize">
                                    <option value="10">10</option>
                                    <option value="25" selected>25</option>
                                    <option value="all">All</option>
                                </select>
                            </label>
                        </div>
                    </div>
                    <div class="table-container sdb-table-wrap">
                        <table class="sdb-table">
                            <thead>
                                <tr>
                                    <th scope="col">School</th>
                                    <th scope="col">Level</th>
                                    <th scope="col" class="num">Guidance staff</th>
                                    <th scope="col" class="num">Referrals</th>
                                    <th scope="col" class="num">Resolved</th>
                                    <th scope="col" class="num">Counseling cases (M/F)</th>
                                    <th scope="col" class="num">Cases per staff</th>
                                    <th scope="col">Caseload</th>
                                </tr>
                            </thead>
                            <tbody id="sdbSchoolBody"></tbody>
                        </table>
                    </div>
                    <p class="sdb-table-foot" id="sdbSchoolFoot"></p>
                </section>

                <div class="sdb-grid-2">
                    <section class="card sdb-card" aria-labelledby="sdbMonthlyTitle">
                        <div class="card-header">
                            <h3 class="card-title" id="sdbMonthlyTitle">Monthly summary</h3>
                            <span class="sdb-eyebrow" id="sdbMonthlyEyebrow">&nbsp;</span>
                        </div>
                        <div class="table-container sdb-table-wrap">
                            <table class="sdb-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Month</th>
                                        <th scope="col" class="num">Referrals</th>
                                        <th scope="col" class="num">Students</th>
                                        <th scope="col" class="num">Resolved</th>
                                        <th scope="col" class="num">Resolution rate</th>
                                    </tr>
                                </thead>
                                <tbody id="sdbMonthlyBody"></tbody>
                            </table>
                        </div>
                    </section>

                    <section class="card sdb-card" aria-labelledby="sdbCategoryTitle">
                        <div class="card-header">
                            <h3 class="card-title" id="sdbCategoryTitle">Top case categories</h3>
                            <span class="sdb-eyebrow">learners in counseling cases</span>
                        </div>
                        <div class="table-container sdb-table-wrap">
                            <table class="sdb-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Category</th>
                                        <th scope="col" class="num">Male</th>
                                        <th scope="col" class="num">Female</th>
                                        <th scope="col" class="num">Total</th>
                                    </tr>
                                </thead>
                                <tbody id="sdbCategoryBody"></tbody>
                            </table>
                        </div>
                        <p class="sdb-table-foot" id="sdbCategoryFoot"></p>
                    </section>
                </div>

                <p class="sdb-footnote">
                    Referrals are counted by the date they were submitted. Pending = Stages 1&ndash;2, In progress = Stages 3&ndash;6, Resolved = reached Case Closing (Stage 7). Counseling cases count each primary learner once per case, by case date. Guidance staff are the active coordinator, counselor and counselor-and-coordinator accounts of each school.
                </p>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/sdo/dashboard.js') }}?v={{ filemtime(public_path('pages/sdo/dashboard.js')) }}"></script>
</body>
</html>
