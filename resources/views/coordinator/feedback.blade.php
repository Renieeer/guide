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
                    <div class="page-hero-eyebrow"><i class="bi bi-chat-dots"></i> Assessment</div>
                    <h2 class="page-hero-title">Feedback & Reports</h2>
                    <p class="page-hero-text">Review feedback from students, teachers, and counselors to improve guidance services.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Submit Feedback Form -->
                <div class="card mb-5">
                    <h2 class="card-title mb-4">Provide Feedback</h2>
                    
                    <form id="feedbackForm">
                        <div class="form-group">
                            <label for="feedbackType">Feedback Type *</label>
                            <select id="feedbackType" name="feedbackType" required>
                                <option value="">Select Type</option>
                                <option value="Suggestion">Suggestion</option>
                                <option value="Issue">Issue/Bug</option>
                                <option value="Compliment">Compliment</option>
                                <option value="Improvement">Area for Improvement</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="feedbackTitle">Feedback Title *</label>
                            <input type="text" id="feedbackTitle" name="feedbackTitle" placeholder="Brief title" required>
                        </div>

                        <div class="form-group">
                            <label for="feedbackContent">Feedback Content *</label>
                            <textarea id="feedbackContent" name="feedbackContent" placeholder="Provide detailed feedback..." required></textarea>
                        </div>

                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="allowResponse" name="allowResponse" checked>
                                Allow response to this feedback
                            </label>
                        </div>

                        <div class="form-actions">
                            <button type="submit" class="btn btn-success">Submit Feedback</button>
                            <button type="reset" class="btn btn-secondary">Clear</button>
                        </div>
                    </form>
                </div>

                <!-- Feedback History -->
                <div class="table-container">
                    <h2 class="mb-4">Your Feedback History</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Title</th>
                                <th>Status</th>
                                <th>Response</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="feedbackTableBody">
                            <tr>
                                <td colspan="6" class="text-center p-5 text-muted">No feedback submitted yet</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/coordinator/feedback.js') }}"></script>
</body>
</html>
