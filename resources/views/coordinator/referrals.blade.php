<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Referrals Management - Guidance Management System</title>
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
                    <div class="page-hero-eyebrow"><i class="bi bi-diagram-3"></i> Case Management</div>
                    <h2 class="page-hero-title">Referrals Management</h2>
                    <p class="page-hero-text">Review and manage all student referrals, track case status, and coordinate with counselors and teachers.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <div id="referralDetailView" style="display: none;">
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h2 class="card-title">Referral Details</h2>
                            <button class="btn btn-secondary btn-sm" onclick="backToList()">Back to List</button>
                        </div>

                        <!-- Referral Overview -->
                        <h3 class="text-primary">Referral Overview</h3>
                        <div class="form-row-three">
                            <p><strong>Teacher:</strong> <span id="detailTeacherName"></span></p>
                            <p><strong>School:</strong> <span id="detailTeacherSchool"></span></p>
                            <p><strong>Contact Number:</strong> <span id="detailTeacherContact"></span></p>
                        </div>
                        <div class="form-row">
                            <p><strong>Parent/Guardian:</strong> <span id="detailParent"></span></p>
                            <p><strong>Contact Number:</strong> <span id="detailContactNum"></span></p>
                        </div>
                        <div class="form-row">
                            <div>
                                <p><strong>Referral ID:</strong> <span id="detailRefId"></span></p>
                                <p><strong>Student Name:</strong> <span id="detailStudentName"></span></p>
                                <p><strong>Student ID:</strong> <span id="detailStudentId"></span></p>
                                <p><strong>Grade:</strong> <span id="detailGrade"></span></p>
                                <p><strong>Age:</strong> <span id="detailAge"></span></p>
                                <p><strong>Gender:</strong> <span id="detailGender"></span></p>
                            </div>
                            <div>
                                <p><strong>Date Submitted:</strong> <span id="detailDateSubmitted"></span></p>
                                <p><strong>Urgency:</strong> <span id="detailUrgency"></span></p>
                                <p><strong>Status:</strong> <span id="detailStatus"></span></p>
                                <p><strong>Current Stage:</strong> <span id="detailStage"></span><span id="detailStageNote" class="text-muted"></span></p>
                            </div>
                        </div>
                        <p><strong>Reason for Referral:</strong> <span id="ovReason"></span></p>

                        <hr style="margin: 20px 0;">

                        <!-- Stage Progress -->
                        <h3 class="text-primary">Referral Progress</h3>
                        <div id="stageProgressContainer"></div>

                        <hr style="margin: 20px 0;">

                        <!-- Referral Reason & Description -->
                        <h3 class="text-primary">Referral Information</h3>
                        <div class="referral-info-columns">
                            <div>
                                <p><strong>Initial Actions Taken:</strong> <span id="detailIntervention"></span></p>
                            </div>
                            <div>
                                <p><strong>Description:</strong> <span id="detailDescription"></span></p>
                            </div>
                        </div>

                        <hr style="margin: 20px 0;">

                        <!-- Assessment Document (Stage 2) - read-only view of whatever the
                             counselor uploaded; coordinators review, they don't upload. -->
                        <h3 class="text-primary">Assessment Document (Stage 2)</h3>
                        <div id="assessmentFileList" style="margin-bottom: 20px;"></div>

                        <hr style="margin: 20px 0;">

                        <!-- Coordinator Actions -->
                        <h3 class="text-primary">Coordinator Actions</h3>
                        <div id="coordinatorActionsContainer"></div>
                    </div>
                </div>

                <div id="referralListView">
                    <!-- Filters -->
                    <div class="card" style="margin-bottom: 20px;">
                        <div class="filter-bar" style="display: grid; grid-template-columns: auto auto auto auto 1fr; gap: 15px; align-items: end;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Status</label>
                                <select id="statusFilter" style="padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                                    <option value="">All</option>
                                    <option value="pending">Pending</option>
                                    <option value="in-progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Urgency</label>
                                <select id="urgencyFilter" style="padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                                    <option value="">All</option>
                                    <option value="normal">Normal</option>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Stage</label>
                                <select id="stageFilter" style="padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                                    <option value="">All</option>
                                    <option value="1">Stage 1</option>
                                    <option value="2">Stage 2</option>
                                    <option value="3">Stage 3</option>
                                    <option value="4">Stage 4</option>
                                    <option value="5">Stage 5</option>
                                    <option value="6">Stage 6</option>
                                    <option value="7">Stage 7</option>
                                </select>
                            </div>
                            <button class="btn btn-primary" onclick="applyFilters()">Filter</button>
                            <button class="btn btn-secondary" onclick="clearFilters()">Clear</button>
                        </div>
                    </div>

                    <!-- Referrals Table -->
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Referral ID</th>
                                    <th>Student Name</th>
                                    <th>Grade</th>
                                    <th>Reason</th>
                                    <th>Submitted By</th>
                                    <th>Date</th>
                                    <th>Urgency</th>
                                    <th>Stage</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="referralsTableBody">
                                <tr>
                                    <td colspan="10" class="text-center p-5 text-muted">No referrals found</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Update Stage Modal -->
    <div id="updateStageModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Update Referral Stage</h2>
                <button class="modal-close" onclick="closeModal('updateStageModal')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="newStage">Select New Stage</label>
                    <select id="newStage">
                        <option value="1">Stage 1: Interview/Background</option>
                        <option value="2">Stage 2: Initial Risk Assessment</option>
                        <option value="3">Stage 3: Parent Call-up/Consent</option>
                        <option value="4">Stage 4: Intervention</option>
                        <option value="5">Stage 5: Counseling</option>
                        <option value="6">Stage 6: Student Follow-up</option>
                        <option value="7">Stage 7: Case Closing</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="stageNotes">Notes</label>
                    <textarea id="stageNotes" placeholder="Add notes about this stage update..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary" onclick="saveStageUpdate()">Update Stage</button>
                <button class="btn btn-secondary" onclick="closeModal('updateStageModal')">Cancel</button>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/coordinator/referrals.js') }}?v={{ filemtime(public_path('pages/coordinator/referrals.js')) }}"></script>
</body>
</html>
