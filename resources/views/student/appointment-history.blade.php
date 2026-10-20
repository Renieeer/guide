<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My History - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="{{ asset('css/student-history.css') }}?v={{ filemtime(public_path('css/student-history.css')) }}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <style>
        /* Folder-card picker was pure duplication of the Record Type
           dropdown already in the filter bar above it (the counselor/
           other-school twins of this page later got the same treatment —
           see project_student_history_timeline memory). Hidden rather than
           removed from the DOM — student-history.js still updates
           #shCount-* on every render regardless of visibility.
           grid-template-columns (not display — JS sets that inline via
           style.display='grid', which would win over a display override
           here) is collapsed to one column so the content panel takes the
           full width instead of leaving an empty 300px gap on the left. */
        #shFolderNav {
            display: none;
        }
        #shFolderGrid.sh-folder-layout {
            grid-template-columns: 1fr;
        }
    </style>
</head>
<body>
    <div class="main-wrapper">
        @include('partials.sidebar-student')
        <div class="main-content">
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-clock-history"></i> Records</div>
                    <h2 class="page-hero-title">My History</h2>
                    <p class="page-hero-text">Every referral, counseling case, follow-up, and online appointment on your record — organized as folders you can open, with filters to find things fast.</p>
                </div>
            </div>

            <div class="page-content">
                <!-- Summary -->
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
                                <div class="sh-folder-subtitle">Your requested visits</div>
                            </div>
                            <div class="sh-folder-count" id="shCount-appointments">0</div>
                        </div>
                    </div>

                    <div class="sh-folder-content">
                        <div class="sh-folder-content-header">
                            <div class="sh-folder-content-title" id="shActiveFolderTitle">Recent History</div>
                        </div>
                        <div class="sh-folder-body active" id="shBody-timeline"></div>
                        <div id="shTimelinePagination" class="sh-slist-pagination"></div>
                    </div>
                </div>

                <!-- Empty / loading states -->
                <div id="shEmptyState" class="sh-empty-state">
                    <i class="fas fa-folder-open"></i>
                    <h3>Loading your history…</h3>
                    <p>Hang tight while we gather your records.</p>
                </div>
                <div id="shLoadingState" class="sh-loading" style="display:none;">Loading your history…</div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/student/appointment-history.js') }}?v={{ filemtime(public_path('pages/student/appointment-history.js')) }}"></script>
</body>
</html>
