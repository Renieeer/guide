// Schedule Script

let currentCalendarDate = new Date();
let selectedScheduleDate = '';
let scheduleEventsCache = [];
const SCHEDULE_API_URL = '../../api/schedule-events';
let currentEditingAppointmentId = null;
let currentAppointmentRequest = null;
let editingScheduleEventId = null; // set when createScheduleModal is opened to edit an existing event

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

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

function getCurrentRole() {
    const user = getCurrentUser();
    let role = String(user.role || '').toLowerCase();
    if (!role) {
        try {
            const fallback = JSON.parse(localStorage.getItem('currentUser') || '{}');
            role = String(fallback.role || '').toLowerCase();
        } catch (err) {
            role = '';
        }
    }
    return role;
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
    await loadScheduleEvents();
    loadAppointmentRequests();
    setupCreateScheduleModal();
    setupRequestModal();
}

function setupCalendarControls() {
    document.getElementById('schedulePrevMonth')?.addEventListener('click', async () => {
        currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1);
        await refreshScheduleEventsSafely();
        renderScheduleCalendar();
    });

    document.getElementById('scheduleNextMonth')?.addEventListener('click', async () => {
        currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1);
        await refreshScheduleEventsSafely();
        renderScheduleCalendar();
    });

    document.getElementById('scheduleTodayBtn')?.addEventListener('click', async () => {
        currentCalendarDate = new Date();
        await refreshScheduleEventsSafely();
        renderScheduleCalendar();
    });
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

