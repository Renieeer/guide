<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Schedule - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <style>
        .page-content {
            display: flex !important;
            flex-direction: column !important;
            padding: 30px 20px !important;
        }
        
        .schedule-calendar-card {
            width: 100% !important;
            margin-bottom: 40px !important;
        }
        
        .table-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
        }
        
        .table-container table {
            width: 100% !important;
            margin: 0 auto !important;
            border-collapse: collapse !important;
        }
    </style>
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-other-school')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-calendar3-week"></i> Calendar</div>
                    <h2 class="page-hero-title">Counseling Schedule</h2>
                    <p class="page-hero-text">Schedule counseling sessions, view appointments, and manage your availability.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Appointment Calendar -->
                <div class="schedule-calendar-card">
                    <div class="schedule-calendar-header">
                            <div class="schedule-calendar-title">
                                <div class="schedule-calendar-icon"><i class="bi bi-calendar3"></i></div>
                            <div>
                                <h2>Appointment Calendar</h2>
                                <p>Review counseling sessions and add events by day.</p>
                            </div>
                        </div>
                        <div class="schedule-calendar-actions">
                            <!-- Add Schedule button removed per request -->
                            <button type="button" class="schedule-calendar-nav" id="schedulePrevMonth" aria-label="Previous month">
                                <i class="bi bi-chevron-left"></i>
                            </button>
                            <div class="schedule-calendar-month" id="scheduleCalendarMonth">May 2026</div>
                            <button type="button" class="schedule-calendar-nav" id="scheduleNextMonth" aria-label="Next month">
                                <i class="bi bi-chevron-right"></i>
                            </button>
                            <select id="scheduleViewSelect" class="schedule-calendar-view" disabled>
                                <option>Month View</option>
                            </select>
                            <button type="button" class="btn btn-outline-primary" id="scheduleTodayBtn">Today</button>
                        </div>
                    </div>
                    <div class="schedule-legend">
                        <span class="schedule-legend-item cat-event"><i class="bi bi-calendar2-week"></i> Event</span>
                        <span class="schedule-legend-item cat-online"><i class="bi bi-laptop"></i> Online Appointment</span>
                        <span class="schedule-legend-item cat-counseling"><i class="bi bi-person-check-fill"></i> Counseling Appointment</span>
                    </div>
                    <div style="padding: 12px; background: #f8fafc; min-height: 600px; display: flex;">
                        <div style="flex:1; overflow-y:auto;">
                            <div id="scheduleCalendar"></div>
                        </div>
                    </div>
                </div>

                <!-- Student Appointment Requests -->
                <div class="table-container mb-5">
                    <h2 class="mb-4"><i class="bi bi-hourglass-split"></i> Student Appointment Requests</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Requested Date</th>
                                <th>Time</th>
                                <th>Reason</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="appointmentRequestsBody">
                            <tr>
                                <td colspan="6" class="text-center p-5 text-muted">No appointment requests yet</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Edit Appointment Modal -->
    <div id="editAppointmentModal" class="modal" style="display: none;">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Edit Appointment Request</h2>
                <span class="modal-close" onclick="closeEditModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="editAppointmentForm">
                    <div class="form-group">
                        <label>Student Name</label>
                        <input type="text" id="editStudentName" readonly style="background-color: #f5f5f5;">
                    </div>
                    <div class="form-group">
                        <label for="editAppointmentDate">Date *</label>
                        <input type="date" id="editAppointmentDate" required>
                    </div>
                    <div class="form-group">
                        <label for="editAppointmentTime">Time *</label>
                        <select id="editAppointmentTime" required>
                            <option value="">Select a time...</option>
                            <optgroup label="Morning (8:00 AM - 12:00 PM)">
                                <option value="08:00">8:00 AM</option>
                                <option value="08:30">8:30 AM</option>
                                <option value="09:00">9:00 AM</option>
                                <option value="09:30">9:30 AM</option>
                                <option value="10:00">10:00 AM</option>
                                <option value="10:30">10:30 AM</option>
                                <option value="11:00">11:00 AM</option>
                                <option value="11:30">11:30 AM</option>
                            </optgroup>
                            <optgroup label="Afternoon (1:00 PM - 4:00 PM)">
                                <option value="13:00">1:00 PM</option>
                                <option value="13:30">1:30 PM</option>
                                <option value="14:00">2:00 PM</option>
                                <option value="14:30">2:30 PM</option>
                                <option value="15:00">3:00 PM</option>
                                <option value="15:30">3:30 PM</option>
                            </optgroup>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editAppointmentLocation">Location/Office</label>
                        <input type="text" id="editAppointmentLocation" placeholder="e.g., Counseling Office, Room 101">
                    </div>
                    <div class="form-group">
                        <label for="editAppointmentNotes">Notes</label>
                        <textarea id="editAppointmentNotes" style="min-height: 80px;"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-success">Save Changes</button>
                        <button type="button" class="btn btn-secondary" onclick="closeEditModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- View Request Modal -->
    <div id="requestModal" class="modal" style="display: none;">
        <div class="modal-content view-event-modal-new">
            <div class="view-modal-header">
                <h2 id="requestModalTitle">Appointment Request</h2>
                <span class="modal-close" onclick="closeRequestModal()" style="cursor: pointer;">&times;</span>
            </div>
            <div class="view-modal-body">
                <div class="event-detail-section">
                    <div class="event-detail-icon">
                        <i class="bi bi-person"></i>
                    </div>
                    <div class="event-detail-content">
                        <h3 class="event-detail-title">Student Name</h3>
                        <p id="requestStudentName" class="event-detail-text"></p>
                    </div>
                </div>
                <div class="event-detail-section">
                    <div class="event-detail-icon">
                        <i class="bi bi-pen"></i>
                    </div>
                    <div class="event-detail-content">
                        <h3 class="event-detail-title">Reason</h3>
                        <p id="requestReason" class="event-detail-text"></p>
                    </div>
                </div>
                <div class="event-detail-section">
                    <div class="event-detail-icon">
                        <i class="bi bi-clock"></i>
                    </div>
                    <div class="event-detail-content">
                        <h3 class="event-detail-title">Requested Date & Time</h3>
                        <p id="requestDateTime" class="event-detail-text"></p>
                    </div>
                </div>
                <div class="event-detail-section">
                    <div class="event-detail-icon">
                        <i class="bi bi-hourglass-split"></i>
                    </div>
                    <div class="event-detail-content">
                        <h3 class="event-detail-title">Status</h3>
                        <p id="requestStatus" class="event-detail-text"></p>
                    </div>
                </div>
                <div class="event-detail-section" id="requestNotesSection" style="display:none;">
                    <div class="event-detail-icon">
                        <i class="bi bi-journal-text"></i>
                    </div>
                    <div class="event-detail-content">
                        <h3 class="event-detail-title">Student Notes</h3>
                        <p id="requestNotes" class="event-detail-text"></p>
                    </div>
                </div>
            </div>
                <div class="view-modal-footer">
                <button type="button" class="btn btn-success" id="approveRequestBtn" onclick="approveAppointmentFromModal()">
                    <i class="bi bi-check-lg"></i> Approve
                </button>
                <button type="button" class="btn btn-warning" id="proposeChangeBtn" onclick="proposeChangesFromModal()">
                    <i class="bi bi-pencil-square"></i> Propose Changes
                </button>
                <button type="button" class="btn btn-danger" id="rejectRequestBtn" onclick="rejectRequestFromModal()">
                    <i class="bi bi-x-lg"></i> Reject
                </button>
            </div>
        </div>
    </div>

    <!-- Decline Appointment Modal -->
    <div id="declineAppointmentModal" class="modal" style="display: none;">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Decline Appointment Request</h2>
                <span class="modal-close" onclick="closeDeclineModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="declineAppointmentForm">
                    <div class="form-group">
                        <label>Student Name</label>
                        <input type="text" id="declineStudentName" readonly style="background-color: #f5f5f5;">
                    </div>
                    <div class="form-group">
                        <label for="declineReason">Reason for Declining *</label>
                        <textarea id="declineReason" placeholder="Explain why you are declining this appointment request..." required style="min-height: 100px;"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="suggestAlternative">Suggest Alternative (Optional)</label>
                        <textarea id="suggestAlternative" placeholder="Suggest a different time or provide guidance on next steps..." style="min-height: 80px;"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-danger"><i class="bi bi-x-lg"></i> Decline Request</button>
                        <button type="button" class="btn btn-secondary" onclick="closeDeclineModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- View Event Modal (created dynamically by JS) -->

    <!-- Create Schedule Modal (opened by calendar day click) -->
    <div id="createScheduleModal" class="modal" style="display: none;">
        <div class="modal-content schedule-create-modal">
            <div class="modal-header">
                <h2><i class="bi bi-calendar-plus"></i> Create Schedule</h2>
                <span class="modal-close" id="closeCreateScheduleModal">&times;</span>
            </div>
            <div class="modal-body">
                <form id="createScheduleModalForm">
                    <div class="form-group">
                        <label for="modalEventTitle"><i class="bi bi-card-text"></i> Title</label>
                        <input type="text" id="modalEventTitle" placeholder="Enter title" required>
                    </div>

                    <div class="schedule-modal-section">
                        <span class="schedule-modal-section-label"><i class="bi bi-calendar3"></i> Date &amp; Time</span>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="modalEventStart">Start Date</label>
                                <input type="text" id="modalEventStart" readonly>
                            </div>
                            <div class="form-group">
                                <label for="modalEventEnd">End Date</label>
                                <input type="date" id="modalEventEnd">
                            </div>
                        </div>
                        <small class="text-muted schedule-modal-hint">End date is only needed for events spanning more than one day.</small>

                        <label class="modal-checkbox schedule-modal-allday">
                            <input type="checkbox" id="modalEventAllDay">
                            <span>All Day</span>
                        </label>

                        <div id="modalEventTimeFields">
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="modalEventStartTime">Start Time *</label>
                                    <select id="modalEventStartTime">
                                        <option value="">Select a time...</option>
                                        <optgroup label="Morning (8:00 AM - 12:00 PM)">
                                            <option value="08:00">8:00 AM</option>
                                            <option value="08:30">8:30 AM</option>
                                            <option value="09:00">9:00 AM</option>
                                            <option value="09:30">9:30 AM</option>
                                            <option value="10:00">10:00 AM</option>
                                            <option value="10:30">10:30 AM</option>
                                            <option value="11:00">11:00 AM</option>
                                            <option value="11:30">11:30 AM</option>
                                        </optgroup>
                                        <optgroup label="Afternoon (1:00 PM - 4:00 PM)">
                                            <option value="13:00">1:00 PM</option>
                                            <option value="13:30">1:30 PM</option>
                                            <option value="14:00">2:00 PM</option>
                                            <option value="14:30">2:30 PM</option>
                                            <option value="15:00">3:00 PM</option>
                                            <option value="15:30">3:30 PM</option>
                                        </optgroup>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="modalEventEndTime">End Time *</label>
                                    <select id="modalEventEndTime">
                                        <option value="">Select a time...</option>
                                        <optgroup label="Morning (8:00 AM - 12:00 PM)">
                                            <option value="08:30">8:30 AM</option>
                                            <option value="09:00">9:00 AM</option>
                                            <option value="09:30">9:30 AM</option>
                                            <option value="10:00">10:00 AM</option>
                                            <option value="10:30">10:30 AM</option>
                                            <option value="11:00">11:00 AM</option>
                                            <option value="11:30">11:30 AM</option>
                                            <option value="12:00">12:00 PM</option>
                                        </optgroup>
                                        <optgroup label="Afternoon (1:00 PM - 4:00 PM)">
                                            <option value="13:30">1:30 PM</option>
                                            <option value="14:00">2:00 PM</option>
                                            <option value="14:30">2:30 PM</option>
                                            <option value="15:00">3:00 PM</option>
                                            <option value="15:30">3:30 PM</option>
                                            <option value="16:00">4:00 PM</option>
                                        </optgroup>
                                    </select>
                                </div>
                            </div>
                            <small class="text-muted schedule-modal-hint">Blocks this time window — students can only book online appointments outside it.</small>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="modalEventDescription"><i class="bi bi-chat-left-text"></i> Description</label>
                        <textarea id="modalEventDescription" rows="5"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="modalEventLabel"><i class="bi bi-tag"></i> Label</label>
                        <select id="modalEventLabel">
                            <option value="None">None</option>
                            <option value="Meeting">Meeting</option>
                            <option value="Training">Training</option>
                            <option value="Event">Event</option>
                            <option value="Review">Review</option>
                            <option value="Notes">Notes</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-success"><i class="bi bi-check-lg"></i> Save Event</button>
                        <button type="button" class="btn btn-secondary" id="cancelCreateScheduleModal">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/other-school/schedule.js') }}?v={{ filemtime(public_path('pages/other-school/schedule.js')) }}"></script>
</body>
</html>
