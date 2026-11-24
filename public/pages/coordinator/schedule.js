// Coordinator Schedule Script
//
// Coordinators plan school events here (meetings, training, reviews).
// Students' counseling sessions belong to the counselors: they aren't listed
// on this page and can't be booked or approved from it. An event can't be put
// over a booked session either (api/schedule-events refuses it), so the event
// form greys out the times already taken, without saying whose they are
// (js/schedule-slots.js).

let currentCalendarDate = new Date();
let selectedScheduleDate = '';
let scheduleEventsCache = [];
let editingScheduleEventId = null; // set when createScheduleModal is opened to edit an existing event
let currentViewingEventId = '';
const SCHEDULE_API_URL = '../../api/schedule-events';

function getTodayDateStr() {
    return ScheduleSlots.todayStr();
}

window.isWeekend = function(dateStr) {
    const date = new Date((dateStr || '') + 'T00:00:00');
    const dayOfWeek = isNaN(date.getTime()) ? -1 : date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
};

window.getWeekendName = function(dateStr) {
    const date = new Date((dateStr || '') + 'T00:00:00');
    return date.getDay() === 0 ? 'Sunday' : 'Saturday';
};

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

function viewMonth() {
    return `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}`;
}

function formatLongDate(dateStr) {
    return new Date(`${ScheduleSlots.datePart(dateStr)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr) {
    return new Date(`${ScheduleSlots.datePart(dateStr)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatEventTime(event) {
    const span = ScheduleSlots.eventWindow(event);
    if (span === 'all') return 'All Day';
    if (!span) return '-';
    return event.endTime
        ? `${ScheduleSlots.formatTime(event.time)} – ${ScheduleSlots.formatTime(event.endTime)}`
        : ScheduleSlots.formatTime(event.time);
}

async function refreshScheduleEvents() {
    const school = getCurrentSchool();
    if (!school) {
        scheduleEventsCache = [];
        return;
    }
    const data = await ScheduleSlots.loadMonth(viewMonth(), { school, force: true });
    scheduleEventsCache = data.events;
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
    setupCalendarControls();
    setupCreateScheduleModal();
    await loadScheduleEvents();
}

function setupCalendarControls() {
    const goTo = async (date) => {
        currentCalendarDate = date;
        await loadScheduleEvents();
    };
    document.getElementById('schedulePrevMonth')?.addEventListener('click', () =>
        goTo(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1)));
    document.getElementById('scheduleNextMonth')?.addEventListener('click', () =>
        goTo(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1)));
    document.getElementById('scheduleTodayBtn')?.addEventListener('click', () => goTo(new Date()));
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
    document.getElementById('modalEventStartTime')?.addEventListener('change', updateEventTimeAvailability);
    document.getElementById('modalEventEnd')?.addEventListener('change', updateEventTimeAvailability);
    document.getElementById('createScheduleModalForm')?.addEventListener('submit', submitCreateScheduleModal);
}

function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// escapeHtml() is the shared copy in js/utils.js.

function renderScheduleCalendar() {
    const calendarEl = document.getElementById('scheduleCalendar');
    const monthEl = document.getElementById('scheduleCalendarMonth');
    if (!calendarEl || !monthEl) return;

    const today = getTodayDateStr();
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    // Only as many weeks as this month spans (4-6).
    const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;

    monthEl.textContent = formatMonthYear(firstDay);

    let html = '<div class="schedule-calendar-grid">';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
        html += `<div class="schedule-calendar-weekday">${day}</div>`;
    });

    for (let index = 0; index < totalCells; index++) {
        const cellDay = index - startDay + 1;

        // Days from the neighbouring months only pad out the first/last week
        // and can't be clicked; their events show when that month is opened.
        if (cellDay < 1 || cellDay > daysInMonth) {
            const outside = cellDay < 1 ? new Date(year, month - 1, daysInPrevMonth + cellDay) : new Date(year, month + 1, cellDay - daysInMonth);
            const showMonth = index === 0 || outside.getDate() === 1;
            const label = showMonth
                ? `${outside.toLocaleDateString('en-US', { month: 'short' })} ${outside.getDate()}`
                : outside.getDate();
            html += `<div class="schedule-calendar-day is-outside is-filler" aria-hidden="true">
                <div class="schedule-day-number${showMonth ? ' has-month' : ''}">${label}</div>
            </div>`;
            continue;
        }

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`;
        const dayEvents = scheduleEventsCache.filter(event => ScheduleSlots.eventCoversDate(event, dateStr));

        html += `<div class="schedule-calendar-day ${dateStr === today ? 'is-today' : ''}" data-date="${dateStr}">
            <div class="schedule-day-number">${cellDay}</div>
            <div class="schedule-event-list">`;

        dayEvents.forEach(event => {
            const title = escapeHtml(event.title || 'Event');
            html += `<div class="schedule-event-block cat-event" data-event-id="${escapeHtml(event.id)}" title="Event: ${title}"><i class="bi bi-calendar2-week"></i><span class="chip-label">${title}</span></div>`;
        });

        html += '</div></div>';
    }

    html += '</div>';
    calendarEl.innerHTML = html;
    if (!calendarEl.dataset.listenerAttached) {
        calendarEl.addEventListener('click', function(e) {
            const chip = e.target.closest('.schedule-event-block');
            if (chip) {
                openViewEventModal(chip.getAttribute('data-event-id') || '');
                return;
            }
            const dayCell = e.target.closest('.schedule-calendar-day');
            if (dayCell && dayCell.dataset.date) openCreateScheduleModal(dayCell.dataset.date);
        });
        calendarEl.dataset.listenerAttached = '1';
    }
}

// ===== EVENT FORM: keep events off booked sessions =====

// Greys out the event times that would cover a booked counseling session on
// the event's day(s). Sessions the event already covered before this edit
// don't count, so fixing an older event's title still works (the server
// allows that too).
async function updateEventTimeAvailability() {
    const startDate = selectedScheduleDate;
    if (!startDate) return;
    const endInput = document.getElementById('modalEventEnd')?.value || '';
    const lastDate = endInput > startDate ? endInput : startDate;

    try {
        await ScheduleSlots.loadRange(startDate, lastDate, { school: getCurrentSchool() });
    } catch (error) {
        console.warn('Could not load booked times:', error);
    }
    if (selectedScheduleDate !== startDate) return; // modal moved on meanwhile

    let bookings = ScheduleSlots.bookedBetween(startDate, lastDate);
    if (editingScheduleEventId) {
        const original = scheduleEventsCache.find(ev => ev.id === editingScheduleEventId);
        if (original) {
            const alreadyCovered = new Set(ScheduleSlots.bookingsUnderEvent(original, bookings));
            bookings = bookings.filter(b => !alreadyCovered.has(b));
        }
    }

    ScheduleSlots.applyEventTimeAvailability({
        startSelect: document.getElementById('modalEventStartTime'),
        endSelect: document.getElementById('modalEventEndTime'),
        allDayInput: document.getElementById('modalEventAllDay'),
        hintEl: document.getElementById('modalEventBookedHint')
    }, bookings);
}

function fillScheduleModal({ heading, date, event }) {
    const modal = document.getElementById('createScheduleModal');
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };

    const modalTitle = modal?.querySelector('.modal-header h2');
    if (modalTitle) modalTitle.textContent = heading;
    set('modalEventStart', formatLongDate(date));
    set('modalEventTitle', event?.title || '');
    set('modalEventDescription', event?.description || '');
    set('modalEventEnd', ScheduleSlots.datePart(event?.endDate));
    const endInput = document.getElementById('modalEventEnd');
    if (endInput) endInput.min = date;
    const allDayInput = document.getElementById('modalEventAllDay');
    if (allDayInput) allDayInput.checked = !!event?.allDay;
    set('modalEventLabel', event?.type || 'None');
    set('modalEventStartTime', event && !event.allDay ? (event.time || '') : '');
    set('modalEventEndTime', event && !event.allDay ? (event.endTime || '') : '');
    updateModalTimeFieldsVisibility();
    updateEventTimeAvailability();

    if (modal) modal.style.display = 'flex';
    setTimeout(() => document.getElementById('modalEventTitle')?.focus(), 50);
}

function openCreateScheduleModal(dateStr) {
    if (dateStr < getTodayDateStr()) {
        showAlert('You cannot schedule an event for a date that has already passed.', 'error');
        return;
    }
    if (isWeekend(dateStr)) {
        showAlert(`${getWeekendName(dateStr)} is not available. Please select a weekday.`, 'error');
        return;
    }

    editingScheduleEventId = null;
    selectedScheduleDate = dateStr;
    fillScheduleModal({ heading: 'Create Schedule', date: dateStr, event: null });
}

// Opens the same modal pre-filled with an existing event's data so editing
// updates that one event record (covering its whole date range) instead of
// creating a duplicate.
function openEditScheduleModal(eventId) {
    const event = scheduleEventsCache.find(e => e.id === eventId);
    if (!event) {
        showAlert('Unable to find this event to edit.', 'error');
        return;
    }

    editingScheduleEventId = eventId;
    selectedScheduleDate = ScheduleSlots.datePart(event.date);

    const viewModal = document.getElementById('viewEventModal');
    if (viewModal) viewModal.style.display = 'none';

    fillScheduleModal({ heading: 'Edit Schedule', date: selectedScheduleDate, event });
}

function closeCreateScheduleModal() {
    const modal = document.getElementById('createScheduleModal');
    if (modal) modal.style.display = 'none';
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
        location: 'Guidance Office'
    };

    try {
        const response = await fetch(SCHEDULE_API_URL, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        });
        const result = await response.json();

        // A session was booked into that time meanwhile: reload so the form
        // greys it out, and keep the form open to pick another time.
        if (response.status === 409 || result.conflict) {
            showAlert(result.message || 'That time overlaps a booked counseling session. Please choose another time.', 'error');
            ScheduleSlots.forgetCache();
            await loadScheduleEvents();
            updateEventTimeAvailability();
            return;
        }
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

// Loads the month on screen and redraws the calendar and the events table.
async function loadScheduleEvents() {
    await refreshScheduleEventsSafely();
    renderScheduleCalendar();

    const tableTitle = document.getElementById('scheduleTableTitle');
    if (tableTitle) tableTitle.textContent = `Events in ${formatMonthYear(currentCalendarDate)}`;

    const tbody = document.getElementById('scheduleTableBody');
    if (!tbody) return;

    const events = [...scheduleEventsCache].sort((a, b) => {
        const byDate = ScheduleSlots.datePart(a.date).localeCompare(ScheduleSlots.datePart(b.date));
        if (byDate !== 0) return byDate;
        // All-day events first, then by start time.
        const key = ev => (ScheduleSlots.eventWindow(ev) === 'all' ? '' : String(ev.time || ''));
        return key(a).localeCompare(key(b));
    });

    if (events.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="6" style="text-align: center; padding: 30px; color: #999;">No events this month yet. Click a weekday on the calendar to add one.</td>
        </tr>`;
        return;
    }

    tbody.innerHTML = events.map(event => {
        const start = ScheduleSlots.datePart(event.date);
        const end = ScheduleSlots.datePart(event.endDate);
        const dates = end && end !== start ? `${formatShortDate(start)} – ${formatShortDate(end)}` : formatShortDate(start);
        return `
        <tr>
            <td><strong>${escapeHtml(event.title)}</strong></td>
            <td>${escapeHtml(event.type && event.type !== 'None' ? event.type : '-')}</td>
            <td>${escapeHtml(dates)}</td>
            <td>${escapeHtml(formatEventTime(event))}</td>
            <td>${escapeHtml(event.location || '-')}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="openEditScheduleModal('${jsStr(event.id)}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteEvent('${jsStr(event.id)}')">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

function deleteEvent(eventId) {
    const event = scheduleEventsCache.find(e => e.id === eventId);
    confirmAction(`Delete "${event?.title || 'this event'}"? Its time becomes free for bookings again.`, async () => {
        try {
            const response = await fetch(`${SCHEDULE_API_URL}?id=${encodeURIComponent(eventId)}`, { method: 'DELETE' });
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
    }, { title: 'Delete event', confirmLabel: 'Delete', busyLabel: 'Deleting...' });
}

function openViewEventModal(eventId) {
    const ev = scheduleEventsCache.find(e => e.id === eventId);
    if (!ev) return;

    const start = ScheduleSlots.datePart(ev.date);
    const end = ScheduleSlots.datePart(ev.endDate);
    const range = !end || end === start
        ? formatLongDate(start)
        : `${new Date(`${start}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${formatLongDate(end)}`;

    // Create the modal the first time it's needed.
    let modal = document.getElementById('viewEventModal');
    if (!modal) {
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
                    <button class="btn btn-primary" id="viewEventCloseBtn">Close</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('viewEventClose')?.addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('viewEventCloseBtn')?.addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('viewEventEditBtn')?.addEventListener('click', () => {
            if (currentViewingEventId) openEditScheduleModal(currentViewingEventId);
        });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    currentViewingEventId = ev.id || '';
    document.getElementById('viewEventTitle').textContent = ev.title || 'Event';
    document.getElementById('viewEventRange').textContent = range;
    document.getElementById('viewEventTime').textContent = formatEventTime(ev);
    document.getElementById('viewEventDescription').textContent = ev.description || 'No description';

    modal.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', initSchedulePage);
