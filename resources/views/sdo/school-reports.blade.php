<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>School Reports - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
    <!-- ExcelJS (not the SheetJS/xlsx build this page used to load) — needed
         to write real cell styles and embed the SDO letterhead logos into
         the downloaded workbook; see sdo-report-letterhead.js. -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>
    <script src="{{ asset('pages/sdo/sdo-report-assets.js') }}?v={{ filemtime(public_path('pages/sdo/sdo-report-assets.js')) }}"></script>
    <script src="{{ asset('pages/sdo/sdo-report-letterhead.js') }}?v={{ filemtime(public_path('pages/sdo/sdo-report-letterhead.js')) }}"></script>
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
                    <div class="page-hero-eyebrow"><i class="bi bi-file-earmark-bar-graph"></i> Analytics</div>
                    <h2 class="page-hero-title">School Reports</h2>
                    <p class="page-hero-text">View comprehensive reports on school performance, guidance metrics, and student outcomes.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Filter Tools -->
                <div class="card mb-3">
                    <div class="filter-bar" style="display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 15px; align-items: end;">
                        <div>
                            <label class="d-block mb-1 fw-500">Select District</label>
                            <select id="districtSelect" class="form-control" onchange="loadSummaryReports()">
                                <option value="">All Districts</option>
                            </select>
                        </div>
                        <div>
                            <label class="d-block mb-1 fw-500">Report Period</label>
                            <select id="periodSelect" class="form-control" onchange="loadSummaryReports()">
                                <option value="current">Current Month</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="annual">Annual</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" onclick="generateReport()">Generate</button>
                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-danger" onclick="exportReport()"><i class="bi bi-file-earmark-pdf"></i> Export PDF</button>
                            <button class="btn btn-success" onclick="exportReportExcel()"><i class="bi bi-file-earmark-excel"></i> Export Excel</button>
                        </div>
                    </div>
                </div>

                <!-- Reports Table -->
                <div class="table-container">
                    <h2 class="mb-4">Available Reports</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Report Name</th>
                                <th>District</th>
                                <th>Period</th>
                                <th>Generated Date</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="reportsTableBody">
                            <tr>
                                <td colspan="6" class="text-center p-5 text-muted">
                                    <p>Generate a report to view results</p>
                                    <button class="btn btn-primary mt-2" onclick="generateReport()">Generate Report</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Sample Reports for Display -->
                <div class="mt-5">
                    <h2 class="mb-4">District Summary Reports</h2>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>District</th>
                                    <th>Schools</th>
                                    <th>Students Referred</th>
                                    <th>Cases Resolved</th>
                                    <th>Success Rate</th>
                                    <th>Last Updated</th>
                                </tr>
                            </thead>
                            <tbody id="sampleReportsBody">
                                <tr>
                                    <td colspan="6" class="text-center p-5 text-muted">Loading district reports...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/sdo/school-reports.js') }}?v={{ filemtime(public_path('pages/sdo/school-reports.js')) }}"></script>
</body>
</html>
