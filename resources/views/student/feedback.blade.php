<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Feedback - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <style>
        /* ===== Star rating summary ===== */
        .rating-summary-card {
            display: flex;
            align-items: center;
            gap: 24px;
            flex-wrap: wrap;
        }
        .rating-summary-score {
            font-size: 40px;
            font-weight: 800;
            color: var(--primary-color);
            line-height: 1;
        }
        .rating-summary-stars i { color: #f59e0b; font-size: 20px; margin-right: 2px; }
        .rating-summary-stars i.bi-star { color: var(--border-color); }
        .rating-summary-meta { color: var(--text-light); font-size: 13px; margin-top: 4px; }

        /* ===== Star rating input ===== */
        .star-rating-input {
            display: flex;
            gap: 8px;
            font-size: 32px;
        }
        .star-rating-input i {
            color: var(--border-color);
            cursor: pointer;
            transition: var(--transition-fast);
        }
        .star-rating-input i.is-filled { color: #f59e0b; }
        .star-rating-hint {
            margin-top: 8px;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-light);
            min-height: 18px;
        }
        .rating-checkbox-row {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: var(--text-color);
            font-weight: 500;
        }
        .rating-checkbox-row input { width: 16px; height: 16px; cursor: pointer; }

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
        .review-list-empty {
            text-align: center;
            color: var(--text-light);
            padding: 32px 20px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-student')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-star"></i> Assessment</div>
                    <h2 class="page-hero-title">Feedback</h2>
                    <p class="page-hero-text">Rate how your counselor handled your counseling sessions and referrals, and share your comments.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <div class="card mb-5">
                    <h2 class="card-title">Your Average Rating</h2>
                    <div class="rating-summary-card">
                        <div class="rating-summary-score" id="ratingSummaryScore">0.0</div>
                        <div>
                            <div class="rating-summary-stars" id="ratingSummaryStars"></div>
                            <div class="rating-summary-meta" id="ratingSummaryMeta">No ratings submitted yet</div>
                        </div>
                    </div>
                </div>

                <div class="card mb-5">
                    <h2 class="card-title">Rate Your Counselor</h2>
                    <form id="ratingForm">
                        <div class="form-group">
                            <label for="ratingSubjectType">What are you rating? *</label>
                            <select id="ratingSubjectType" name="ratingSubjectType" required>
                                <option value="">Select a category</option>
                                <option value="counseling_case">Counseling Session</option>
                                <option value="referral">Referral</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="ratingSubjectId">Which one? *</label>
                            <select id="ratingSubjectId" name="ratingSubjectId" required disabled>
                                <option value="">Select a category first</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Your Rating *</label>
                            <div class="star-rating-input" id="starRatingInput">
                                <i class="bi bi-star" data-value="1"></i>
                                <i class="bi bi-star" data-value="2"></i>
                                <i class="bi bi-star" data-value="3"></i>
                                <i class="bi bi-star" data-value="4"></i>
                                <i class="bi bi-star" data-value="5"></i>
                            </div>
                            <div class="star-rating-hint" id="starRatingHint">Click a star to rate</div>
                        </div>

                        <div class="form-group">
                            <label for="ratingComment">Comment *</label>
                            <textarea id="ratingComment" name="ratingComment" placeholder="Tell us about your experience..." required rows="4"></textarea>
                        </div>

                        <div class="form-group">
                            <label class="rating-checkbox-row">
                                <input type="checkbox" id="ratingAnonymous" name="ratingAnonymous">
                                Submit anonymously
                            </label>
                        </div>

                        <div class="form-actions">
                            <button type="submit" class="btn btn-success">Submit Rating</button>
                            <button type="button" class="btn btn-secondary" id="clearRatingFormBtn">Clear</button>
                        </div>
                    </form>
                    <div id="ratingEmptyState" style="display: none; text-align: center; padding: 30px; color: #999;">
                        You don't have any counseling sessions or referrals on record yet. Once you have one, you'll be able to rate it here.
                    </div>
                </div>

                <h2 class="mb-4">Your Ratings History</h2>
                <div class="review-card-list" id="myRatingsList"></div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/student/feedback.js') }}"></script>
</body>
</html>
