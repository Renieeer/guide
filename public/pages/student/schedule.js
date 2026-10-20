// Student Schedule
const SCHEDULE_API_URL = '../../api/schedule-events';
let currentCalendarDate = new Date();
let scheduleEventsCache = [];
let studentAppointmentRequests = [];
// Unfiltered — every request for the school, not just this student's own —
// so slot-blocking can see what other students have already taken.
let allSchoolAppointmentRequests = [];

document.addEventListener('DOMContentLoaded', initSchedulePage);

async function initSchedulePage() {
    checkAuth('student');
    loadUserInfo();
    renderSidebarAvatar();
    setupCalendarControls();
    await refreshScheduleEventsSafely();
    await loadStudentAppointmentRequests();
    renderAppointmentCalendar();
    setupEventListeners();
    setupAppointmentForm();
}

function getCurrentUser() {
    try {
         const sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (sessionUser && Object.keys(sessionUser).length > 0) {
            return sessionUser;
        }
        return JSON.parse(localStorage.getItem('currentUser') || '{}');
    } catch (err) {
        try {
            return JSON.parse(localStorage.getItem('currentUser') || '{}');
        } catch (fallbackErr) {
            return {};
        }
    }
}

function getCurrentSchool() {
    const user = getCurrentUser();
    return user.school || user.school_attended || '';
}

// Expose weekend helpers on window so they're available in runtime evaluations
window.isWeekend = function(dateStr) {
    // dateStr format: YYYY-MM-DD
    const date = new Date((dateStr || '') + 'T00:00:00');
    const dayOfWeek = isNaN(date.getTime()) ? -1 : date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
};

window.getWeekendName = function(dateStr) {
    const date = new Date((dateStr || '') + 'T00:00:00');
    const dayOfWeek = isNaN(date.getTime()) ? -1 : date.getDay();
    return dayOfWeek === 0 ? 'Sunday' : 'Saturday';
};

// Every slot the "Preferred Time" dropdown offers (school hours, 30-minute
// increments) — kept in one place so the blocking logic and the option list
// in schedule.php can't silently drift apart.
const TIME_SLOTS = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
const SLOT_MINUTES = 30;

