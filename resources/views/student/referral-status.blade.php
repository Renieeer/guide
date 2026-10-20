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
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-student')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-diagram-3"></i> Tracking</div>
                    <h2 class="page-hero-title">Referral Status</h2>
                    <p class="page-hero-text">View referrals made about you and track their progress through the guidance process.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Progress Overview -->
                <div id="progressContainer" style="display: none; margin-bottom: 25px;">
                    <div class="card">
                        <h2 style="margin-top: 0; margin-bottom: 20px;">Referral Progress</h2>
                        <div id="referralProgressList" style="max-height: 500px; overflow-y: auto;">
                            <!-- Progress cards will be rendered here -->
                        </div>
                    </div>
                </div>

                <!-- Referrals Table -->
                <div class="table-container" id="referralsTableContainer">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Reason</th>
                                <th>Submitted By</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="referralsTableBody">
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 30px; color: #999;">No referrals yet</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Referral Details Modal -->
                <div id="referralModal" class="modal">
                    <div class="modal-content" style="max-width: 700px; margin: auto; max-height: 90vh; overflow-y: auto;">
                        <div class="modal-header">
                            <h2>Referral Form Details</h2>
                            <button class="modal-close" id="closeReferralModal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <!-- Student Information -->
                            <h4 style="margin-top: 20px; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Student Information</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Student Name</label>
                                    <input type="text" id="refStudentName" readonly>
                                </div>
                                <div class="form-group">
                                    <label>Student ID</label>
                                    <input type="text" id="refStudentId" readonly>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Grade</label>
                                    <input type="text" id="refGrade" readonly>
                                </div>
                                <div class="form-group">
                                    <label>Section</label>
                                    <input type="text" id="refSection" readonly>
                                </div>
                                <div class="form-group">
                                    <label>Age</label>
                                    <input type="text" id="refAge" readonly>
                                </div>
                                <div class="form-group">
                                    <label>Gender</label>
                                    <input type="text" id="refGender" readonly>
                                </div>
                            </div>

                            <!-- Referral Information -->
                            <h4 style="margin-top: 20px; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Referral Details</h4>
                            <div class="form-group">
                                <label>Reason for Referral</label>
                                <textarea id="refReason" readonly rows="3"></textarea>
                            </div>
                            <div class="form-group">
                                <label>Description</label>
                                <textarea id="refDescription" readonly rows="3"></textarea>
                            </div>
                            <div class="form-group">
                                <label>Intervention Attempts</label>
                                <textarea id="refIntervention" readonly rows="3"></textarea>
                            </div>
                            <div class="form-group">
                                <label>Observed Behaviors</label>
                                <textarea id="refBehaviors" readonly rows="3"></textarea>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Urgency Level</label>
                                    <input type="text" id="refUrgency" readonly>
                                </div>
                                <div class="form-group">
                                    <label>Submitted By</label>
                                    <input type="text" id="refTeacher" readonly>
                                </div>
                            </div>

                            <!-- Parent/Guardian Information -->
                            <h4 style="margin-top: 20px; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Parent/Guardian Information</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Parent/Guardian Name</label>
                                    <input type="text" id="refParent" readonly>
                                </div>
                                <div class="form-group">
                                    <label>Contact Number</label>
                                    <input type="text" id="refParentContact" readonly>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="text" id="refParentEmail" readonly>
                            </div>
                            <div class="form-group">
                                <label>Family Background</label>
                                <textarea id="refFamilyBg" readonly rows="3"></textarea>
                            </div>

                            <!-- Status and Progress -->
                            <h4 style="margin-top: 20px; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Status & Progress</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Referral Status</label>
                                    <input type="text" id="refStatus" readonly style="font-weight: bold;">
                                </div>
                                <div class="form-group">
                                    <label>Current Phase</label>
                                    <input type="text" id="refPhase" readonly style="font-weight: bold;">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Date Submitted</label>
                                <input type="text" id="refDateSubmitted" readonly>
                            </div>

                            <!-- Progress Bar -->
                            <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px;">
                                <div style="margin-bottom: 10px;">
                                    <strong style="color: #1f2937;">Referral Progress</strong>
                                </div>
                                <div style="height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden; margin-bottom: 10px;">
                                    <div id="refProgressBar" style="height: 100%; width: 16.67%; background: #f59e0b; transition: width 0.3s ease;"></div>
                                </div>
                                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; font-size: 12px; text-align: center;">
                                    <div style="color: #6b7280;">📋 Interview/Background</div>
                                    <div style="color: #6b7280;">👀 Initial Risk Assessment</div>
                                    <div style="color: #6b7280;">📅 Parent Call-up/Consent</div>
                                    <div style="color: #6b7280;">⚙️ Intervention</div>
                                    <div style="color: #6b7280;">✅ Counseling</div>
                                    <div style="color: #6b7280;">🎯 Student Follow-up</div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-primary" id="closeReferralBtn">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/student/referral-status.js') }}"></script>
</body>
</html>
