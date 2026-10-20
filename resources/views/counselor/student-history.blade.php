<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student History - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="{{ asset('css/student-history.css') }}?v={{ filemtime(public_path('css/student-history.css')) }}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* Personal Information is also reachable via the "Personal Info"
           stat chip in the student header card (#shStatChips) — confirmed
           working independently of this nav (Playwright: clicking it
           activates #shBody-personal on its own). So, same as the
           student's own "My History" page, this folder-card picker is
           hidden rather than a needed access path — see
           project_student_history_timeline memory for the fuller history
           of this page's redesign. Hidden, not removed from the DOM:
           student-history.js still updates #shCount-* on every render. */
        #shFolderNav {
            display: none;
        }
        #shFolderGrid.sh-folder-layout {
            grid-template-columns: 1fr;
        }
    </style>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
</head>
<body>
    <div class="main-wrapper">
        @include('partials.sidebar-counselor')
        <div class="main-content">
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-folder2-open"></i> Records</div>
                    <h2 class="page-hero-title">Student History</h2>
                    <p class="page-hero-text">Every referral, counseling case, follow-up, and online appointment for a student in one place — organized as folders you can open, with filters for finding things fast.</p>
                </div>
            </div>

            <div class="page-content">
                <!-- Student list / picker -->
                <div id="shBrowseCard" class="card" style="margin-bottom: 20px;">
                    <div class="sh-picker">
                        <div class="sh-picker-field" style="flex: 1 1 320px;">
                            <label for="shStudentSearch">Search Students</label>
                            <input type="text" id="shStudentSearch" placeholder="Filter by name, ID, or email..." autocomplete="off">
                        </div>
                        <div class="sh-picker-field" style="flex: 0 0 auto;">
                            <label for="shPageSize">Show</label>
                            <select id="shPageSize">
                                <option value="10">10</option>
                                <option value="20" selected>20</option>
                                <option value="30">30</option>
                                <option value="all">All</option>
                            </select>
                        </div>
                    </div>
                    <div class="sh-slist-count" id="shSlistCount"></div>
                    <div id="shStudentList" class="sh-slist"></div>
                    <div id="shSlistPagination" class="sh-slist-pagination"></div>
                </div>

                <!-- Back to list -->
                <div id="shBackBar" class="sh-back-bar" style="display:none;">
                    <button type="button" id="shBackToList" class="btn btn-secondary btn-sm"><i class="bi bi-arrow-left"></i> Back to Student List</button>
                </div>

                <!-- Selected student summary -->
                <div id="shStudentHeaderCard" class="card" style="margin-bottom: 20px; display:none;">
                    <div class="sh-student-header">
                        <div id="shAvatar" class="sh-avatar">?</div>
                        <div>
                            <div id="shStudentName" class="sh-student-name">—</div>
                            <div id="shStudentSub" class="sh-student-sub">—</div>
                        </div>
                        <div id="shStatChips" class="sh-stat-chips"></div>
                    </div>
                </div>

                <!-- Filters -->
                <div id="shFilterCard" class="card" style="margin-bottom: 20px; display:none;">
                    <div class="sh-filter-bar">
                        <div class="sh-filter-field">
                            <label>Search</label>
                            <input type="text" id="shSearchText" placeholder="Search reason, notes, case title...">
                        </div>
                        <div class="sh-filter-field">
                            <label>Record Type</label>
                            <select id="shTypeFilter">
                                <option value="">All Records</option>
                                <option value="referrals">Referrals</option>
                                <option value="counseling">Counseling Sessions</option>
                                <option value="follow_ups">Counseling Follow-Ups</option>
                                <option value="appointments">Online Appointments</option>
                            </select>
                        </div>
                        <div class="sh-filter-field">
                            <label>Status</label>
                            <select id="shStatusFilter">
                                <option value="">All Statuses</option>
                            </select>
                        </div>
                        <div class="sh-filter-field">
                            <label>From</label>
                            <input type="date" id="shDateFrom">
                        </div>
                        <div class="sh-filter-field">
                            <label>To</label>
                            <input type="date" id="shDateTo">
                        </div>
                        <div class="sh-filter-field">
                            <label>Show</label>
                            <select id="shTimelinePageSize">
                                <option value="10">10</option>
                                <option value="20" selected>20</option>
                                <option value="30">30</option>
                                <option value="all">All</option>
                            </select>
                        </div>
                        <div class="sh-filter-actions">
                            <button class="btn btn-secondary btn-sm" id="shClearFilters" type="button">Clear</button>
                        </div>
                    </div>
                    <div class="sh-result-count" id="shResultCount"></div>
                </div>

                <!-- Folders: narrow nav on the left, wide content panel on the right -->
                <div id="shFolderGrid" class="sh-folder-layout" style="display:none;">
                    <div class="sh-folder-nav" id="shFolderNav">
                        <div class="sh-folder-tab" data-folder="personal">
                            <div class="sh-folder-icon"><i class="fas fa-id-card"></i></div>
                            <div>
                                <div class="sh-folder-title">Personal Information</div>
                                <div class="sh-folder-subtitle">Profile &amp; contact details</div>
                            </div>
                        </div>

                        <div class="sh-folder-tab" data-folder="referrals">
                            <div class="sh-folder-icon"><i class="fas fa-file-alt"></i></div>
                            <div>
                                <div class="sh-folder-title">Referrals</div>
                                <div class="sh-folder-subtitle">Intake &amp; screening records</div>
                            </div>
                            <div class="sh-folder-count" id="shCount-referrals">0</div>
                        </div>

                        <div class="sh-folder-tab" data-folder="counseling">
                            <div class="sh-folder-icon"><i class="fas fa-comments"></i></div>
                            <div>
                                <div class="sh-folder-title">Counseling Sessions</div>
                                <div class="sh-folder-subtitle">Case scenarios &amp; notes</div>
                            </div>
                            <div class="sh-folder-count" id="shCount-counseling">0</div>
                        </div>

                        <div class="sh-folder-tab" data-folder="follow_ups">
                            <div class="sh-folder-icon"><i class="fas fa-calendar-check"></i></div>
                            <div>
                                <div class="sh-folder-title">Counseling Appointment Span</div>
                                <div class="sh-folder-subtitle">Follow-up sessions over time</div>
                            </div>
                            <div class="sh-folder-count" id="shCount-follow_ups">0</div>
                        </div>

                        <div class="sh-folder-tab" data-folder="appointments">
                            <div class="sh-folder-icon"><i class="fas fa-calendar-day"></i></div>
                            <div>
                                <div class="sh-folder-title">Online Appointments</div>
                                <div class="sh-folder-subtitle">Student-requested visits</div>
                            </div>
                            <div class="sh-folder-count" id="shCount-appointments">0</div>
                        </div>
                    </div>

                    <div class="sh-folder-content">
                        <div class="sh-folder-content-header">
                            <div>
                                <div class="sh-timeline-eyebrow">Activity Log &middot; Guidance Portal</div>
                                <div class="sh-folder-content-title" id="shActiveFolderTitle">Recent History</div>
                            </div>
                        </div>
                        <div class="sh-folder-body" id="shBody-personal"></div>
                        <div class="sh-folder-body sh-timeline" id="shBody-timeline"></div>
                        <div id="shTimelinePagination" class="sh-slist-pagination"></div>
                    </div>
                </div>

                <!-- Empty / loading states -->
                <div id="shEmptyState" class="sh-empty-state" style="display:none;">
                    <i class="fas fa-folder-open"></i>
                    <h3>No student selected</h3>
                    <p>Search for a student above to open their full guidance history.</p>
                </div>
                <div id="shLoadingState" class="sh-loading" style="display:none;">Loading student history…</div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/counselor/student-history.js') }}?v={{ filemtime(public_path('pages/counselor/student-history.js')) }}"></script>
</body>
</html>