function timeToMinutes(timeStr) {
    const [h, m] = String(timeStr || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

// Statuses that still hold a student's requested slot. A rejected request
// freed it back up, and a proposed_change means the counselor is offering a
// different time, so the original preferred_time is no longer being held.
const SLOT_HOLDING_STATUSES = new Set(['pending', 'approved']);

// Blocked time for one date: any All Day schedule event blocks the whole
// day; a timed event blocks just its [time, endTime) window; every other
// student's pending/approved request blocks its own 30-minute slot.
function getBlockedRangesForDate(dateStr) {
    const ranges = [];
    let allDay = false;

    if (scheduleEventsCache && Array.isArray(scheduleEventsCache)) {
        scheduleEventsCache.forEach(event => {
            if (!event.date) return;
            const start = String(event.date).split('T')[0];
            const end = event.endDate ? String(event.endDate).split('T')[0] : start;
            if (dateStr < start || dateStr > end) return;

            if (event.allDay) {
                allDay = true;
            } else if (event.time && event.endTime) {
                ranges.push([timeToMinutes(event.time), timeToMinutes(event.endTime)]);
            }
        });
    }

    if (allSchoolAppointmentRequests && Array.isArray(allSchoolAppointmentRequests)) {
        allSchoolAppointmentRequests.forEach(req => {
            if (req.preferred_date !== dateStr || !req.preferred_time) return;
            if (!SLOT_HOLDING_STATUSES.has(String(req.status || '').toLowerCase())) return;
            const start = timeToMinutes(req.preferred_time);
            ranges.push([start, start + SLOT_MINUTES]);
        });
    }

    return { allDay, ranges };
}

function isSlotBlocked(dateStr, timeStr) {
    const { allDay, ranges } = getBlockedRangesForDate(dateStr);
    if (allDay) return true;
    const start = timeToMinutes(timeStr);
    const end = start + SLOT_MINUTES;
    return ranges.some(([rStart, rEnd]) => start < rEnd && end > rStart);
}

function isDateFullyBlocked(dateStr) {
    const { allDay } = getBlockedRangesForDate(dateStr);
    if (allDay) return true;
    return TIME_SLOTS.every(slot => isSlotBlocked(dateStr, slot));
}

// Greys out (and deselects, if needed) whichever "Preferred Time" options
// fall inside a blocked range for the given date, so the student can only
// submit a request for time that's actually still free that day.
function updateTimeSlotOptions(dateStr) {
    const select = document.getElementById('appointmentTimeInput');
    if (!select) return;

    Array.from(select.options).forEach(option => {
        if (!option.value) return;
        const blocked = dateStr ? isSlotBlocked(dateStr, option.value) : false;
        option.disabled = blocked;
    });

    if (select.value && select.selectedOptions[0]?.disabled) {
        select.value = '';
    }
}

async function refreshScheduleEvents() {
    const school = getCurrentSchool();
    const month = `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}`;
    const query = school && school.toLowerCase() !== 'unknown'
        ? `school=${encodeURIComponent(school)}&month=${encodeURIComponent(month)}`
        : `month=${encodeURIComponent(month)}`;
    const response = await fetch(`${SCHEDULE_API_URL}?${query}`);
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load calendar events');
    }

    scheduleEventsCache = Array.isArray(result.data) ? result.data : [];
}
// end of file
// end of file
function loadUserInfo() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('userName').textContent = user.name || 'Student';
        if (document.getElementById('userRole')) {
            document.getElementById('userRole').textContent = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('-', ' ') : 'Student';
        }
        const avatarEl = document.getElementById('userAvatar');
        const photoUrl = userAvatarUrl(user);
        if (photoUrl) {
            avatarEl.innerHTML = `<img src="${photoUrl}" alt="">`;
        } else {
            const initials = String(user.name || 'Student').split(' ').map(n => n[0]).join('');
            avatarEl.textContent = initials.substring(0, 2);
        }
    }
}

function setupCalendarControls() {
    document.getElementById('schedulePrevMonth')?.addEventListener('click', async () => {
        currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1);
        await refreshScheduleEventsSafely();
        renderAppointmentCalendar();
    });

    document.getElementById('scheduleNextMonth')?.addEventListener('click', async () => {
        currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1);
        await refreshScheduleEventsSafely();
        renderAppointmentCalendar();
    });

    document.getElementById('scheduleTodayBtn')?.addEventListener('click', async () => {
        currentCalendarDate = new Date();
        await refreshScheduleEventsSafely();
        renderAppointmentCalendar();
    });
}

async function refreshScheduleEventsSafely() {
    try {
        await refreshScheduleEvents();
    } catch (error) {
        console.error('Error loading schedule events:', error);
        showAlert(error.message || 'Unable to load schedule events', 'error');
    }
}

