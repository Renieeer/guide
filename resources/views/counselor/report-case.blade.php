<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Report Cases - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-counselor')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-file-earmark-text"></i> Documentation</div>
                    <h2 class="page-hero-title">Report Cases</h2>
                    <p class="page-hero-text">Document and submit case reports on student referrals and counseling sessions.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Action Buttons -->
                <div class="card mb-5">
                    <div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: flex-end;">
                        <button class="btn btn-danger" id="exportPdfBtn"><i class="bi bi-file-earmark-pdf"></i> Export PDF</button>
                        <button class="btn btn-success" id="exportExcelBtn"><i class="bi bi-file-earmark-excel"></i> Export Excel</button>
                        <button class="btn btn-secondary" id="filterBtn" style="background: #e2e8f0; color: #0f172a;"><i class="bi bi-funnel"></i> Filter</button>
                    </div>
                </div>

                <!-- Filter Panel -->
                <div class="card mb-5" id="filterPanel" style="display: none;">
                    <div class="form-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px;">
                        <div class="form-group">
                            <label for="filterPeriod"><i class="bi bi-calendar3"></i> Period</label>
                            <select id="filterPeriod">
                                <option value="all">All time</option>
                                <option value="weekly">This week</option>
                                <option value="monthly">This month</option>
                                <option value="annually">This year</option>
                                <option value="custom">Custom range</option>
                            </select>
                        </div>
                        <div class="form-group" id="filterStartGroup" style="display: none;">
                            <label for="filterStart">From</label>
                            <input type="date" id="filterStart">
                        </div>
                        <div class="form-group" id="filterEndGroup" style="display: none;">
                            <label for="filterEnd">To</label>
                            <input type="date" id="filterEnd">
                        </div>
                        <div class="form-group">
                            <label for="filterCategory"><i class="bi bi-tag"></i> Case Category</label>
                            <select id="filterCategory">
                                <option value="">All categories</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="filterGrade"><i class="bi bi-mortarboard"></i> Grade</label>
                            <select id="filterGrade">
                                <option value="">All grades</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="filterStatus">Status</label>
                            <select id="filterStatus">
                                <option value="">All statuses</option>
                                <option value="pending">Pending</option>
                                <option value="in-progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="closed">Closed</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 8px;">
                        <button type="button" class="btn btn-primary" id="applyFiltersBtn"><i class="bi bi-search"></i> Search</button>
                        <button type="button" class="btn btn-secondary" id="clearFiltersBtn">Clear Filters</button>
                    </div>
                    <p style="margin: 12px 0 0; padding: 8px 12px; background: var(--ok-bg); border-left: 3px solid var(--ok); border-radius: 4px; font-size: 12.5px; color: #15633f;">
                        <i class="bi bi-info-circle"></i> After selecting a report type, you can export the results by clicking the Export PDF or Export Excel button.
                    </p>
                </div>

                <!-- Filtered Results — a Case Distribution Summary grouped
                     by Category + Grade (Male/Female/Total Cases counts),
                     computed from every logged case matching the current
                     filters, exportable to PDF/Excel the same way as the
                     Category of Cases pivot below. -->
                <div id="filterResultsView" style="display: none;">
                    <h3 id="filterResultsTitle" class="report-title" style="display: none;"></h3>
                    <p class="text-muted" id="filterResultsEmpty" style="display: none; background: white; border: 1px dashed var(--border-color); border-radius: 8px; padding: 30px; text-align: center;">No records found</p>
                    <div class="table-container" id="filterResultsTableContainer">
                        <table id="filterResultsTable">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Grade</th>
                                    <th>Male</th>
                                    <th>Female</th>
                                    <th>Total Cases</th>
                                </tr>
                            </thead>
                            <tbody id="filterResultsTableBody">
                                <!-- Data will be inserted here -->
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Report Cases Table -->
                <div class="table-container" id="reportTableView">
                    <table id="reportCasesTable">
                        <thead>
                            <tr>
                                <th>Category of Cases</th>
                                <th colspan="3" class="grade-col" data-grade="7" style="text-align: center;">Grade 7</th>
                                <th colspan="3" class="grade-col" data-grade="8" style="text-align: center;">Grade 8</th>
                                <th colspan="3" class="grade-col" data-grade="9" style="text-align: center;">Grade 9</th>
                                <th colspan="3" class="grade-col" data-grade="10" style="text-align: center;">Grade 10</th>
                                <th colspan="3" class="grade-col" data-grade="11" style="text-align: center;">Grade 11</th>
                                <th colspan="3" class="grade-col" data-grade="12" style="text-align: center;">Grade 12</th>
                            </tr>
                            <tr>
                                <th></th>
                                <th class="grade-col" data-grade="7">Male</th><th class="grade-col" data-grade="7">Female</th><th class="grade-col" data-grade="7">Total</th>
                                <th class="grade-col" data-grade="8">Male</th><th class="grade-col" data-grade="8">Female</th><th class="grade-col" data-grade="8">Total</th>
                                <th class="grade-col" data-grade="9">Male</th><th class="grade-col" data-grade="9">Female</th><th class="grade-col" data-grade="9">Total</th>
                                <th class="grade-col" data-grade="10">Male</th><th class="grade-col" data-grade="10">Female</th><th class="grade-col" data-grade="10">Total</th>
                                <th class="grade-col" data-grade="11">Male</th><th class="grade-col" data-grade="11">Female</th><th class="grade-col" data-grade="11">Total</th>
                                <th class="grade-col" data-grade="12">Male</th><th class="grade-col" data-grade="12">Female</th><th class="grade-col" data-grade="12">Total</th>
                            </tr>
                        </thead>
                        <tbody id="casesTableBody">
                            <!-- Data will be inserted here -->
                        </tbody>
                    </table>
                </div>

                <!-- Case Details Modal -->
                <div id="caseModal" class="modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>Case Details</h2>
                            <button class="modal-close" id="closeModal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="form-group">
                                <label>Case ID</label>
                                <input type="text" id="caseId" readonly>
                            </div>
                            <div class="form-group">
                                <label>Category</label>
                                <input type="text" id="caseCategory" readonly>
                            </div>
                            <div class="form-group">
                                <label>Grade Level</label>
                                <input type="text" id="caseGrade" readonly>
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <input type="text" id="caseStatus" readonly>
                            </div>
                            <div class="form-group">
                                <label>Reported Date</label>
                                <input type="text" id="caseDate" readonly>
                            </div>
                            <div class="form-group">
                                <label>Notes</label>
                                <textarea id="caseNotes" readonly rows="4"></textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-primary" id="closeCaseModal">Close</button>
                        </div>
                    </div>
                </div>

                <!-- New Case Modal -->
                <div id="newCaseModal" class="modal">
                    <div class="modal-content" style="max-width: 600px;">
                        <div class="modal-header">
                            <h2>Create New Case Report</h2>
                            <button class="modal-close" id="closeNewCaseModal">&times;</button>
                        </div>
                        <form id="caseReportForm">
                            <div class="modal-body">
                                <div class="form-group">
                                    <label for="caseTitle">Case Title *</label>
                                    <input type="text" id="caseTitle" name="caseTitle" placeholder="e.g., Student Behavioral Incident" required>
                                </div>

                                <div class="form-group">
                                    <label for="caseType">Case Type *</label>
                                    <select id="caseType" name="caseType" required>
                                        <option value="">Select Type</option>
                                        <option value="Academic">Academic Case</option>
                                        <option value="Behavioral">Behavioral Case</option>
                                        <option value="Mental_Health">Mental Health</option>
                                        <option value="Family">Family Issues</option>
                                        <option value="Abuse">Abuse/Neglect</option>
                                        <option value="Substance">Substance Abuse</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="caseDescription">Case Description *</label>
                                    <textarea id="caseDescription" name="caseDescription" placeholder="Provide details about the case..." required rows="4"></textarea>
                                </div>

                                <div class="form-group">
                                    <label for="severity">Severity Level *</label>
                                    <select id="severity" name="severity" required>
                                        <option value="">Select Level</option>
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                        <option value="Critical">Critical</option>
                                    </select>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="submit" class="btn btn-success">Submit Report</button>
                                <button type="button" class="btn btn-secondary" id="cancelNewCase">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
    <!-- ExcelJS — the downloaded .xlsx needs real cell colors/borders/merges,
         which the free SheetJS "Community Edition" build can't write; see
         buildReportCasesWorkbook() in report-case.js. -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>
    <script src="{{ asset('pages/counselor/report-letterhead.js') }}?v={{ filemtime(public_path('pages/counselor/report-letterhead.js')) }}"></script>
    <script src="{{ asset('pages/counselor/report-case.js') }}?v={{ filemtime(public_path('pages/counselor/report-case.js')) }}"></script>
</body>
</html>
