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
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-student')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero" style="display:flex; align-items:center; justify-content:space-between; gap:20px;">
                <div style="flex:1;">
                    <div class="page-hero-eyebrow"><i class="bi bi-calendar3-week"></i> Calendar</div>
                    <h2 class="page-hero-title">My Schedule</h2>
                    <p class="page-hero-text">View your scheduled appointments with your counselor and request new sessions.</p>
                </div>
                <div class="page-hero-user" style="min-width:180px; display:flex; align-items:center; justify-content:flex-end; gap:12px;">
                    <div class="user-info" style="display:flex; align-items:center; gap:10px;">
                        <div class="user-avatar" id="userAvatar" style="background:#2563eb; color:white; width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:700;">ST</div>
                        <div class="page-hero-user-text" style="text-align:right;">
                            <div id="userName" style="font-weight:700;">Student</div>
                            <small id="userRole" style="color: #64748b;">Student</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- Calendar View -->
                <div class="schedule-calendar-card">
                    <div class="schedule-calendar-header">
                        <div class="schedule-calendar-title">
                            <div class="schedule-calendar-icon">
                                <i class="bi bi-calendar3"></i>
                            </div>
                            <div>
                                <h2>Appointment Calendar</h2>
                                <p>Review counseling sessions and add events by day.</p>
                            </div>
                        </div>
                        <div class="schedule-calendar-actions">
                            <button type="button" class="schedule-calendar-nav" id="schedulePrevMonth" aria-label="Previous month">
                                <i class="bi bi-chevron-left"></i>
                            </button>
                            <div class="schedule-calendar-month" id="scheduleCalendarMonth">May 2026</div>
                            <button type="button" class="schedule-calendar-nav" id="scheduleNextMonth" aria-label="Next month">
                                <i class="bi bi-chevron-right"></i>
                            </button>

                            <select class="schedule-calendar-view" id="scheduleViewSelect" disabled>
                                <option>Month View</option>
                            </select>

                            <button type="button" class="btn btn-outline-primary" id="scheduleTodayBtn">Today</button>
                            <button type="button" class="btn btn-primary" id="requestAppointmentBtn" style="margin-left: auto;">
                                <i class="bi bi-person-plus"></i> Request Appointment
                            </button>
                        </div>
                    </div>
                    <div class="schedule-legend">
                        <span class="schedule-legend-item cat-event"><i class="bi bi-calendar2-week"></i> Event</span>
                        <span class="schedule-legend-item cat-online"><i class="bi bi-laptop"></i> Online Appointment</span>
                        <span class="schedule-legend-item cat-counseling"><i class="bi bi-person-check-fill"></i> Counseling Appointment</span>
                    </div>
                    <div class="schedule-calendar-body" style="padding: 20px; background: #f8fafc; display: flex; gap: 20px; min-height: 600px;">
                        <!-- Appointment Request Form Panel (Left) -->
                        <div id="appointmentFormPanel" style="flex: 0 0 35%; display: none; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: white; overflow-y: auto;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h3 style="margin: 0;">Request Appointment</h3>
                                <button type="button" id="closeFormPanel" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
                            </div>
                            <form id="appointmentRequestForm">
                                <div class="form-group" style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #1e293b;">Preferred Date</label>
                                    <input type="date" id="appointmentDateInput" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 14px;">
                                    <small style="color: #64748b; display: block; margin-top: 5px;">Times already blocked by a scheduled event or another student's appointment will be greyed out below</small>
                                </div>
                                <div class="form-group" style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #1e293b;">Preferred Time</label>
                                    <select id="appointmentTimeInput" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 14px;">
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
                                    <small style="color: #64748b; display: block; margin-top: 5px;">School hours only: 8:00 AM–12:00 PM and 1:00 PM–4:00 PM</small>
                                </div>
                                <div class="form-group" style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #1e293b;">Reason</label>
                                    <select id="appointmentReasonSelect" required style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 14px;">
                                        <option value="">Select a reason...</option>
                                        <option value="academic-concerns">Academic Concerns</option>
                                        <option value="behavioral-issues">Behavioral Issues</option>
                                        <option value="personal-issues">Personal Issues</option>
                                        <option value="college-planning">College Planning</option>
                                        <option value="general-consultation">General Consultation</option>
                                    </select>
                                </div>
                                <div class="form-group" style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #1e293b;">Additional Notes</label>
                                    <textarea id="appointmentNotesInput" rows="4" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 14px; resize: vertical;"></textarea>
                                </div>
                                <button type="submit" class="btn btn-primary" style="width: 100%; padding: 10px; margin-top: 10px;">
                                    <i class="bi bi-send"></i> Request Appointment
                                </button>
                            </form>
                        </div>

                        <!-- Calendar (Right) -->
                        <div style="flex: 1; overflow-y: auto;">
                            <div id="scheduleCalendar"></div>
                        </div>
                    </div>
                </div>

                <!-- Appointment Details Modal -->
                <div id="appointmentModal" class="modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>Appointment Details</h2>
                            <button class="modal-close" id="closeAppointmentModal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="form-group">
                                <label>Date</label>
                                <input type="text" id="appointmentDate" readonly>
                            </div>
                            <div class="form-group">
                                <label>Time</label>
                                <input type="text" id="appointmentTime" readonly>
                            </div>
                            <div class="form-group">
                                <label>Counselor</label>
                                <input type="text" id="appointmentCounselor" readonly>
                            </div>
                            <div class="form-group">
                                <label>Location</label>
                                <input type="text" id="appointmentLocation" readonly>
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <input type="text" id="appointmentStatus" readonly>
                            </div>
                            <div class="form-group">
                                <label>Notes</label>
                                <textarea id="appointmentNotes" readonly rows="4"></textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-primary" id="closeAppointmentBtn">Close</button>
                        </div>
                    </div>
                </div>
                
                <!-- View Event Modal (New Design) -->
                <div id="viewEventModal" class="modal" style="display:none;">
                    <div class="modal-content view-event-modal-new">
                        <div class="view-modal-header">
                            <h2 id="viewEventTitle">Meeting</h2>
                            <span class="modal-close" id="closeViewEventModal">&times;</span>
                        </div>
                        <div class="view-modal-body">
                            <div class="event-detail-section" id="descriptionSection">
                                <div class="event-detail-icon">
                                    <i class="bi bi-chat-left-text"></i>
                                </div>
                                <div class="event-detail-content">
                                    <h3 class="event-detail-title">Description</h3>
                                    <p id="viewEventDescription" class="event-detail-text"></p>
                                </div>
                            </div>
                            <div class="event-detail-section">
                                <div class="event-detail-icon">
                                    <i class="bi bi-clock"></i>
                                </div>
                                <div class="event-detail-content">
                                    <h3 class="event-detail-title">Date and Time</h3>
                                    <p id="viewEventDateTime" class="event-detail-text"><span id="viewEventRange"></span><br><span id="viewEventTime"></span></p>
                                </div>
                            </div>
                        </div>
                        <div class="view-modal-footer">
                            <button class="btn btn-outline-primary" id="editEventBtn" style="display:none;">
                                <i class="bi bi-pencil-square"></i> Edit
                            </button>
                            <button class="btn btn-primary" id="seeMoreDetailsBtn" style="display:none;">See more details →</button>
                        </div>
                    </div>
                </div>

                <!-- View Appointment Request Modal -->
                <div id="viewAppointmentRequestModal" class="modal" style="display:none;">
                    <div class="modal-content view-event-modal-new">
                        <div class="view-modal-header">
                            <h2>Appointment Request</h2>
                            <span class="modal-close" id="closeAppointmentRequestModal" style="cursor: pointer;">&times;</span>
                        </div>
                        <div class="view-modal-body">
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
                                    <h3 class="event-detail-title">Notes</h3>
                                    <p id="requestNotes" class="event-detail-text"></p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/student/schedule.js') }}?v={{ filemtime(public_path('pages/student/schedule.js')) }}"></script>
</body>
</html>
