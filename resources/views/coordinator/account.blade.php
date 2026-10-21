<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manage Accounts - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-coordinator')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Content -->
            <div class="account-page-content page-content">
                <div class="account-hero">
                    <div>
                        <div class="account-hero-eyebrow"><i class="bi bi-shield-lock"></i> School Account Administration</div>
                        <h2 class="account-hero-title">Manage every account in your school</h2>
                        <p class="account-hero-text">Search by name or email, open any user record, and update account details or reset a password when a staff member or student forgets it.</p>
                    </div>
                    <div class="page-hero-actions" style="margin-left:auto;">
                        <button type="button" id="openIssueCodeModalBtn" class="btn btn-primary"><i class="bi bi-envelope-plus"></i> Issue Teacher Access Code</button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title mb-0">School Accounts</h2>
                        <p style="color: #666; font-size: 14px; margin-top: 5px;">Manage all accounts within your school. Search, edit, or reset passwords as needed.</p>
                    </div>

                    <!-- Search Bar -->
                    <div style="padding: 20px; border-bottom: 1px solid #eee;">
                        <div class="search-container">
                            <input
                                type="text"
                                id="searchInput"
                                placeholder="Search by name or email..."
                            >
                            <select id="gradeFilter" title="Filter by grade">
                                <option value="">All Grades</option>
                                <option value="7">Grade 7</option>
                                <option value="8">Grade 8</option>
                                <option value="9">Grade 9</option>
                                <option value="10">Grade 10</option>
                                <option value="11">Grade 11</option>
                                <option value="12">Grade 12</option>
                            </select>
                            <select id="pageSizeFilter" title="Accounts per page">
                                <option value="10">Show 10</option>
                                <option value="20" selected>Show 20</option>
                                <option value="30">Show 30</option>
                                <option value="all">Show All</option>
                            </select>
                            <label style="display:flex; align-items:center; gap:6px; font-size:14px; color:#555; white-space:nowrap;">
                                <input type="checkbox" id="showInactiveFilter"> Show inactive students
                            </label>
                            <button class="btn btn-primary" onclick="searchAccounts()">
                                <i class="bi bi-search"></i> Search
                            </button>
                            <button class="btn btn-success" id="exportAccountsExcelBtn" onclick="exportStudentAccountsToExcel()">
                                <i class="bi bi-file-earmark-excel"></i> Export Excel
                            </button>
                            <button class="btn btn-primary" id="openImportAccountsModalBtn">
                                <i class="bi bi-cloud-upload"></i> Import Accounts
                            </button>
                        </div>
                    </div>

                    <!-- Accounts Table -->
                    <div class="account-table-container">
                        <table class="accounts-table" id="accountsTable">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Type</th>
                                    <th>Grade</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="accountsTableBody">
                                <tr>
                                    <td colspan="7" class="no-accounts">
                                        <i class="bi bi-hourglass-split" style="font-size: 24px; margin-bottom: 10px;"></i>
                                        <p>Loading accounts...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div id="accountsPagination" class="accounts-pagination"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Account Modal -->
    <div id="editAccountModal" class="modal">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Edit Account</h2>
                <span class="modal-close" onclick="closeEditModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="editAccountForm">
                    <div class="form-group">
                        <label for="editFirstName">First Name *</label>
                        <input type="text" id="editFirstName" name="first_name" required>
                    </div>

                    <div class="form-group">
                        <label for="editLastName">Last Name *</label>
                        <input type="text" id="editLastName" name="last_name" required>
                    </div>

                    <div class="form-group">
                        <label for="editEmail">Email (Read-only)</label>
                        <input type="email" id="editEmail" disabled style="background-color: #f5f5f5;">
                    </div>

                    <div class="form-group">
                        <label for="editUserType">Account Type (Read-only)</label>
                        <input type="text" id="editUserType" disabled style="background-color: #f5f5f5;">
                    </div>

                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                        <h4 style="margin-bottom: 10px;">Reset Password (Optional)</h4>
                        <div class="form-group">
                            <label for="editPassword">New Password</label>
                            <input type="password" id="editPassword" name="password" placeholder="Leave blank to keep current password">
                            <small style="color: #666;">Minimum 6 characters</small>
                        </div>

                        <div class="form-group">
                            <label for="editPasswordConfirm">Confirm Password</label>
                            <input type="password" id="editPasswordConfirm" name="password_confirm" placeholder="Leave blank to keep current password">
                        </div>
                    </div>

                    <div class="form-actions" style="margin-top: 20px;">
                        <button type="submit" class="btn btn-success">Save Changes</button>
                        <button type="button" class="btn btn-secondary" onclick="closeEditModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Issue Teacher Access Code Modal -->
    <div id="issueCodeModal" class="modal">
        <div class="modal-content" style="max-width: 460px;">
            <div class="modal-header">
                <h2>Issue Teacher Access Code</h2>
                <span class="modal-close" onclick="closeIssueCodeModal()">&times;</span>
            </div>
            <div class="modal-body">
                <p class="text-muted" style="margin-top:0;">Emails a one-time access code straight to the teacher's inbox — they'll enter it, along with their details, on the Staff Registration page. The code expires in 2 hours and can only be used once.</p>

                <form id="issueCodeForm">
                    <div id="issueCodeError" class="error-alert"></div>

                    <div class="form-group">
                        <label for="issueCodeEmail">Teacher's Email</label>
                        <input type="email" id="issueCodeEmail" placeholder="teacher@example.com" required autocomplete="off">
                    </div>

                    <div class="form-actions" style="margin-top: 20px;">
                        <button type="submit" class="btn btn-primary" id="issueCodeSubmitBtn">Generate Code</button>
                        <button type="button" class="btn btn-secondary" onclick="closeIssueCodeModal()">Cancel</button>
                    </div>
                </form>

                <div id="issueCodeResult" class="grade-checkbox-group" style="display:none; flex-direction:column; align-items:flex-start; gap:10px; margin-top: 16px;">
                    <span class="text-muted" id="issueCodeStatus" style="font-size:13px;"></span>
                    <div id="issueCodeFallback" style="display:none; align-items:center; gap:10px; width:100%;">
                        <code id="issueCodeValue" style="font-size:20px; font-weight:700; letter-spacing:2px; background:white; padding:8px 12px; border-radius:8px; border:1.5px solid var(--border-color); flex:1;"></code>
                        <button type="button" class="btn btn-secondary btn-sm" id="copyIssueCodeBtn">Copy</button>
                    </div>
                    <span class="text-muted" id="issueCodeExpiry" style="font-size:12px;"></span>
                </div>
            </div>
        </div>
    </div>

    <!-- Import Accounts Modal -->
    <div id="importAccountsModal" class="modal">
        <div class="modal-content" style="max-width: 920px; width: 95%;">
            <div class="modal-header">
                <h2><i class="bi bi-cloud-upload"></i> Import Accounts</h2>
                <span class="modal-close" onclick="closeImportAccountsModal()">&times;</span>
            </div>
            <div class="modal-body" style="max-height: 72vh; overflow-y: auto;">

                <!-- Step 1: Instructions + download template + upload -->
                <div id="importStepUpload">
                    <h4 style="margin-top:0;">How this works</h4>
                    <ol style="padding-left: 20px; color: #444; line-height: 1.7;">
                        <li>Download the Excel template below.</li>
                        <li>Fill in one row per student — the template already has an example row showing the expected format.</li>
                        <li>Save the file, then upload it here.</li>
                        <li>Review the preview: it shows which rows are ready to import and which need fixing.</li>
                        <li>Click <strong>Import Accounts</strong> to create the valid accounts. Rows with problems are skipped and never overwrite existing records.</li>
                    </ol>

                    <div class="error-alert show" style="background:#fff8e6; border-color:#f0d58c; color:#7a5b00; margin-bottom:16px;">
                        <strong>Important:</strong> Do not rename the column headers, change their order, or add/remove columns — the importer reads the template by column name.
                        <ul style="margin:8px 0 0; padding-left:18px;">
                            <li><strong>LRN, First Name, Last Name, Sex, Date of Birth, Age, Grade, Email</strong> are required for every row.</li>
                            <li><strong>Middle Name, Section, Password</strong> are optional — leave <strong>Password</strong> blank to have the student's LRN used as their default password.</li>
                            <li><strong>Sex</strong>: Male or Female. <strong>Date of Birth</strong>: YYYY-MM-DD (e.g. 2012-03-20) or MM/DD/YYYY (e.g. 03/20/2012) — Excel may reformat a typed date to MM/DD/YYYY on its own, and either is accepted. <strong>Grade</strong>: a plain number appropriate for your school (1–6 for an elementary school, 7–12 for a secondary school).</li>
                            <li><strong>Email must be a real, active email address the student can access</strong> — it becomes their login for the system, and each email can only be used for one account.</li>
                            <li>Rows with missing/invalid fields, a duplicate LRN or email (within the file or already in the system), are flagged in the preview and are <strong>not</strong> imported — existing student accounts are never overwritten.</li>
                        </ul>
                    </div>

                    <div class="form-actions" style="margin-bottom: 20px;">
                        <button type="button" class="btn btn-secondary" id="downloadImportTemplateBtn">
                            <i class="bi bi-download"></i> Download Excel Template
                        </button>
                    </div>

                    <h4>Upload completed file</h4>
                    <div id="importDropZone" style="border: 2px dashed var(--border-color); border-radius: 10px; padding: 30px; text-align: center; color: #666; cursor: pointer;">
                        <i class="bi bi-file-earmark-excel" style="font-size: 28px; color: #1b8f59;"></i>
                        <p style="margin: 10px 0 4px;">Drag and drop your completed Excel file here, or <strong style="color: var(--primary-color);">click to browse</strong></p>
                        <p style="margin:0; font-size: 12px; color: #999;">.xlsx or .xls only</p>
                        <input type="file" id="importFileInput" accept=".xlsx,.xls" hidden>
                    </div>
                    <div id="importFileError" class="error-alert" style="margin-top: 12px;"></div>
                    <div id="importFileLoading" style="display:none; margin-top: 12px; color: #666;"><i class="bi bi-hourglass-split"></i> Reading file&hellip;</div>
                </div>

                <!-- Step 2: Preview -->
                <div id="importStepPreview" style="display:none;">
                    <div id="importSummaryCards" class="dashboard-grid" style="margin-bottom: 20px;"></div>
                    <div class="table-container" style="max-height: 340px; overflow-y: auto;">
                        <table>
                            <thead>
                                <tr>
                                    <th>Row</th>
                                    <th>Name</th>
                                    <th>LRN</th>
                                    <th>Email</th>
                                    <th>Grade</th>
                                    <th>Status</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody id="importPreviewTbody"></tbody>
                        </table>
                    </div>
                    <div class="form-actions" style="margin-top: 16px;">
                        <button type="button" class="btn btn-secondary" id="importChooseAnotherFileBtn">
                            <i class="bi bi-arrow-left"></i> Choose a different file
                        </button>
                    </div>
                </div>

                <!-- Step 3: Result -->
                <div id="importStepResult" style="display:none; text-align:center; padding: 20px 0;">
                    <i id="importResultIcon" class="bi bi-check-circle" style="font-size: 48px; color: #1b8f59;"></i>
                    <h3 id="importResultTitle" style="margin: 14px 0 6px;"></h3>
                    <p id="importResultDetail" class="text-muted"></p>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="importCancelBtn">Close</button>
                <button type="button" class="btn btn-primary" id="importConfirmBtn" style="display:none;">
                    <i class="bi bi-cloud-upload"></i> Import Accounts
                </button>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
    <script src="{{ asset('pages/coordinator/account.js') }}?v={{ filemtime(public_path('pages/coordinator/account.js')) }}"></script>
</body>
</html>
