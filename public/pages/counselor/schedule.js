// Counselor Schedule Script

let currentEditingAppointmentId = null;
let currentAppointmentRequest = null; // Store current request being viewed
let currentCalendarDate = new Date();
let appointmentCalendarEvents = [];
let selectedScheduleDate = '';
let scheduleEventsCache = [];
let editingScheduleEventId = null; // set when createScheduleModal is opened to edit an existing event
const SCHEDULE_API_URL = '../../api/schedule-events';

// Utility Functions
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;
    
    const container = document.querySelector('.page-content');
    if (container) {
        container.insertBefore(alert, container.firstChild);
        setTimeout(() => alert.remove(), 3000);
    }
}

// Expose weekend helpers on window so runtime checks can access them
window.isWeekend = function(dateStr) {
    const date = new Date((dateStr || '') + 'T00:00:00');
    const dayOfWeek = isNaN(date.getTime()) ? -1 : date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
};

window.getWeekendName = function(dateStr) {
    const date = new Date((dateStr || '') + 'T00:00:00');
    const dayOfWeek = isNaN(date.getTime()) ? -1 : date.getDay();
    return dayOfWeek === 0 ? 'Sunday' : 'Saturday';
};

function getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCurrentUser() {
    try {
        return JSON.parse(sessionStorage.getItem('user') || '{}');
    } catch (err) {
        return {};
    }
}

function getCurrentSchool() {
    const user = getCurrentUser();
    if (user.school || user.school_attended) {
        return user.school || user.school_attended;
    }

    try {
        const fallback = JSON.parse(localStorage.getItem('currentUser') || '{}');
        return fallback.school || fallback.school_attended || '';
    } catch (err) {
        return '';
    }
}

async function refreshScheduleEvents() {
    const school = getCurrentSchool();
    if (!school) {
        scheduleEventsCache = [];
        return;
    }

    const month = `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}`;
    const response = await fetch(`${SCHEDULE_API_URL}?school=${encodeURIComponent(school)}&month=${encodeURIComponent(month)}`);
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load schedule events');
    }
    scheduleEventsCache = Array.isArray(result.data) ? result.data : [];
    // Ensure the calendar re-renders after events are refreshed
    try {
        if (typeof renderAppointmentCalendar === 'function') renderAppointmentCalendar();
    } catch (e) {
        console.warn('renderAppointmentCalendar failed after refresh:', e && e.message);
    }
}

async function refreshScheduleEventsSafely() {
    try {
        await refreshScheduleEvents();
    } catch (error) {
        console.error('Error loading schedule events:', error);
        showAlert(error.message || 'Unable to load schedule events', 'error');
    }
}

async function initSchedulePage() {
    initPage();
    await refreshGradeScope();
    setupCalendarControls();
    setupCreateScheduleModal();
    setupRequestModal();
    await refreshScheduleEventsSafely();
    loadAppointmentRequests();
    
    // Reload every 30 seconds
    setInterval(async () => {
        await refreshScheduleEventsSafely();
        loadAppointmentRequests();
    }, 30000);
    
    const editForm = document.getElementById('editAppointmentForm');
    if (editForm) {
        editForm.addEventListener('submit', submitEditAppointment);
    }
    
    const declineForm = document.getElementById('declineAppointmentForm');
    if (declineForm) {
        declineForm.addEventListener('submit', submitDeclineAppointment);
    }
}

// Start/End Time only make sense for a timed block within the day — an
// All Day event has nothing to blank out for students, so the fields are
// hidden (and their required-ness dropped) whenever All Day is checked.
function updateModalTimeFieldsVisibility() {
    const allDay = document.getElementById('modalEventAllDay')?.checked || false;
    const fields = document.getElementById('modalEventTimeFields');
    const startTime = document.getElementById('modalEventStartTime');
    const endTime = document.getElementById('modalEventEndTime');
    if (fields) fields.style.display = allDay ? 'none' : '';
    if (startTime) startTime.required = !allDay;
    if (endTime) endTime.required = !allDay;
}

