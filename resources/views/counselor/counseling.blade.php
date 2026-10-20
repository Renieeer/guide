<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Create Case - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <!-- Reuses student-history.js's own case-thread rail styling
         (.sh-case-day/-badge/-bar/-note-row etc.) for this page's case
         drawer timeline, instead of a second, separate visual language. -->
    <link rel="stylesheet" href="{{ asset('css/student-history.css') }}?v={{ filemtime(public_path('css/student-history.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
</head>
<body>
    <div class="main-wrapper">
        @include('partials.sidebar-counselor')

        <div class="main-content">
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-folder-plus"></i> Case Management</div>
                    <h2 class="page-hero-title">Case Scenario</h2>
                    <p class="page-hero-text">Open a new counseling case, attach involved students, and prepare the first follow-up plan.</p>
                </div>
                <button type="button" class="btn btn-primary" id="openCaseFormBtn">
                    <i class="bi bi-folder-plus"></i> Create case
                </button>
            </div>

            <div class="page-content">
            <div class="case-dashboard" id="caseFormWrapper" style="display:none;">
                <form id="caseCreateForm" class="case-form card">
                    <div class="form-section">
                        <div class="section-header">
                            <div>
                                <h3>Case details</h3>
                                <p>Define the concern and the initial counseling direction.</p>
                            </div>
                            <div style="display:flex;gap:10px;align-items:center;">
                                <span class="pill pill-soft">Draft-ready</span>
                                <button type="button" class="btn btn-ghost btn-sm" id="cancelCaseFormBtn" title="Discard and close">
                                    <i class="bi bi-x-lg"></i> Cancel
                                </button>
                            </div>
                        </div>

                        <!-- Category is recorded per involved student in the follow-up /
                             counseling-info step, not here. -->
                        <div class="form-grid two-up">
                            <div class="form-field">
                                <label for="caseSection">Case Section *</label>
                                <select id="caseSection" name="caseSection" required>
                                    <option value="">Loading sections…</option>
                                </select>
                            </div>
                        </div>
                        <!-- Case is a record of what already happened, not something scheduled to start,
                             so the logged date is captured automatically instead of asked for. -->
                        <input type="hidden" id="caseDate" name="caseDate">

                        <div class="form-field">
                            <label for="caseSummary">Notes *</label>
                            <textarea id="caseSummary" name="caseSummary" rows="4" placeholder="Describe the main issue and why this case is being opened." required></textarea>
                        </div>

                        <div class="form-grid two-up">
                            <div class="form-field">
                                <label for="caseObjective">Counseling objective</label>
                                <textarea id="caseObjective" name="caseObjective" rows="3" placeholder="What should the first counseling session accomplish?"></textarea>
                            </div>
                            <div class="form-field">
                                <label for="firstAction">Initial action plan</label>
                                <textarea id="firstAction" name="firstAction" rows="3" placeholder="Notes on the first intervention, coordination, or referral step."></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="section-header">
                            <div>
                                <h3>Student involvement</h3>
                                <p>Add every student who should be linked to this case.</p>
                            </div>
                            <span class="pill" id="studentCountPill">0 students</span>
                        </div>

                        <div class="student-add-grid">
                            <div class="form-field student-name-field">
                                <label for="studentName">Student name</label>
                                <input type="text" id="studentName" placeholder="e.g. Jane Doe">
                            </div>
                            <div class="student-add-row">
                                <div class="form-field">
                                    <label for="studentGrade">Grade / section</label>
                                    <input type="text" id="studentGrade" placeholder="e.g. Grade 10 - Section Alpha">
                                </div>
                                <div class="form-field">
                                    <label for="studentRole">Role in case</label>
                                    <select id="studentRole">
                                        <option value="" selected disabled>Select role</option>
                                        <option value="Offender">Offender</option>
                                        <option value="Victim">Victim</option>
                                        <option value="Bystander">Bystander</option>
                                        <option value="Other">Other</option>
                                    </select>
                                    <input type="text" id="studentRoleOtherText" placeholder="Specify the role..." style="display:none; margin-top:8px;">
                                </div>
                                <button type="button" class="btn btn-outline add-student-btn" id="addStudentBtn">
                                    <i class="bi bi-plus-lg"></i> Add student
                                </button>
                            </div>
                        </div>

                        <div id="studentList" class="student-list"></div>
                    </div>

                    <!-- These are all set/inferred automatically rather than asked for:
                         the first follow-up date defaults to next week (adjustable later
                         from the actual Follow-up flow), the counselor is whoever is logged
                         in, and every counseling case is treated as confidential. -->
                    <input type="date" id="followUpDate" name="followUpDate" hidden>
                    <input type="text" id="assignedCounselor" name="assignedCounselor" hidden>
                    <input type="checkbox" id="confidentialityAck" name="confidentialityAck" checked hidden>
                    <div class="form-actions">
                        <button type="submit" form="caseCreateForm" class="btn btn-primary"><i class="bi bi-send"></i> Submit case</button>
                    </div>
                </form>
            </div>

            <div class="card recent-cases-card">
                <div class="section-header">
                    <div>
                        <h3>Recent drafts</h3>
                        <p>Saved cases appear here, newest first. Click "View students" to see who is linked to each case.</p>
                    </div>
                </div>

                <div class="recent-drafts-toolbar">
                    <div class="toolbar-label"><i class="bi bi-sliders"></i> Filter by</div>
                    <div class="filter-group">
                        <label for="draftSectionFilter">Section (Range)</label>
                        <select id="draftSectionFilter">
                            <option value="">All sections</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="draftCategoryFilter">Category</label>
                        <select id="draftCategoryFilter">
                            <option value="">All categories</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="draftStatusFilter">Status</label>
                        <select id="draftStatusFilter">
                            <option value="">All statuses</option>
                            <option value="pending">Pending</option>
                            <option value="closed">Ended</option>
                        </select>
                    </div>
                    <button type="button" class="btn-clear-filters" id="clearDraftFiltersBtn">
                        <i class="bi bi-x-lg"></i> Clear filters
                    </button>
                </div>

                <div class="table-container">
                    <table class="recent-table">
                        <thead>
                            <tr>
                                <th>Case ID</th>
                                <th>Section (Range)</th>
                                <th>Category</th>
                                <th>Students</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="recentCasesBody">
                            <tr>
                                <td colspan="6" class="empty-state">No saved drafts yet.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            </div>
        </div>
    </div>

    <div class="modal modal-lg" id="followUpModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="bi bi-chat-dots"></i> Record Follow-up</h2>
                <button type="button" class="modal-close" onclick="closeFollowUpModal()">&times;</button>
            </div>
            <div class="modal-body" id="followUpBody"></div>
            <div class="form-actions" style="padding:16px 32px 24px;">
                <button type="button" class="btn btn-secondary" onclick="closeFollowUpModal()">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="saveFollowUp()"><i class="bi bi-check2"></i> Save follow-up</button>
            </div>
        </div>
    </div>

    <div class="modal modal-lg" id="appointModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="bi bi-calendar-plus"></i> Appoint Students</h2>
                <button type="button" class="modal-close" onclick="closeAppointModal()">&times;</button>
            </div>
            <div class="modal-body" id="appointBody"></div>
            <div class="form-actions" style="padding:16px 32px 24px;">
                <button type="button" class="btn btn-secondary" onclick="closeAppointModal()">Cancel</button>
                <button type="button" class="btn btn-primary" id="appointSubmitBtn" onclick="submitAppointments()"><i class="bi bi-check2"></i> Appoint selected</button>
            </div>
        </div>
    </div>

    <div class="modal" id="counselingInfoModal">
        <div class="modal-content modal-content-wide">
            <div class="rc-report-header">
                <div class="rc-report-title-block">
                    <i class="bi bi-clipboard2-pulse"></i> Counseling Information
                </div>
                <div class="rc-report-header-meta" id="rcHeaderMeta"></div>
                <button type="button" class="modal-close" onclick="closeCounselingPanel()">&times;</button>
            </div>
            <div class="modal-body rc-modal-body" id="counselingInfoBody"></div>
            <div class="form-actions" style="padding: 16px 32px 24px;">
                <button type="button" class="btn btn-secondary" onclick="closeCounselingPanel()">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="saveCounselingInfo()"><i class="bi bi-check2"></i> Save</button>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/counselor/counseling.js') }}?v={{ filemtime(public_path('pages/counselor/counseling.js')) }}"></script>
</body>
</html>