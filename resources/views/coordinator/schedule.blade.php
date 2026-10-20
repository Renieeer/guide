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
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-coordinator')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-calendar3-week"></i> Calendar</div>
                    <h2 class="page-hero-title">Schedule Management</h2>
                    <p class="page-hero-text">Plan meetings, coordinate training sessions, and schedule case reviews for your team.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Schedule Calendar -->
                <div class="schedule-calendar-card">
                    <div class="schedule-calendar-header">
                        <div class="schedule-calendar-title">
                            <div class="schedule-calendar-icon"><i class="bi bi-calendar3"></i></div>
                            <div>
                                <h2>Schedule Calendar</h2>
                                <p>Plan meetings, training, and review sessions.</p>
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
                    <div id="scheduleCalendar"></div>
                </div>

                <!-- Schedule Table -->
                <div class="table-container">
                    <h2 class="mb-4">Upcoming Events</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Event Title</th>
                                <th>Type</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Location</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody id="scheduleTableBody">
                            <tr>
                                <td colspan="6" class="text-center p-5 text-muted">No scheduled events yet</td>
                            </tr>
                        </tbody>
                    </table>
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
            </div>

            <!-- Create Schedule Modal -->
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
        </div>
    </div>
    
    <!-- Appointment Request Detail Modal -->
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
    
    <!-- View Event Modal (created dynamically by JS) -->

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/coordinator/schedule.js') }}?v={{ filemtime(public_path('pages/coordinator/schedule.js')) }}"></script>
</body>
</html>