function setupCreateScheduleModal() {
    document.getElementById('openCreateScheduleModalBtn')?.addEventListener('click', () => {
        openCreateScheduleModal(formatDateForInput(new Date()));
    });

    document.getElementById('closeCreateScheduleModal')?.addEventListener('click', closeCreateScheduleModal);
    document.getElementById('cancelCreateScheduleModal')?.addEventListener('click', closeCreateScheduleModal);
    document.getElementById('createScheduleModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'createScheduleModal') {
            closeCreateScheduleModal();
        }
    });
    document.getElementById('modalEventAllDay')?.addEventListener('change', updateModalTimeFieldsVisibility);
    document.getElementById('createScheduleModalForm')?.addEventListener('submit', submitCreateScheduleModal);
}

function setupRequestModal() {
    const requestModal = document.getElementById('requestModal');
    if (!requestModal) return;

    // Close modal when clicking the X button
    requestModal.querySelector('.modal-close')?.addEventListener('click', closeRequestModal);

    // Close modal when clicking outside the modal content
    requestModal.addEventListener('click', (event) => {
        if (event.target === requestModal) {
            closeRequestModal();
        }
    });
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

function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateForInput(date) {
    return localDateString(date);
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
// appointments students booked themselves online, and counseling
// appointments the counselor scheduled directly (e.g. from a case's
// "Appoint Students" action). Each maps to a CSS class + icon — see the
// SCHEDULE CALENDAR section of css/style.css for the chip styling.
const SCHEDULE_CATEGORY_META = {
    event: { className: 'cat-event', icon: 'bi-calendar2-week', label: 'Event' },
    online: { className: 'cat-online', icon: 'bi-laptop', label: 'Online Appointment' },
    counseling: { className: 'cat-counseling', icon: 'bi-person-check-fill', label: 'Counseling Appointment' }
};

function getEventCategory(event, isAppointment) {
    if (!isAppointment) return 'event';
    return event.booking_type === 'counseling' ? 'counseling' : 'online';
}

function getAppointmentTypeClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'event-approved';
    if (normalized === 'proposed_change') return 'event-pending';
    if (normalized === 'rejected') return 'event-cancelled';
    return 'event-default';
}

function getScheduleEvents() {
    return scheduleEventsCache;
}

function renderAppointmentCalendar() {
    const calendarEl = document.getElementById('scheduleCalendar');
    const monthEl = document.getElementById('scheduleCalendarMonth');
    if (!calendarEl || !monthEl) return;

    const today = new Date();
    const scheduleEvents = getScheduleEvents();
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const totalCells = 42;

    monthEl.textContent = formatMonthYear(firstDay);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = '<div class="schedule-calendar-grid">';
    dayNames.forEach(day => {
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
        const appointmentEvents = appointmentCalendarEvents.filter(event => isDateInEvent(event, dateStr));
        const userEvents = scheduleEvents.filter(event => isDateInEvent(event, dateStr));
        const dayEvents = [...appointmentEvents, ...userEvents];
        const isToday = cellDay === today.getDate() && cellMonth === today.getMonth() && cellYear === today.getFullYear();

        html += `<div class="schedule-calendar-day ${isOutside ? 'is-outside' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateStr}" onclick="if(event.target.closest('.schedule-event-block')) event.stopPropagation(); else openCreateScheduleModal('${dateStr}')">
            <div class="schedule-day-number">${cellDay}</div>
            <div class="schedule-event-list">`;

        dayEvents.forEach(event => {
            const isAppointment = event.kind === 'appointment' || !!event.student_id || !!event.student_name;
            const title = escapeHtml(isAppointment ? `Appointment: ${event.title || 'Student'}` : (event.title || 'Event'));
            const category = getEventCategory(event, isAppointment);
            const meta = SCHEDULE_CATEGORY_META[category];
            html += `<div class="schedule-event-block ${meta.className}" data-event-id="${event.id}" onclick="openViewEventModal('${event.id}')" title="${meta.label}: ${title}"><i class="bi ${meta.icon}"></i><span class="chip-label">${title}</span></div>`;
        });

        html += '</div></div>';
    }

    html += '</div>';
    calendarEl.innerHTML = html;
    if (!calendarEl.dataset.listenerAttached) {
        calendarEl.addEventListener('click', function(e) {
            const chip = e.target.closest('.schedule-event-block');
            if (!chip) return;
            const id = chip.getAttribute('data-event-id');
            openViewEventModal(id || '');
        });
        calendarEl.dataset.listenerAttached = '1';
    }
}

function openCreateScheduleModal(dateStr) {
    // Check if the date has already passed
    if (dateStr < getTodayDateStr()) {
        showAlert('You cannot schedule an event for a date that has already passed.', 'error');
        return;
    }

    // Check if selected date is a weekend
    if (isWeekend(dateStr)) {
        const dayName = getWeekendName(dateStr);
        showAlert(`${dayName} is not available. Please select a weekday.`, 'error');
        return;
    }

    editingScheduleEventId = null;
    selectedScheduleDate = dateStr;
    const modal = document.getElementById('createScheduleModal');
    const modalTitle = modal?.querySelector('.modal-header h2');
    const startInput = document.getElementById('modalEventStart');
    const titleInput = document.getElementById('modalEventTitle');
    const descriptionInput = document.getElementById('modalEventDescription');
    const endInput = document.getElementById('modalEventEnd');
    const allDayInput = document.getElementById('modalEventAllDay');
    const labelSelect = document.getElementById('modalEventLabel');
    const startTimeInput = document.getElementById('modalEventStartTime');
    const endTimeInput = document.getElementById('modalEventEndTime');

    if (modalTitle) modalTitle.textContent = 'Create Schedule';
    if (startInput) startInput.value = `${dateStr} 00:00`;
    if (titleInput) titleInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    if (endInput) {
        endInput.value = '';
        endInput.min = dateStr;
    }
    if (allDayInput) allDayInput.checked = false;
    if (labelSelect) labelSelect.value = 'None';
    if (startTimeInput) startTimeInput.value = '';
    if (endTimeInput) endTimeInput.value = '';
    updateModalTimeFieldsVisibility();

    if (modal) modal.style.display = 'flex';
    setTimeout(() => titleInput?.focus(), 50);
}

// Opens the same modal pre-filled with an existing event's data so editing
// title/description updates that one event record (covering its whole date
// range) instead of creating a duplicate.
function openEditScheduleModal(eventId) {
    const event = scheduleEventsCache.find(e => e.id === eventId);
    if (!event) {
        showAlert('Unable to find this event to edit.', 'error');
        return;
    }

    editingScheduleEventId = eventId;
    selectedScheduleDate = event.date || '';

    const modal = document.getElementById('createScheduleModal');
    const modalTitle = modal?.querySelector('.modal-header h2');
    const startInput = document.getElementById('modalEventStart');
    const titleInput = document.getElementById('modalEventTitle');
    const descriptionInput = document.getElementById('modalEventDescription');
    const endInput = document.getElementById('modalEventEnd');
    const allDayInput = document.getElementById('modalEventAllDay');
    const labelSelect = document.getElementById('modalEventLabel');
    const startTimeInput = document.getElementById('modalEventStartTime');
    const endTimeInput = document.getElementById('modalEventEndTime');

    if (modalTitle) modalTitle.textContent = 'Edit Schedule';
    if (startInput) startInput.value = `${event.date || ''} ${event.allDay ? '00:00' : (event.time || '00:00')}`;
    if (titleInput) titleInput.value = event.title || '';
    if (descriptionInput) descriptionInput.value = event.description || '';
    if (endInput) {
        endInput.value = event.endDate || '';
        endInput.min = event.date || '';
    }
    if (allDayInput) allDayInput.checked = !!event.allDay;
    if (labelSelect) labelSelect.value = event.type || 'None';
    if (startTimeInput) startTimeInput.value = event.allDay ? '' : (event.time || '');
    if (endTimeInput) endTimeInput.value = event.allDay ? '' : (event.endTime || '');
    updateModalTimeFieldsVisibility();

    const viewModal = document.getElementById('viewEventModal');
    if (viewModal) viewModal.style.display = 'none';

    if (modal) modal.style.display = 'flex';
    setTimeout(() => titleInput?.focus(), 50);
}

function closeCreateScheduleModal() {
    const modal = document.getElementById('createScheduleModal');
    if (modal) modal.style.display = 'none';
    selectedScheduleDate = '';
    editingScheduleEventId = null;
}

function submitCreateScheduleModal(e) {
    e.preventDefault();

    const title = document.getElementById('modalEventTitle')?.value.trim();
    const end = document.getElementById('modalEventEnd')?.value.trim();
    const allDay = document.getElementById('modalEventAllDay')?.checked || false;
    const description = document.getElementById('modalEventDescription')?.value.trim() || '';
    const label = document.getElementById('modalEventLabel')?.value || 'None';
    const startTime = document.getElementById('modalEventStartTime')?.value.trim() || '';
    const endTime = document.getElementById('modalEventEndTime')?.value.trim() || '';

    if (!title || !selectedScheduleDate) {
        showAlert('Please choose a date and enter a title.', 'error');
        return;
    }

    if (!allDay) {
        if (!startTime || !endTime) {
            showAlert('Please enter a start time and end time, or check All Day.', 'error');
            return;
        }
        if (endTime <= startTime) {
            showAlert('End time must be after start time.', 'error');
            return;
        }
    }

    const isEditing = !!editingScheduleEventId;

    // Check if the date has already passed (only relevant when scheduling a
    // new event - editing an existing past event's details should still work)
    if (!isEditing && selectedScheduleDate < getTodayDateStr()) {
        showAlert('You cannot schedule an event for a date that has already passed.', 'error');
        return;
    }

    // Check if selected date is a weekend
    if (isWeekend(selectedScheduleDate)) {
        const dayName = getWeekendName(selectedScheduleDate);
        showAlert(`${dayName} is not available. Please select a weekday.`, 'error');
        return;
    }

    const user = getCurrentUser();
    const school = getCurrentSchool();
    const event = {
        id: isEditing ? editingScheduleEventId : generateId(),
        title,
        type: label,
        date: selectedScheduleDate,
        time: allDay ? 'All Day' : startTime,
        endTime: allDay ? '' : endTime,
        endDate: end || '',
        allDay,
        description,
        location: 'Guidance Office',
        createdAt: new Date().toISOString(),
        school,
        createdBy: String(user.id || ''),
        createdRole: String(user.role || '')
    };

    fetch(SCHEDULE_API_URL, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
    })
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(async ({ ok, data }) => {
            if (!ok || !data.success) {
                throw new Error(data.message || 'Unable to save schedule event');
            }

            showAlert(isEditing ? 'Schedule updated successfully!' : 'Schedule saved successfully!', 'success');
            closeCreateScheduleModal();
            await refreshScheduleEventsSafely();
            renderAppointmentCalendar();
        })
        .catch((error) => {
            console.error('Error saving schedule event:', error);
            showAlert(error.message || 'Unable to save schedule event', 'error');
        });
}

function openViewEventModal(eventId) {
    const scheduleEvents = getScheduleEvents();
    const events = [...appointmentCalendarEvents, ...scheduleEvents];
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    if (ev.kind === 'appointment' || ev.student_id || ev.student_name) {
        viewRequestDetails(ev.id);
        return;
    }

    const start = ev.date || '';
    const end = ev.endDate || '';
    function formatRange(s, e) {
        if (!s) return '';
        if (!e || e === s) return new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return `${new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${new Date(e).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    }

    // create or show improved modal
    let modal = document.getElementById('viewEventModal');
    if (!modal || !modal.innerHTML || modal.innerHTML.trim() === '') {
        modal = document.createElement('div');
        modal.id = 'viewEventModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content view-event-modal-new">
                <div class="view-modal-header">
                    <h2 id="viewEventTitle">Event</h2>
                    <span class="modal-close" id="viewEventClose">&times;</span>
                </div>
                <div class="view-modal-body">
                    <div class="event-detail-section">
                        <div class="event-detail-icon"><i class="bi bi-card-text"></i></div>
                        <div class="event-detail-content">
                            <h3 class="event-detail-title">Description</h3>
                            <p id="viewEventDescription" class="event-detail-text"></p>
                        </div>
                    </div>
                    <div class="event-detail-section">
                        <div class="event-detail-icon"><i class="bi bi-calendar-event"></i></div>
                        <div class="event-detail-content">
                            <h3 class="event-detail-title">Date and Time</h3>
                            <p id="viewEventDateTime" class="event-detail-text"><span id="viewEventRange"></span><br><span id="viewEventTime"></span></p>
                        </div>
                    </div>
                </div>
                <div class="view-modal-footer">
                    <button class="btn btn-outline-primary" id="viewEventEditBtn">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn btn-primary" id="viewEventSeeMoreBtn">See more details →</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('viewEventClose')?.addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('viewEventSeeMoreBtn')?.addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('viewEventEditBtn')?.addEventListener('click', editViewingEvent);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    currentViewingEventId = ev.id || '';
    document.getElementById('viewEventTitle').textContent = ev.title || 'Event';
    document.getElementById('viewEventRange').textContent = formatRange(start, end);
    document.getElementById('viewEventTime').textContent = ev.allDay ? 'All Day' : (ev.time || '');
    document.getElementById('viewEventDescription').textContent = ev.description || 'No description';
    modal.style.display = 'flex';
}

let currentViewingEventId = '';

function editViewingEvent() {
    if (!currentViewingEventId) return;
    openEditScheduleModal(currentViewingEventId);
}

// ===== APPOINTMENT REQUESTS MANAGEMENT =====
function loadAppointmentRequests() {
    let user = JSON.parse(sessionStorage.getItem('user'));
    
    // Fallback to localStorage if sessionStorage is empty or invalid
    if (!user || !user.school_attended) {
        try {
            user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        } catch (err) {
            console.error('User or school not found');
            return;
        }
    }
    
    if (!user || !user.school_attended) {
        console.error('User or school not found');
        return;
    }

    const apiUrl = `../../api/appointment-request?school=${encodeURIComponent(user.school_attended)}&role=counselor&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(result => {
            const tbody = document.getElementById('appointmentRequestsBody');
            
            if (!result.success || !result.data || result.data.length === 0) {
                tbody.innerHTML = `<tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: #999;">No appointment requests received</td>
                </tr>`;
                return;
            }

            // Filter for pending, proposed_change, and approved statuses (keep approved as history)
            const allRequests = result.data.filter(r => r.status === 'pending' || r.status === 'proposed_change' || r.status === 'approved');
            appointmentCalendarEvents = allRequests.map(request => ({
                id: request.id,
                kind: 'appointment',
                date: request.preferred_date,
                title: request.student_name,
                type: request.status,
                time: request.preferred_time,
                student_id: request.student_id,
                student_name: request.student_name,
                reason: request.reason,
                notes: request.notes,
                status: request.status,
                counselor_notes: request.counselor_notes,
                preferred_date: request.preferred_date,
                preferred_time: request.preferred_time,
                school_attended: request.school_attended
            }));

            if (allRequests.length === 0) {
                tbody.innerHTML = `<tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: #999;">No appointment requests</td>
                </tr>`;
                renderAppointmentCalendar();
                return;
            }

            tbody.innerHTML = allRequests.map(request => {
                let statusBadge = '';
                if (request.status === 'approved') {
                    statusBadge = '<span class="badge" style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); color: white; padding: 5px 10px; border-radius: 20px; font-size: 12px;">✓ Approved</span>';
                } else if (request.status === 'proposed_change') {
                    statusBadge = '<span class="badge" style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 5px 10px; border-radius: 20px; font-size: 12px;">📝 Needs Change</span>';
                } else {
                    statusBadge = '<span class="badge" style="background: linear-gradient(135deg, #FFB347 0%, #FFA500 100%); color: white; padding: 5px 10px; border-radius: 20px; font-size: 12px;">⏳ Pending</span>';
                }

                return `
                    <tr>
                        <td><strong>${request.student_name}</strong></td>
                        <td>${formatDate(request.preferred_date)}</td>
                        <td>${request.preferred_time}</td>
                        <td>${capitalizeFirst(request.reason.replace('-', ' '))}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-sm btn-info" onclick="viewRequestDetails('${request.id}')"><i class="bi bi-eye"></i> View</button>
                            ${request.status !== 'approved' ? `<button class="btn btn-sm btn-success" onclick="approveAppointment('${request.id}')"><i class="bi bi-check-lg"></i> Approve</button>
                            <button class="btn btn-sm btn-warning" onclick="proposeChanges('${request.id}')"><i class="bi bi-pencil"></i> Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="rejectRequest('${request.id}')"><i class="bi bi-x-lg"></i> Reject</button>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
            renderAppointmentCalendar();
        })
        .catch(error => {
            console.error('Error loading appointment requests:', error);
            const tbody = document.getElementById('appointmentRequestsBody');
            if (tbody) {
                tbody.innerHTML = `<tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: #f00;">Error: ${error.message}</td>
                </tr>`;
            }
            appointmentCalendarEvents = [];
            renderAppointmentCalendar();
        });
}

function viewRequestDetails(requestId) {
    // Find the request in the current data
    const apiUrl = `../../api/appointment-request?school=${encodeURIComponent(getCurrentSchool())}&role=counselor&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;
    
    fetch(apiUrl)
        .then(response => response.json())
        .then(result => {
            if (!result.success || !result.data) return;
            
            const request = result.data.find(r => r.id === requestId);
            if (!request) {
                showAlert('Request not found', 'error');
                return;
            }

            currentEditingAppointmentId = requestId;
            currentAppointmentRequest = request;

            // Populate modal
            document.getElementById('requestModalTitle').textContent = `Appointment Request - ${request.student_name}`;
            document.getElementById('requestStudentName').textContent = request.student_name || 'Unknown';
            document.getElementById('requestReason').textContent = (request.reason || 'Not specified').replace(/-/g, ' ');
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

            // Show/hide action buttons based on status
            const approveBtn = document.getElementById('approveRequestBtn');
            const proposeBtn = document.getElementById('proposeChangeBtn');
            const rejectBtn = document.getElementById('rejectRequestBtn');
            
            if (request.status === 'approved') {
                if (approveBtn) approveBtn.style.display = 'none';
                if (proposeBtn) proposeBtn.style.display = 'none';
                if (rejectBtn) rejectBtn.style.display = 'none';
            } else {
                if (approveBtn) approveBtn.style.display = 'inline-block';
                if (proposeBtn) proposeBtn.style.display = 'inline-block';
                if (rejectBtn) rejectBtn.style.display = 'inline-block';
            }

            const modal = document.getElementById('requestModal');
            if (modal) modal.style.display = 'flex';
        })
        .catch(error => {
            console.error('Error loading request details:', error);
            showAlert('Error loading request details', 'error');
        });
}

function approveAppointment(requestId) {
    if (!confirm('Approve this appointment request?')) {
        return;
    }

    let user = JSON.parse(sessionStorage.getItem('user'));
    if (!user || !user.id) {
        try {
            user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        } catch (err) {
            user = {};
        }
    }
    
    const updateData = {
        id: requestId,
        status: 'approved',
        counselor_id: user?.id || 0,
        counselor_notes: 'Appointment approved by counselor'
    };

    fetch('../../api/appointment-request', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('Appointment approved!', 'success');
            closeRequestModal();
            loadAppointmentRequests();
        } else {
            showAlert(result.message || 'Failed to approve appointment', 'error');
        }
    })
    .catch(error => {
        console.error('Error approving appointment:', error);
        showAlert('Error: ' + error.message, 'error');
    });
}

function proposeChanges(requestId) {
    currentEditingAppointmentId = requestId;
    // Pulled from the raw request data (not the table cells, which hold
    // display-formatted text) so the date/time inputs get real ISO/24h
    // values instead of strings like "Wed, Jan 7, 2026" that <input type="date">
    // silently rejects.
    const request = (appointmentCalendarEvents || []).find(r => String(r.id) === String(requestId));

    if (!request) {
        showAlert('Request not found', 'error');
        return;
    }

    document.getElementById('editStudentName').value = request.student_name || '';
    document.getElementById('editAppointmentDate').value = request.preferred_date || '';
    document.getElementById('editAppointmentTime').value = (request.preferred_time || '').slice(0, 5);
    document.getElementById('editAppointmentLocation').value = 'Counseling Office';
    document.getElementById('editAppointmentNotes').value = '';

    document.getElementById('editAppointmentModal').style.display = 'flex';
}

function submitEditAppointment(e) {
    e.preventDefault();

    if (!currentEditingAppointmentId) {
        showAlert('No appointment selected', 'error');
        return;
    }

    let user = JSON.parse(sessionStorage.getItem('user'));
    if (!user || !user.id) {
        try {
            user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        } catch (err) {
            user = {};
        }
    }
    
    const updateData = {
        id: currentEditingAppointmentId,
        status: 'proposed_change',
        counselor_id: user?.id || 0,
        counselor_notes: document.getElementById('editAppointmentNotes').value || 'Proposed time change by counselor',
        preferred_date: document.getElementById('editAppointmentDate').value,
        preferred_time: document.getElementById('editAppointmentTime').value
    };

    fetch('../../api/appointment-request', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('Proposed changes sent to student for review!', 'success');
            closeEditModal();
            loadAppointmentRequests();
        } else {
            showAlert(result.message || 'Failed to update', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Error: ' + error.message, 'error');
    });
}

function rejectRequest(requestId) {
    if (!confirm('Reject this appointment request?')) {
        return;
    }

    let user = JSON.parse(sessionStorage.getItem('user'));
    if (!user || !user.id) {
        try {
            user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        } catch (err) {
            user = {};
        }
    }
    
    const updateData = {
        id: requestId,
        status: 'rejected',
        counselor_id: user?.id || 0,
        counselor_notes: 'Request rejected by counselor'
    };

    fetch('../../api/appointment-request', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('Request rejected', 'success');
            loadAppointmentRequests();
        } else {
            showAlert(result.message || 'Failed to reject', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Error: ' + error.message, 'error');
    });
}

function submitDeclineAppointment(e) {
    e.preventDefault();
    // Rejection is now handled by rejectRequest() function directly
    closeDeclineModal();
}

function closeDeclineModal() {
    document.getElementById('declineAppointmentModal').style.display = 'none';
    currentEditingAppointmentId = null;
}

function closeEditModal() {
    document.getElementById('editAppointmentModal').style.display = 'none';
    currentEditingAppointmentId = null;
}

function closeRequestModal() {
    document.getElementById('requestModal').style.display = 'none';
    currentEditingAppointmentId = null;
    currentAppointmentRequest = null;
}

function approveAppointmentFromModal() {
    if (!currentEditingAppointmentId) {
        showAlert('No request selected', 'error');
        return;
    }
    approveAppointment(currentEditingAppointmentId);
}

function proposeChangesFromModal() {
    if (!currentEditingAppointmentId) {
        showAlert('No request selected', 'error');
        return;
    }
    proposeChanges(currentEditingAppointmentId);
}

function rejectRequestFromModal() {
    if (!currentEditingAppointmentId) {
        showAlert('No request selected', 'error');
        return;
    }
    rejectRequest(currentEditingAppointmentId);
}

document.addEventListener('DOMContentLoaded', initSchedulePage);

