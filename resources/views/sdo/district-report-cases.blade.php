<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>District Report Cases - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body class="district-report-page">
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-sdo')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-file-earmark-text"></i> Documentation</div>
                    <h2 class="page-hero-title">District Report Cases</h2>
                    <p class="page-hero-text">Review all case reports from schools throughout the district and track outcomes.</p>
                </div>
                <div class="page-hero-actions">
                    <button type="button" class="report-settings-btn" id="reportSettingsBtn" aria-label="Report Settings" data-tooltip="Report Settings">
                        <i class="bi bi-gear-fill"></i>
                    </button>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- District Navigation -->
                <div class="card mb-5 dr-card-districts">
                    <div class="card-header">
                        <div class="card-title">Select District</div>
                    </div>
                    <div class="district-search-row">
                        <div class="school-search-wrap district-search-wrap">
                            <i class="bi bi-search"></i>
                            <input type="text" id="districtSearchInput" placeholder="Search school...">
                        </div>
                    </div>
                    <div class="district-nav">
                        <div class="district-buttons" id="districtButtons">
                            <p class="text-muted">Loading districts...</p>
                        </div>
                        <div class="district-pagination" id="districtPagination" hidden></div>
                    </div>
                </div>

                <!-- Filters -->
                <div class="card mb-5 dr-card-filters">
                    <div class="report-filter-bar">
                        <div class="report-filter-group">
                            <label class="report-filter-label">Period</label>
                            <div class="period-buttons" id="periodButtons">
                                <button type="button" class="period-btn active" data-period="all">All Time</button>
                                <button type="button" class="period-btn" data-period="weekly">Weekly</button>
                                <button type="button" class="period-btn" data-period="monthly">Monthly</button>
                                <button type="button" class="period-btn" data-period="annually">Annually</button>
                                <button type="button" class="period-btn" data-period="custom">Custom</button>
                            </div>
                        </div>
                        <div class="report-filter-group custom-range-group" id="customRangeGroup" hidden>
                            <input type="date" id="rangeStart" class="form-control">
                            <span class="custom-range-sep">to</span>
                            <input type="date" id="rangeEnd" class="form-control">
                            <button type="button" class="btn btn-primary btn-sm" id="applyRangeBtn">Apply</button>
                        </div>
                        <div class="export-btn-group">
                            <button class="btn btn-danger" id="exportPdfBtn"><i class="bi bi-file-earmark-pdf"></i> Export PDF</button>
                            <button class="btn btn-success" id="exportExcelBtn"><i class="bi bi-file-earmark-excel"></i> Export Excel</button>
                        </div>
                    </div>
                </div>

                <!-- Cases by School (one row per school, with gender distribution) —
                     only shown for the "All Districts" selection; a single district
                     is already just that one district's category/grade table below. -->
                <div class="table-container mb-5" id="schoolBreakdownSection" hidden>
                    <div class="card-header">
                        <div class="card-title">Cases by School</div>
                    </div>
                    <table id="schoolBreakdownTable">
                        <thead>
                            <tr>
                                <th>School</th>
                                <th>Total Cases</th>
                                <th>Male</th>
                                <th>Female</th>
                            </tr>
                        </thead>
                        <tbody id="schoolBreakdownBody">
                            <!-- Data will be inserted here -->
                        </tbody>
                    </table>
                </div>

                <!-- Report Cases Table -->
                <div class="table-container">
                    <table id="reportCasesTable">
                        <thead>
                            <tr id="reportCasesHeaderRow">
                                <th rowspan="2">Category of Cases</th>
                                <th colspan="3">Grade 7</th>
                                <th colspan="3">Grade 8</th>
                                <th colspan="3">Grade 9</th>
                                <th colspan="3">Grade 10</th>
                                <th colspan="3">Grade 11</th>
                                <th colspan="3">Grade 12</th>
                                <th rowspan="2">Overall Total</th>
                            </tr>
                            <tr id="reportCasesSubHeaderRow">
                                <th title="Male">M</th><th title="Female">F</th><th title="Total">T</th>
                                <th title="Male">M</th><th title="Female">F</th><th title="Total">T</th>
                                <th title="Male">M</th><th title="Female">F</th><th title="Total">T</th>
                                <th title="Male">M</th><th title="Female">F</th><th title="Total">T</th>
                                <th title="Male">M</th><th title="Female">F</th><th title="Total">T</th>
                                <th title="Male">M</th><th title="Female">F</th><th title="Total">T</th>
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
                            <button class="btn btn-secondary" id="editCaseBtn">Edit Case</button>
                            <button class="btn btn-primary" id="closeCaseModal">Close</button>
                        </div>
                    </div>
                </div>

                <!-- Export Options Modal — report type + period picked here,
                     then handed to the existing PDF/Excel preview flow. -->
                <div id="exportOptionsModal" class="modal">
                    <div class="modal-content" style="max-width: 520px;">
                        <div class="modal-header">
                            <h2><i class="bi bi-file-earmark-arrow-down"></i> Export Report</h2>
                            <button class="modal-close" id="closeExportOptionsModal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="form-group">
                                <label for="exportReportType">Report</label>
                                <select id="exportReportType">
                                    <option value="cases_by_school">Cases by School</option>
                                    <option value="division_summary">Division-Wide Summary Case</option>
                                    <option value="dmmr">Division Monthly Monitoring Report of Learners' Personal-Social Concerns</option>
                                </select>
                            </div>

                            <!-- Cases by School — lets the SDO narrow the per-school table to
                                 one school_level group at a time (set per-school in School
                                 Management's Add/Edit School modal) instead of every active
                                 school at once. -->
                            <div class="form-group" id="exportSchoolLevelGroup">
                                <label for="exportSchoolLevel">School Level</label>
                                <select id="exportSchoolLevel">
                                    <option value="all">All Levels</option>
                                    <option value="Secondary">Secondary</option>
                                    <option value="East">East</option>
                                    <option value="West">West</option>
                                    <option value="South">South</option>
                                </select>
                                <p style="margin: 8px 0 0; padding: 8px 12px; background: var(--info-bg); border-left: 3px solid var(--info); border-radius: 4px; font-size: 12.5px; color: #0f2a4f;">
                                    <i class="bi bi-info-circle"></i> East, West, and South are elementary school levels. Secondary covers junior/senior high schools.
                                </p>
                            </div>

                            <!-- Cases by School — further narrows each school's total to one
                                 real Section/Case Category (options filled in from the same
                                 6-section/27-category taxonomy as the on-screen table).
                                 Category cascades off Section and stays "All Categories" until
                                 a specific section is picked. -->
                            <div class="form-group" id="exportSectionFilterGroup">
                                <label for="exportSectionFilter">Section</label>
                                <select id="exportSectionFilter">
                                    <option value="all">All Sections</option>
                                </select>
                            </div>

                            <div class="form-group" id="exportCategoryFilterGroup">
                                <label for="exportCategoryFilter">Case Category</label>
                                <select id="exportCategoryFilter" disabled>
                                    <option value="all">All Categories</option>
                                </select>
                            </div>

                            <!-- Cases by School / Division-Wide Summary Case — same period
                                 keywords as the on-screen filter (weekly/monthly/annually
                                 mean "current", no specific month/year to pick; custom is
                                 an explicit range). -->
                            <div class="form-group" id="exportCasesPeriodGroup">
                                <label>Period</label>
                                <div class="period-buttons" id="exportCasesPeriodButtons">
                                    <button type="button" class="period-btn active" data-cases-period="weekly">Weekly</button>
                                    <button type="button" class="period-btn" data-cases-period="monthly">Monthly</button>
                                    <button type="button" class="period-btn" data-cases-period="annually">Annually</button>
                                    <button type="button" class="period-btn" data-cases-period="custom">Custom</button>
                                </div>
                                <div class="report-filter-group custom-range-group" id="exportCasesRangeGroup" hidden style="margin-top:12px;">
                                    <input type="date" id="exportCasesRangeStart" class="form-control">
                                    <span class="custom-range-sep">to</span>
                                    <input type="date" id="exportCasesRangeEnd" class="form-control">
                                </div>
                            </div>

                            <!-- Division Monthly Monitoring Report — needs one specific
                                 month+year, since that's what the official form is dated by. -->
                            <div class="form-row" id="exportDmmrPeriodGroup" style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                                <div class="form-group">
                                    <label for="exportMonthSelect">Month</label>
                                    <select id="exportMonthSelect"></select>
                                </div>
                                <div class="form-group">
                                    <label for="exportYearSelect">Year</label>
                                    <select id="exportYearSelect"></select>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="cancelExportOptionsBtn">Cancel</button>
                            <button type="button" class="btn btn-primary" id="generateExportBtn"><i class="bi bi-eye"></i> Preview</button>
                        </div>
                    </div>
                </div>

                <!-- Report Settings Modal — division-wide PDF header/footer,
                     replaces the built-in DepEd letterhead once a custom PDF
                     is uploaded and cropped client-side (see
                     sdo-report-letterhead.js). Affects every PDF export on
                     this page AND on School Reports — one shared setting. -->
                <div id="reportSettingsModal" class="modal">
                    <div class="modal-content" style="max-width: 640px;">
                        <div class="modal-header">
                            <h2><i class="bi bi-gear-fill"></i> Report Settings</h2>
                            <button class="modal-close" id="closeReportSettingsModal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <p class="text-muted" style="margin-top: 0;">This header/footer prints on every PDF report exported from District Report Cases and School Reports. Upload one PDF containing a replacement letterhead and it'll be split into a header (top) and footer (bottom) band.</p>

                            <div id="reportLetterheadBuiltinNotice" style="display: none; margin-bottom: 20px;">
                                <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
                                    <div>
                                        <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Header (current)</label>
                                        <img id="reportLetterheadBuiltinHeaderPreview" alt="Built-in header seal" style="max-width: 120px; border: 1px solid var(--border-color); border-radius: 6px; background: #fff; padding: 8px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Footer (current)</label>
                                        <img id="reportLetterheadBuiltinFooterPreview" alt="Built-in footer logos" style="max-width: 260px; border: 1px solid var(--border-color); border-radius: 6px; background: #fff; padding: 8px;">
                                    </div>
                                </div>
                                <p class="text-muted" style="font-size: 12.5px; margin: 10px 0 0;">
                                    <i class="bi bi-info-circle"></i> Current (built-in DepEd letterhead). The report also prints "Republic of the Philippines / Department of Education / SCHOOLS DIVISION OF CALAPAN CITY" and the office/address lines around these images in code. Uploading a replacement PDF below replaces the whole header/footer band — image and text together — with your own design.
                                </p>
                            </div>

                            <div id="reportLetterheadCurrent" style="display: none; margin-bottom: 20px;">
                                <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
                                    <div>
                                        <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Header</label>
                                        <img id="reportLetterheadHeaderPreview" alt="Header preview" style="max-width: 260px; border: 1px solid var(--border-color); border-radius: 6px;">
                                    </div>
                                    <div>
                                        <label style="display: block; font-size: 12px; color: #64748b; margin-bottom: 4px;">Footer</label>
                                        <img id="reportLetterheadFooterPreview" alt="Footer preview" style="max-width: 260px; border: 1px solid var(--border-color); border-radius: 6px;">
                                    </div>
                                </div>
                                <p class="text-muted" id="reportLetterheadMeta" style="font-size: 12.5px; margin: 10px 0 0;"></p>
                                <p id="reportLetterheadNoEditNotice" style="display: none; font-size: 12.5px; color: #b45309; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 8px 12px; margin: 10px 0 0;">
                                    <i class="bi bi-info-circle"></i> This one was uploaded before Edit Crop existed, so there's no saved page to re-slice. Re-upload it once below (Replace with a Different PDF) and Edit Crop will work for it from then on.
                                </p>
                                <div style="display: flex; gap: 10px; margin-top: 10px;">
                                    <button type="button" class="btn btn-primary" id="editReportLetterheadCropBtn">
                                        <i class="bi bi-crop"></i> Edit Crop
                                    </button>
                                    <button type="button" class="btn btn-danger" id="deleteReportLetterheadBtn">
                                        <i class="bi bi-trash"></i> Revert to Built-in Letterhead
                                    </button>
                                </div>
                            </div>

                            <div class="form-group">
                                <label for="reportLetterheadFileInput" id="reportLetterheadFileLabel">Upload New PDF</label>
                                <input type="file" id="reportLetterheadFileInput" accept="application/pdf">
                            </div>

                            <div id="reportLetterheadEditor" style="display: none;">
                                <div style="position: relative; display: inline-block; max-width: 100%;">
                                    <canvas id="reportLetterheadCanvas" style="max-width: 100%; border: 1px solid var(--border-color); border-radius: 6px; display: block;"></canvas>
                                    <div id="reportLetterheadHeaderOverlay" style="position: absolute; top: 0; left: 0; right: 0; background: rgba(37, 99, 235, 0.25); border-bottom: 2px dashed #2563eb; pointer-events: none;"></div>
                                    <div id="reportLetterheadFooterOverlay" style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(220, 38, 38, 0.25); border-top: 2px dashed #dc2626; pointer-events: none;"></div>
                                </div>

                                <div class="form-group" style="margin-top: 16px;">
                                    <label for="reportLetterheadHeaderSlider">Header height: <span id="reportLetterheadHeaderPct">20</span>%</label>
                                    <input type="range" id="reportLetterheadHeaderSlider" min="5" max="45" value="20" style="width: 100%;">
                                </div>
                                <div class="form-group">
                                    <label for="reportLetterheadFooterSlider">Footer height: <span id="reportLetterheadFooterPct">15</span>%</label>
                                    <input type="range" id="reportLetterheadFooterSlider" min="5" max="45" value="15" style="width: 100%;">
                                </div>

                                <button type="button" class="btn btn-success" id="saveReportLetterheadBtn">
                                    <i class="bi bi-check-lg"></i> Save Header &amp; Footer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
    <!-- ExcelJS — every Excel export's real cell colors/borders/merges need
         actual style-writing on .xlsx, which the free SheetJS "Community
         Edition" build can't do on write (CE dropped that years ago). -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>
    <script src="{{ asset('pages/sdo/sdo-report-assets.js') }}?v={{ filemtime(public_path('pages/sdo/sdo-report-assets.js')) }}"></script>
    <script src="{{ asset('pages/sdo/sdo-report-letterhead.js') }}?v={{ filemtime(public_path('pages/sdo/sdo-report-letterhead.js')) }}"></script>
    <script src="{{ asset('pages/sdo/district-report-cases.js') }}?v={{ filemtime(public_path('pages/sdo/district-report-cases.js')) }}"></script>
</body>
</html>
