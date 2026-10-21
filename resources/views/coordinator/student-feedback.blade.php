<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Feedback - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <style>
        /* ===== Rating overview stats ===== */
        .rating-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }
        .rating-stats-grid .card-stats i { font-size: 24px; color: #f59e0b; -webkit-text-fill-color: #f59e0b; }

        /* ===== Filters ===== */
        .rating-filters {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 20px;
        }
        .rating-filters select {
            padding: 10px 14px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            font-size: 13.5px;
            font-family: inherit;
            background: white;
            min-width: 160px;
        }
        .rating-search {
            position: relative;
            flex: 1;
            min-width: 220px;
        }
        .rating-search i {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-light);
            font-size: 14px;
        }
        .rating-search input {
            width: 100%;
            padding: 10px 14px 10px 38px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            font-size: 13.5px;
            font-family: inherit;
        }

        /* ===== Review cards ===== */
        .review-card-list {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        .review-card {
            background: white;
            border: 1px solid var(--border-soft);
            border-radius: 10px;
            padding: 16px 18px;
        }
        .review-card-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
        }
        .star-display i { color: #f59e0b; font-size: 15px; margin-right: 1px; }
        .star-display i.bi-star { color: var(--border-color); }
        .review-date { font-size: 12px; color: var(--text-light); }
        .review-counselor {
            font-size: 12.5px;
            font-weight: 700;
            color: var(--secondary-color);
            text-transform: uppercase;
            letter-spacing: 0.02em;
            margin-top: 8px;
        }
        .review-subject { font-size: 12px; color: var(--text-light); margin-top: 2px; }
        .review-comment { font-size: 14px; color: var(--text-color); margin-top: 6px; line-height: 1.5; }
        .review-card-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid var(--border-soft);
        }
        .review-student-name { font-size: 12.5px; font-weight: 600; color: var(--text-color); }
        .review-list-empty {
            text-align: center;
            color: var(--text-light);
            padding: 32px 20px;
            font-size: 13px;
        }
    </style>
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-coordinator')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-star"></i> Communication</div>
                    <h2 class="page-hero-title">Student Feedback</h2>
                    <p class="page-hero-text">See how students rated every counselor and read their comments. This is a read-only view.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <div class="rating-stats-grid">
                    <div class="card">
                        <h2 class="card-title">Average Rating</h2>
                        <div class="card-stats" id="ratingAvgStat">0.0 <i class="bi bi-star-fill"></i></div>
                        <div class="card-content" id="ratingAvgMeta">No ratings yet</div>
                    </div>
                    <div class="card">
                        <h2 class="card-title">Total Ratings</h2>
                        <div class="card-stats" id="ratingCountStat">0</div>
                        <div class="card-content">All submissions received</div>
                    </div>
                </div>

                <div class="rating-filters">
                    <!-- Populated from the distinct counselorName values
                         actually present in the data (see
                         populateCounselorFilter() in student-feedback.js) —
                         hidden entirely when there's only one counselor,
                         since filtering has nothing to narrow down. -->
                    <select id="ratingCounselorFilter" style="display:none;">
                        <option value="">All Counselors</option>
                    </select>
                    <select id="ratingStarFilter">
                        <option value="">All Star Ratings</option>
                        <option value="5">5 Stars</option>
                        <option value="4">4 Stars</option>
                        <option value="3">3 Stars</option>
                        <option value="2">2 Stars</option>
                        <option value="1">1 Star</option>
                    </select>
                    <div class="rating-search">
                        <i class="bi bi-search"></i>
                        <input type="text" id="ratingSearchInput" placeholder="Search comments...">
                    </div>
                </div>

                <div class="review-card-list" id="ratingsList"></div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/coordinator/student-feedback.js') }}"></script>
</body>
</html>