async function loadStudentAppointmentRequests() {
    try {
        const user = getCurrentUser();
        if (!user || !user.id) {
            studentAppointmentRequests = [];
            allSchoolAppointmentRequests = [];
            return;
        }

        // Fetch all appointment requests and filter by student_id
        const response = await fetch(`../../api/appointment-request?school=${encodeURIComponent(getCurrentSchool())}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            studentAppointmentRequests = [];
            allSchoolAppointmentRequests = [];
            return;
        }

        allSchoolAppointmentRequests = result.data || [];

        // Filter requests for this student (compare as strings in case one
        // side is a number and the other a string, e.g. from JSON parsing)
        studentAppointmentRequests = allSchoolAppointmentRequests.filter(req => String(req.student_id) === String(user.id));
    } catch (error) {
        console.error('Error loading student appointment requests:', error);
        studentAppointmentRequests = [];
        allSchoolAppointmentRequests = [];
    }
}

function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Fixed category per event (instead of a per-event color hash) so the
// calendar reads consistently at a glance: manually scheduled events,
// appointments the student booked themselves online, and counseling
// appointments the counselor scheduled directly. Each maps to a CSS class +
// icon — see the SCHEDULE CALENDAR section of css/style.css for the chip styling.
const SCHEDULE_CATEGORY_META = {
    event: { className: 'cat-event', icon: 'bi-calendar2-week', label: 'Event' },
    online: { className: 'cat-online', icon: 'bi-laptop', label: 'Online Appointment' },
    counseling: { className: 'cat-counseling', icon: 'bi-person-check-fill', label: 'Counseling Appointment' }
};

function getScheduleEvents() {
    return scheduleEventsCache;
}

function getCalendarItems() {
    const user = getCurrentUser();
    const userId = user?.id;
    const appointments = getData('appointments') || [];
    const scheduleEvents = getScheduleEvents();
    const requestsForMonth = studentAppointmentRequests;

    return {
        appointments: appointments.filter(a => a.studentId === userId),
        scheduleEvents,
        appointmentRequests: requestsForMonth
    };
}

function renderAppointmentCalendar() {
    const { appointments, scheduleEvents, appointmentRequests } = getCalendarItems();
    const calendarEl = document.getElementById('scheduleCalendar');
    const monthEl = document.getElementById('scheduleCalendarMonth');
    if (!calendarEl || !monthEl) return;

    const today = new Date();
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const totalCells = 42;

    monthEl.textContent = formatMonthYear(firstDay);

    let html = '';
    html += '<div class="schedule-calendar-grid">';
    
    // Day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        html += `<div class="schedule-calendar-weekday">${day}</div>`;
    });
    
    function extractDatePart(val) {
        if (!val) return '';
        return String(val).split('T')[0].split(' ')[0];
    }

    function isDateInEvent(event, d) {
        const start = extractDatePart(event.date || '');
        const end = extractDatePart(event.endDate || '') || start;
        if (!start) return false;
        return d >= start && d <= end;
    }

    for (let index = 0; index < totalCells; index++) {
        let cellDay = index - startDay + 1;
        let cellMonth = month;
        let cellYear = year;
        let isOutside = false;

        if (index < startDay) {
            cellDay = daysInPrevMonth - startDay + index + 1;
            cellMonth = month - 1;
            if (cellMonth < 0) {
                cellMonth = 11;
                cellYear -= 1;
            }
            isOutside = true;
        } else if (cellDay > daysInMonth) {
            cellDay = cellDay - daysInMonth;
            cellMonth = month + 1;
            if (cellMonth > 11) {
                cellMonth = 0;
                cellYear += 1;
            }
            isOutside = true;
        }

        const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`;
        const isToday = cellDay === today.getDate() && cellMonth === today.getMonth() && cellYear === today.getFullYear();

        const dayEvents = [
            ...appointments.filter(a => String(a.date || '').startsWith(dateStr)).map(a => ({ id: a.id || '', title: a.reason || 'Appointment', type: a.status || 'Pending', description: a.notes || '', start: a.date || '', end: a.endDate || '', isRequest: false, category: 'counseling' })),
            ...scheduleEvents.filter(event => isDateInEvent(event, dateStr)).map(event => ({ id: event.id || '', title: event.title || 'Schedule', type: event.type || 'Event', description: event.description || '', start: event.date || '', end: event.endDate || '', isRequest: false, category: 'event' })),
            ...appointmentRequests.filter(req => req.preferred_date === dateStr).map(req => ({ id: req.id || '', title: req.student_name || 'Request', type: 'pending', description: req.reason || '', start: req.preferred_date || '', end: req.preferred_date || '', isRequest: true, requestData: req, category: req.booking_type === 'counseling' ? 'counseling' : 'online' }))
        ];

        html += `<div class="schedule-calendar-day ${isOutside ? 'is-outside' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
            <div class="schedule-day-number">${cellDay}</div>
            <div class="schedule-event-list">`;

        dayEvents.forEach(item => {
            const itemTitle = escapeHtml(item.title);
            const meta = SCHEDULE_CATEGORY_META[item.category] || SCHEDULE_CATEGORY_META.event;
            html += `<div class="schedule-event-block ${meta.className}" onclick="openViewEventModal('${item.id}')" data-event-id="${item.id}" title="${meta.label}: ${itemTitle}"><i class="bi ${meta.icon}"></i><span class="chip-label">${itemTitle}</span></div>`;
        });

        html += '</div></div>';
    }
    
    html += '</div>';
    calendarEl.innerHTML = html;
    attachCalendarClickHandlers();
}

function attachCalendarClickHandlers() {
    const container = document.getElementById('scheduleCalendar');
    if (!container) return;
    if (container.dataset.listenerAttached) return;
    container.addEventListener('click', function(e) {
        const chip = e.target.closest('.schedule-event-block');
        if (chip) {
            const id = chip.getAttribute('data-event-id');
            if (id) openViewEventModal(id);
            return;
        }

        const dayCell = e.target.closest('.schedule-calendar-day');
        if (dayCell && dayCell.dataset.date) {
            openRequestFormForDate(dayCell.dataset.date);
        }
    });
    container.dataset.listenerAttached = '1';
}

// Clicking a day directly on the calendar starts a new appointment request for that date,
// so students don't have to open the panel and re-pick the date manually.
function openRequestFormForDate(dateStr) {
    const formPanel = document.getElementById('appointmentFormPanel');
    const dateInput = document.getElementById('appointmentDateInput');
    const timeInput = document.getElementById('appointmentTimeInput');
    if (!formPanel || !dateInput) return;

    if (dateStr < getTodayDateStr()) {
        showAlert('You cannot request an appointment for a date that has already passed.', 'error');
        return;
    }

    if (isWeekend(dateStr)) {
        const dayName = getWeekendName(dateStr);
        showAlert(`${dayName} is not available. Please select a weekday.`, 'error');
        return;
    }

    if (isDateFullyBlocked(dateStr)) {
        showAlert('This date is fully booked. Please choose another date.', 'error');
        return;
    }

    dateInput.min = getTodayDateStr();
    dateInput.value = dateStr;
    updateTimeSlotOptions(dateStr);
    formPanel.style.display = 'block';
    timeInput?.focus();
}

function getStatusColor(status) {
    const colors = {
        'Pending': '#f59e0b',
        'Approved': '#10b981',
        'Scheduled': '#3b82f6',
        'Completed': '#8b5cf6',
        'Cancelled': '#ef4444'
    };
    return colors[status] || '#6b7280';
}

function viewAppointment(appointmentId) {
    const appointments = getData('appointments') || [];
    const appt = appointments.find(a => a.id === appointmentId);
    
    if (!appt) return;
    
    document.getElementById('appointmentDate').value = formatDate(appt.date);
    document.getElementById('appointmentTime').value = appt.time;
    document.getElementById('appointmentCounselor').value = 'Counselor';
    document.getElementById('appointmentLocation').value = appt.location || 'TBD';
    document.getElementById('appointmentStatus').value = appt.status;
    document.getElementById('appointmentNotes').value = appt.notes || 'No notes';
    
    document.getElementById('appointmentModal').style.display = 'flex';
}

function setupEventListeners() {
    document.getElementById('closeAppointmentModal').addEventListener('click', () => {
        document.getElementById('appointmentModal').style.display = 'none';
    });
    
    document.getElementById('closeAppointmentBtn').addEventListener('click', () => {
        document.getElementById('appointmentModal').style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('appointmentModal');
        if (e.target === modal) modal.style.display = 'none';
    });

    // View event modal listeners
    const viewModal = document.getElementById('viewEventModal');
    const closeViewX = document.getElementById('closeViewEventModal');
    const editBtn = document.getElementById('editEventBtn');
    const seeMoreBtn = document.getElementById('seeMoreDetailsBtn');
    
    if (closeViewX) closeViewX.addEventListener('click', () => { if (viewModal) viewModal.style.display = 'none'; });
    if (viewModal) {
        viewModal.addEventListener('click', (e) => { if (e.target === viewModal) viewModal.style.display = 'none'; });
    }
    if (seeMoreBtn) seeMoreBtn.addEventListener('click', () => { if (viewModal) viewModal.style.display = 'none'; });
    if (editBtn) editBtn.addEventListener('click', editCurrentEvent);

    // Appointment request modal listeners
    const requestModal = document.getElementById('viewAppointmentRequestModal');
    const closeRequestX = document.getElementById('closeAppointmentRequestModal');
    
    if (closeRequestX) closeRequestX.addEventListener('click', () => { if (requestModal) requestModal.style.display = 'none'; });
    if (requestModal) {
        requestModal.addEventListener('click', (e) => { if (e.target === requestModal) requestModal.style.display = 'none'; });
    }
}

let currentViewingEventId = '';

function openViewEventModal(eventId) {
    const appointments = getData('appointments') || [];
    const appt = appointments.find(a => a.id === eventId);
    if (appt) {
        viewAppointment(eventId);
        return;
    }

    // Check if this is an appointment request
    const request = studentAppointmentRequests.find(r => r.id === eventId);
    if (request) {
        openViewAppointmentRequestModal(request);
        return;
    }

    const events = getScheduleEvents();
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    currentViewingEventId = ev.id || '';
    
    const start = ev.date || '';
    const end = ev.endDate || '';
    function formatRange(s, e) {
        if (!s) return '';
        if (!e || e === s) return new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return `${new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${new Date(e).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    }

    document.getElementById('viewEventTitle').textContent = ev.title || 'Event';
    document.getElementById('viewEventRange').textContent = formatRange(start, end);
    document.getElementById('viewEventTime').textContent = ev.allDay ? 'All Day' : (ev.time || '');
    document.getElementById('viewEventDescription').textContent = ev.description || 'No description';

    // Hide Edit button for students (only show for coordinator/counselor)
    const editBtn = document.getElementById('editEventBtn');
    const user = getCurrentUser();
    if (editBtn) {
        const userRole = (user?.role || '').toLowerCase();
        editBtn.style.display = (userRole === 'coordinator' || userRole === 'counselor') ? 'flex' : 'none';
    }

    const viewModal = document.getElementById('viewEventModal');
    if (viewModal) viewModal.style.display = 'flex';
}

function editCurrentEvent() {
    // Placeholder for editing logic - can be expanded later
    const user = getCurrentUser();
    const userRole = (user?.role || '').toLowerCase();
    if (userRole !== 'coordinator' && userRole !== 'counselor') {
        showAlert('You do not have permission to edit events', 'error');
        return;
    }
    showAlert('Edit event: ' + currentViewingEventId, 'info');
}

function openViewAppointmentRequestModal(request) {
    const modal = document.getElementById('viewAppointmentRequestModal');
    if (!modal) return;

    document.getElementById('requestReason').textContent = request.reason ? request.reason.replace(/-/g, ' ') : 'Not specified';
    document.getElementById('requestDateTime').textContent = `${new Date(request.preferred_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${request.preferred_time}`;
    
    const statusBadgeMap = {
        'pending': '⏳ Pending',
        'approved': '✓ Approved',
        'proposed_change': '📝 Needs Change',
        'rejected': '✗ Rejected'
    };
    document.getElementById('requestStatus').textContent = statusBadgeMap[request.status] || request.status;

    const notesSection = document.getElementById('requestNotesSection');
    if (request.notes && request.notes.trim()) {
        document.getElementById('requestNotes').textContent = request.notes;
        if (notesSection) notesSection.style.display = 'flex';
    } else {
        if (notesSection) notesSection.style.display = 'none';
    }

    if (modal) modal.style.display = 'flex';
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', requestLogout);

// ===== APPOINTMENT REQUEST FORM =====
function getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function setupAppointmentForm() {
    const requestBtn = document.getElementById('requestAppointmentBtn');
    const formPanel = document.getElementById('appointmentFormPanel');
    const closeBtn = document.getElementById('closeFormPanel');
    const form = document.getElementById('appointmentRequestForm');
    const dateInput = document.getElementById('appointmentDateInput');

    // Prevent picking a date that has already passed
    if (dateInput) dateInput.min = getTodayDateStr();

    requestBtn?.addEventListener('click', () => {
        formPanel.style.display = 'block';
        dateInput.min = getTodayDateStr();
        dateInput.focus();
    });

    // Open the calendar picker as soon as the date field is clicked or focused,
    // so the student doesn't have to hit the tiny calendar icon precisely.
    const openDatePicker = () => {
        if (typeof dateInput.showPicker === 'function') {
            try { dateInput.showPicker(); } catch (err) { /* ignore unsupported/blocked cases */ }
        }
    };
    dateInput?.addEventListener('click', openDatePicker);
    dateInput?.addEventListener('focus', openDatePicker);

    closeBtn?.addEventListener('click', () => {
        formPanel.style.display = 'none';
    });

    form?.addEventListener('submit', submitAppointmentRequest);

    // Add validation for date input using both input and change events for reliability
    const validateDateInput = function() {
        const selectedDate = this.value;
        if (!selectedDate) return;

        // Check if the date is today or later
        if (selectedDate < getTodayDateStr()) {
            showAlert('You cannot request an appointment for a date that has already passed.', 'error');
            this.value = '';
            return;
        }

        // Check if weekend
        if (isWeekend(selectedDate)) {
            const dayName = getWeekendName(selectedDate);
            showAlert(`${dayName} is not available. Please select a weekday.`, 'error');
            this.value = '';
            return;
        }

        // Check if every slot that day is already taken
        if (isDateFullyBlocked(selectedDate)) {
            showAlert('This date is fully booked. Please choose another date.', 'error');
            this.value = '';
            return;
        }

        updateTimeSlotOptions(selectedDate);
    };

    dateInput?.addEventListener('input', validateDateInput);
    dateInput?.addEventListener('change', validateDateInput);
    dateInput?.addEventListener('blur', validateDateInput);
}

function updateDisabledDates() {
    // This function is kept for compatibility but the actual validation
    // is now handled in setupAppointmentForm()
}

async function submitAppointmentRequest(e) {
    e.preventDefault();

    const dateInput = document.getElementById('appointmentDateInput').value;
    const timeInput = document.getElementById('appointmentTimeInput').value;
    const reasonSelect = document.getElementById('appointmentReasonSelect').value;
    const notesInput = document.getElementById('appointmentNotesInput').value;

    if (!dateInput || !timeInput || !reasonSelect) {
        showAlert('Please fill all required fields', 'error');
        return;
    }

    // Check if the date is today or later
    if (dateInput < getTodayDateStr()) {
        showAlert('You cannot request an appointment for a date that has already passed.', 'error');
        return;
    }

    // Check if weekend
    if (isWeekend(dateInput)) {
        const dayName = getWeekendName(dateInput);
        showAlert(`${dayName} is not available. Please select a weekday.`, 'error');
        return;
    }

    // Check if this specific slot is already taken
    if (isSlotBlocked(dateInput, timeInput)) {
        showAlert('That time is no longer available. Please choose another time.', 'error');
        return;
    }

    const user = getCurrentUser();
    const appointmentRequest = {
        student_id: user.id,
        student_name: user.name,
        preferred_date: dateInput,
        preferred_time: timeInput,
        reason: reasonSelect,
        notes: notesInput,
        school: getCurrentSchool(),
        status: 'pending'
    };

    try {
        const response = await fetch('../../api/appointment-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appointmentRequest)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to submit appointment request');
        }

        showAlert('Appointment request submitted successfully!', 'success');
        document.getElementById('appointmentRequestForm').reset();
        document.getElementById('appointmentFormPanel').style.display = 'none';
        
        // Refresh calendar and the student's own request list so the new
        // request shows up on the calendar immediately, not just the toast.
        await refreshScheduleEventsSafely();
        await loadStudentAppointmentRequests();
        renderAppointmentCalendar();
    } catch (error) {
        console.error('Error submitting appointment request:', error);
        showAlert(error.message || 'Failed to submit appointment request', 'error');
    }
}