function getScheduleEvents() {
    return scheduleEventsCache;
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

function getEventColor(eventId) {
    const colors = [
        { bg: '#dbeafe', text: '#1d4ed8' },
        { bg: '#dcfce7', text: '#15803d' },
        { bg: '#fef3c7', text: '#b45309' },
        { bg: '#fee2e2', text: '#b91c1c' },
        { bg: '#fecccc', text: '#c2185b' },
        { bg: '#e9d5ff', text: '#7c3aed' },
        { bg: '#cffafe', text: '#0891b2' },
        { bg: '#fce7f3', text: '#be185d' },
        { bg: '#fed7aa', text: '#92400e' },
        { bg: '#d1fae5', text: '#047857' }
    ];
    const hash = (eventId || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
}

function getEventTypeClass(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('meeting') || normalized.includes('review')) return 'event-meeting';
    if (normalized.includes('training')) return 'event-training';
    if (normalized.includes('event')) return 'event-approved';
    if (normalized.includes('cancel')) return 'event-cancelled';
    return 'event-default';
}

function renderScheduleCalendar() {
    const calendarEl = document.getElementById('scheduleCalendar');
    const monthEl = document.getElementById('scheduleCalendarMonth');
    if (!calendarEl || !monthEl) return;

    const events = getScheduleEvents();
    const today = new Date();
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
        const dayEvents = events.filter(event => isDateInEvent(event, dateStr));
        const isToday = cellDay === today.getDate() && cellMonth === today.getMonth() && cellYear === today.getFullYear();

        html += `<div class="schedule-calendar-day ${isOutside ? 'is-outside' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateStr}" onclick="if(event.target.closest('.schedule-event-block')) event.stopPropagation(); else openCreateScheduleModal('${dateStr}')">
            <div class="schedule-day-number">${cellDay}</div>
            <div class="schedule-event-list">`;

        dayEvents.forEach(event => {
            const isAppointment = event.kind === 'appointment' || !!event.student_id || !!event.student_name;
            const title = escapeHtml(isAppointment ? `Appointment: ${event.title || 'Student'}` : (event.title || 'Schedule'));
            const color = getEventColor(event.id);
            const style = isAppointment
                ? `background: linear-gradient(135deg, ${color.bg} 0%, #ffffff 100%); color: ${color.text}; border-left: 4px solid ${color.text}; font-weight: 700;`
                : `background: ${color.bg}; color: ${color.text};`;
            html += `<div class="schedule-event-block" data-event-id="${event.id}" onclick="openViewEventModal('${event.id}')" title="${title}" style="${style}">${title}</div>`;
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
    if (startInput) {
        startInput.value = `${dateStr} 00:00`;
    }
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

    if (modal) {
        modal.style.display = 'flex';
    }

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
    if (modal) {
        modal.style.display = 'none';
    }
    selectedScheduleDate = '';
    editingScheduleEventId = null;
}

async function submitCreateScheduleModal(e) {
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

    try {
        const response = await fetch(SCHEDULE_API_URL, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to save schedule event');
        }

        showAlert(isEditing ? 'Schedule updated successfully!' : 'Schedule saved successfully!', 'success');
        closeCreateScheduleModal();
        await loadScheduleEvents();
    } catch (error) {
        console.error('Error saving schedule event:', error);
        showAlert(error.message || 'Unable to save schedule event', 'error');
    }
}

async function loadScheduleEvents() {
    await refreshScheduleEventsSafely();
    const events = [...getScheduleEvents()];
    const tbody = document.getElementById('scheduleTableBody');

    if (events.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="6" style="text-align: center; padding: 30px; color: #999;">No scheduled events yet</td>
        </tr>`;
        renderScheduleCalendar();
        return;
    }

    // Sort by date
    events.sort((a, b) => {
        const dateA = new Date(a.date + ' ' + a.time);
        const dateB = new Date(b.date + ' ' + b.time);
        return dateA - dateB;
    });

    tbody.innerHTML = events.map(event => `
        <tr>
            <td><strong>${event.title}</strong></td>
            <td>${event.type}</td>
            <td>${formatDate(event.date)}</td>
            <td>${event.time}</td>
            <td>${event.location || '-'}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteEvent('${event.id}')">Delete</button>
            </td>
        </tr>
    `).join('');

    renderScheduleCalendar();
}

async function deleteEvent(eventId) {
    if (confirm('Are you sure you want to delete this event?')) {
        try {
            const school = getCurrentSchool();
            const role = getCurrentRole();
            const response = await fetch(`${SCHEDULE_API_URL}?id=${encodeURIComponent(eventId)}&school=${encodeURIComponent(school)}&role=${encodeURIComponent(role)}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Unable to delete schedule event');
            }

            showAlert('Event deleted successfully!', 'success');
            await loadScheduleEvents();
        } catch (error) {
            console.error('Error deleting event:', error);
            showAlert(error.message || 'Unable to delete schedule event', 'error');
        }
    }
}

function openViewEventModal(eventId) {
    const events = getScheduleEvents();
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    const start = ev.date || '';
    const end = ev.endDate || '';
    function formatRange(s, e) {
        if (!s) return '';
        if (!e || e === s) return new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        return `${new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${new Date(e).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    }

    // Create improved modal dynamically if not present
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

    const apiUrl = `../../api/appointment-request?school=${encodeURIComponent(user.school_attended)}&role=coordinator&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;

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
                        <td>${capitalizeFirst(request.reason.replace(/-/g, ' '))}</td>
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
        })
        .catch(error => {
            console.error('Error loading appointment requests:', error);
            const tbody = document.getElementById('appointmentRequestsBody');
            if (tbody) {
                tbody.innerHTML = `<tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: #f00;">Error: ${error.message}</td>
                </tr>`;
            }
        });
}

function viewRequestDetails(requestId) {
    // Find the request in the current data
    const apiUrl = `../../api/appointment-request?school=${encodeURIComponent(getCurrentSchool())}&role=coordinator&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;
    
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
        counselor_notes: 'Appointment approved by coordinator'
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
    const tbody = document.getElementById('appointmentRequestsBody');
    const row = tbody.querySelector(`button[onclick*="${requestId}"]`)?.closest('tr');
    
    if (!row) {
        showAlert('Request not found', 'error');
        return;
    }

    // Show edit modal or handle changes
    showAlert('Edit functionality is available through the detail modal', 'info');
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
        counselor_notes: 'Request rejected by coordinator'
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

