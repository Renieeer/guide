<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Referral Status - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-teacher')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-diagram-3"></i> Tracking</div>
                    <h2 class="page-hero-title">Referral Status</h2>
                    <p class="page-hero-text">Check the status of all referrals you have submitted and receive updates on student outcomes.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <div id="referralDetailContainer" style="display: none;">
                    <!-- Referral Details -->
                    <div class="card mb-5">
                        <h2 class="card-title">Referral Details</h2>
                        <div class="form-row">
                            <div>
                                <p><strong>Referral ID:</strong> <span id="refId"></span></p>
                                <p><strong>Student Name:</strong> <span id="refStudentName"></span></p>
                                <p><strong>Grade:</strong> <span id="refGrade"></span></p>
                            </div>
                            <div>
                                <p><strong>Date Submitted:</strong> <span id="refDateSubmitted"></span></p>
                                <p><strong>Urgency:</strong> <span id="refUrgency"></span></p>
                                <p><strong>Status:</strong> <span id="refStatus"></span></p>
                            </div>
                        </div>

                        <!-- Reason/Description (hidden while counseling is in progress) -->
                        <div id="referralInfoSection" class="mt-4" style="display: none;">
                            <p><strong>Reason:</strong> <span id="refReason"></span></p>
                            <p><strong>Description:</strong> <span id="refDescription"></span></p>
                        </div>
                    </div>

                    <!-- Acknowledgement Form (Visible only when counseling is complete - Stage 6) -->
                    <div class="card mt-5" id="acknowledgementSection" style="display: none;">
                        <h2 class="card-title">Counseling Referral Acknowledgement Form</h2>
                        <div id="acknowledgementForm" class="referral-paper">
                            <!-- Acknowledgement content will be inserted here by JS -->
                        </div>
                        <div class="mt-4" id="printActionSection">
                            <button class="btn btn-primary" onclick="window.print()">
                                <i class="bi bi-printer"></i> Print Form
                            </button>
                        </div>
                    </div>

                    <div class="mt-5">
                        <button type="button" class="btn btn-secondary" onclick="exitReferralDetail()">Back</button>
                    </div>
                </div>

                <!-- Referral Not Found or List View -->
                <div id="referralListContainer">
                    <div class="table-container">
                        <h2 class="mb-4">Your Referrals</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Referral ID</th>
                                    <th>Student Name</th>
                                    <th>Grade</th>
                                    <th>Date Submitted</th>
                                    <th>Reason</th>
                                    <th>Stage</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="referralListBody">
                                <tr>
                                    <td colspan="8" class="text-center p-5 text-muted">
                                        No referrals found. <a href="{{ url('teacher/referral-form') }}">Submit a new referral</a>
                                    </td>
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
    <script src="{{ asset('pages/teacher/referral-status.js') }}?v={{ filemtime(public_path('pages/teacher/referral-status.js')) }}"></script>
</body>
</html>
