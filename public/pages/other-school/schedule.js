// Counselor & Coordinator Schedule Script (same page as the counselor one)
//
// The school calendar: events plus every student's counseling sessions.
// Sessions can only be booked into free slots (api/appointment-request checks
// that when they're saved), so a student's request never has to be declined
// or moved: the counselor just approves it. Events can't be put over a booked
// session either (api/schedule-events), so the event form greys out the times
// already taken (js/schedule-slots.js).

let currentEditingAppointmentId = null;
let currentCalendarDate = new Date();
let appointmentCalendarEvents = [];
let selectedScheduleDate = '';
let scheduleEventsCache = [];
let editingScheduleEventId = null; // set when createScheduleModal is opened to edit an existing event
let scheduleDayAgendaDate = ''; // day shown in the Create Schedule modal's agenda panel ('' when closed)
let currentViewingEventId = '';
const SCHEDULE_API_URL = '../../api/schedule-events';

// Statuses of a request that still waits for the counselor. 'proposed_change'
// is from before proposing a new time was removed; those only need approving.
const AWAITING_APPROVAL = new Set(['pending', 'proposed_change']);

// Utility Functions
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(`${ScheduleSlots.datePart(dateStr)}T00:00:00`);
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function formatLongDate(dateStr) {
    return new Date(`${ScheduleSlots.datePart(dateStr)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;

    const container = document.querySelector('.page-content');
    if (container) {
        container.insertBefore(alert, container.firstChild);
        setTimeout(() => alert.remove(), type === 'error' ? 6000 : 3000);
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
    return ScheduleSlots.todayStr();
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

function viewMonth() {
    return `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}`;
}

async function refreshScheduleEvents() {
    const school = getCurrentSchool();
    if (!school) {
        scheduleEventsCache = [];
        return;
    }
    const data = await ScheduleSlots.loadMonth(viewMonth(), { school, force: true });
    scheduleEventsCache = data.events;
    renderAppointmentCalendar();
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
    document.getElementById('modalEventStartTime')?.addEventListener('change', updateEventTimeAvailability);
    document.getElementById('modalEventEnd')?.addEventListener('change', updateEventTimeAvailability);
    document.getElementById('createScheduleModalForm')?.addEventListener('submit', submitCreateScheduleModal);

    // Day agenda entries open the same details as their calendar chips.
    document.getElementById('scheduleDayList')?.addEventListener('click', (event) => {
        const item = event.target.closest('.schedule-day-item');
        if (item) openViewEventModal(item.dataset.entryId || '');
    });
}

function setupRequestModal() {
    const requestModal = document.getElementById('requestModal');
    if (!requestModal) return;

    // Close modal when clicking outside the modal content
    requestModal.addEventListener('click', (event) => {
        if (event.target === requestModal) {
            closeRequestModal();
        }
    });
}

function setupCalendarControls() {
    const goTo = async (date) => {
        currentCalendarDate = date;
        await refreshScheduleEventsSafely();
        renderAppointmentCalendar();
    };
    document.getElementById('schedulePrevMonth')?.addEventListener('click', () =>
        goTo(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1)));
    document.getElementById('scheduleNextMonth')?.addEventListener('click', () =>
        goTo(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1)));
    document.getElementById('scheduleTodayBtn')?.addEventListener('click', () => goTo(new Date()));
}

function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateForInput(date) {
    return localDateString(date);
}

// escapeHtml() is the shared copy in js/utils.js.

// Fixed category per event (instead of a per-event color hash) so the
// calendar reads consistently at a glance: manually scheduled events,
// appointments students booked themselves online, and counseling
// appointments the counselor scheduled directly (e.g. from a case's
// "Appoint Students" action). Each maps to a CSS class + icon — see the
// SCHEDULE CALENDAR section of css/style.css for the chip styling.
const SCHEDULE_CATEGORY_META = {
    event: { className: 'cat-event', icon: 'bi-calendar2-week', label: 'Event', short: 'Event' },
    online: { className: 'cat-online', icon: 'bi-laptop', label: 'Online Appointment', short: 'Online' },
    counseling: { className: 'cat-counseling', icon: 'bi-person-check-fill', label: 'Counseling Appointment', short: 'Counseling' }
};

function getEventCategory(event, isAppointment) {
    if (!isAppointment) return 'event';
    return event.booking_type === 'counseling' ? 'counseling' : 'online';
}

function getScheduleEvents() {
    return scheduleEventsCache;
}

function extractDatePart(val) {
    return ScheduleSlots.datePart(val);
}

function isDateInEvent(event, d) {
    return ScheduleSlots.eventCoversDate(event, d);
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
    // Only as many weeks as this month spans (4-6), so a row made up entirely
    // of next month's days never appears.
    const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;

    monthEl.textContent = formatMonthYear(firstDay);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = '<div class="schedule-calendar-grid">';
    dayNames.forEach(day => {
        html += `<div class="schedule-calendar-weekday">${day}</div>`;
    });

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

        // Days from the neighbouring months only pad out the first/last week.
        // They carry no appointments or events (those show when that month is
        // opened) and can't be clicked to create a schedule. The first padding
        // day of each run is labelled with its month ("Dec 1") so the edge of
        // the month reads at a glance.
        if (isOutside) {
            const showMonth = index === 0 || cellDay === 1;
            const label = showMonth
                ? `${new Date(cellYear, cellMonth, cellDay).toLocaleDateString('en-US', { month: 'short' })} ${cellDay}`
                : cellDay;
            html += `<div class="schedule-calendar-day is-outside is-filler" aria-hidden="true">
                <div class="schedule-day-number${showMonth ? ' has-month' : ''}">${label}</div>
            </div>`;
            continue;
        }

        const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`;
        const appointmentEvents = appointmentCalendarEvents
            .filter(event => isDateInEvent(event, dateStr))
            .sort((a, b) => String(a.time).localeCompare(String(b.time)));
        const userEvents = scheduleEvents.filter(event => isDateInEvent(event, dateStr));
        const dayEvents = [...appointmentEvents, ...userEvents];
        const isToday = cellDay === today.getDate() && cellMonth === today.getMonth() && cellYear === today.getFullYear();

        html += `<div class="schedule-calendar-day ${isToday ? 'is-today' : ''}" data-date="${dateStr}" onclick="if(event.target.closest('.schedule-event-block')) event.stopPropagation(); else openCreateScheduleModal('${dateStr}')">
            <div class="schedule-day-number">${cellDay}</div>
            <div class="schedule-event-list">`;

        dayEvents.forEach(event => {
            const isAppointment = isAppointmentEntry(event);
            const title = escapeHtml(isAppointment
                ? `${ScheduleSlots.formatTime(event.time)} ${event.title || 'Student'}${AWAITING_APPROVAL.has(event.status) ? ' (pending)' : ''}`
                : (event.title || 'Event'));
            const category = getEventCategory(event, isAppointment);
            const meta = SCHEDULE_CATEGORY_META[category];
            html += `<div class="schedule-event-block ${escapeHtml(meta.className)}" data-event-id="${escapeHtml(event.id)}" title="${escapeHtml(meta.label)}: ${title}"><i class="bi ${escapeHtml(meta.icon)}"></i><span class="chip-label">${title}</span></div>`;
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

    // Keep an open day agenda in step with fresh data (an approval, the
    // 30-second refresh, a newly saved event).
    if (scheduleDayAgendaDate) renderScheduleDayAgenda(scheduleDayAgendaDate);
}

// ===== DAY AGENDA (left panel of the Create Schedule modal) =====
// Clicking a calendar day lists that day's appointments and events beside
// the form, so the counselor sees which times are already taken before
// blocking off a new window. Each entry opens its details.

const APPOINTMENT_STATUS_META = {
    approved: { className: 'is-approved', label: 'Approved' },
    pending: { className: 'is-pending', label: 'Pending' },
    proposed_change: { className: 'is-pending', label: 'Pending' }
};

function isAppointmentEntry(entry) {
    return entry.kind === 'appointment' || !!entry.student_id || !!entry.student_name;
}

function isAllDayEntry(entry) {
    return !isAppointmentEntry(entry) && (entry.allDay || entry.time === 'All Day' || !entry.time);
}

// Appointments and events on dateStr, all-day events first, then by time.
function getDayEntries(dateStr) {
    const sortKey = entry => (isAllDayEntry(entry) ? '' : String(entry.time || '').slice(0, 5));
    return [
        ...appointmentCalendarEvents.filter(entry => isDateInEvent(entry, dateStr)),
        ...getScheduleEvents().filter(entry => isDateInEvent(entry, dateStr))
    ].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

// "13:30" -> { time: '1:30', period: 'PM' }
function formatClock(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    return { time: `${hours % 12 || 12}:${match[2]}`, period: hours >= 12 ? 'PM' : 'AM' };
}

// Preset reasons are stored as slugs ("academic-concerns"); free-text
// reasons (e.g. referral intake notes) are shown as written.
function formatAppointmentReason(reason) {
    const text = String(reason || '').trim();
    return /^[a-z]+(-[a-z]+)*$/.test(text) ? capitalizeFirst(text.replace(/-/g, ' ')) : text;
}

function renderDayEntry(entry) {
    const isAppointment = isAppointmentEntry(entry);
    const meta = SCHEDULE_CATEGORY_META[getEventCategory(entry, isAppointment)];
    const start = isAllDayEntry(entry) ? null : formatClock(entry.time);
    const timeHtml = start
        ? `<strong>${start.time}</strong><small>${start.period}</small>`
        : '<strong>All</strong><small>day</small>';

    let title;
    let detail;
    let statusHtml = '';
    if (isAppointment) {
        title = entry.student_name || entry.title || 'Student';
        detail = formatAppointmentReason(entry.reason);
        const status = APPOINTMENT_STATUS_META[entry.status] || APPOINTMENT_STATUS_META.pending;
        statusHtml = `<span class="schedule-day-status ${status.className}">${status.label}</span>`;
    } else {
        title = entry.title || 'Event';
        const end = start ? formatClock(entry.endTime) : null;
        const firstDay = extractDatePart(entry.date);
        const lastDay = extractDatePart(entry.endDate);
        const shortDate = d => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        detail = [
            lastDay && lastDay !== firstDay ? `${shortDate(firstDay)} – ${shortDate(lastDay)}` : '',
            end ? `${start.time} ${start.period} – ${end.time} ${end.period}` : '',
            // The label repeats the category when it is just "Event".
            entry.type && entry.type !== 'None' && entry.type !== 'Event' ? entry.type : ''
        ].filter(Boolean).join(' · ');
    }

    return `<button type="button" class="schedule-day-item ${meta.className}" data-entry-id="${escapeHtml(entry.id)}">
        <span class="schedule-day-time">${timeHtml}</span>
        <span class="schedule-day-main">
            <span class="schedule-day-title-row">
                <span class="schedule-day-title">${escapeHtml(title)}</span>
                ${statusHtml}
            </span>
            <span class="schedule-day-meta"><i class="bi ${meta.icon}"></i> ${escapeHtml(meta.label)}</span>
            ${detail ? `<span class="schedule-day-detail" title="${escapeHtml(detail)}">${escapeHtml(detail)}</span>` : ''}
        </span>
    </button>`;
}

function renderScheduleDayAgenda(dateStr) {
    scheduleDayAgendaDate = dateStr;
    const date = new Date(`${dateStr}T00:00:00`);
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText('scheduleDayMonth', date.toLocaleDateString('en-US', { month: 'short' }));
    setText('scheduleDayNum', String(date.getDate()));
    setText('scheduleDayWeekday', date.toLocaleDateString('en-US', { weekday: 'long' }));
    setText('scheduleDayFull', date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));

    const entries = getDayEntries(dateStr);

    // Per-category totals, styled like the calendar legend chips.
    const counts = { online: 0, counseling: 0, event: 0 };
    entries.forEach(entry => { counts[getEventCategory(entry, isAppointmentEntry(entry))] += 1; });
    const countsEl = document.getElementById('scheduleDayCounts');
    if (countsEl) {
        countsEl.innerHTML = Object.entries(counts)
            .filter(([, total]) => total > 0)
            .map(([category, total]) => {
                const meta = SCHEDULE_CATEGORY_META[category];
                const plural = category === 'event' && total !== 1 ? 's' : '';
                return `<span class="schedule-legend-item ${meta.className}"><i class="bi ${meta.icon}"></i> ${total} ${meta.short}${plural}</span>`;
            })
            .join('');
    }

    const listEl = document.getElementById('scheduleDayList');
    if (listEl) {
        listEl.innerHTML = entries.length
            ? entries.map(renderDayEntry).join('')
            : `<div class="schedule-day-empty">
                   <i class="bi bi-calendar-check"></i>
                   <strong>Nothing scheduled yet</strong>
                   <span>No appointments or events on this day.</span>
               </div>`;
    }
}

// notice = '' shows the form beside the agenda; a message hides the form
// and shows the agenda alone with that message (past days, weekends).
function setScheduleDayViewOnly(notice) {
    const content = document.querySelector('#createScheduleModal .schedule-day-modal');
    if (content) content.classList.toggle('is-view-only', !!notice);
    const noticeEl = document.getElementById('scheduleDayNotice');
    if (noticeEl) {
        noticeEl.hidden = !notice;
        noticeEl.innerHTML = notice ? `<i class="bi bi-info-circle"></i><span>${escapeHtml(notice)}</span>` : '';
    }
}

function openScheduleDayView(dateStr, notice) {
    editingScheduleEventId = null;
    selectedScheduleDate = ''; // nothing can be submitted from this view
    const modal = document.getElementById('createScheduleModal');
    const modalTitle = modal?.querySelector('.modal-header h2');
    if (modalTitle) modalTitle.textContent = 'Day Schedule';
    setScheduleDayViewOnly(notice);
    renderScheduleDayAgenda(dateStr);
    if (modal) modal.style.display = 'flex';
}

// ===== EVENT FORM: keep events off booked sessions =====

// Greys out the event times that would cover a booked session on the
// event's day(s). Sessions the event already covered before this edit don't
// count, so fixing an older event's title still works (the server allows
// that too).
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

function openCreateScheduleModal(dateStr) {
    // Past dates and weekends can't take a new schedule, but if anything was
    // booked on them the day's agenda still opens so it can be reviewed.
    const isPast = dateStr < getTodayDateStr();
    if (isPast || isWeekend(dateStr)) {
        const dayName = getWeekendName(dateStr);
        if (getDayEntries(dateStr).length > 0) {
            openScheduleDayView(dateStr, isPast
                ? 'This date has already passed, so new schedules can\'t be added.'
                : `${dayName} is not available for new schedules.`);
        } else if (isPast) {
            showAlert('You cannot schedule an event for a date that has already passed.', 'error');
        } else {
            showAlert(`${dayName} is not available. Please select a weekday.`, 'error');
        }
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
    if (startInput) startInput.value = formatLongDate(dateStr);
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
    setScheduleDayViewOnly('');
    renderScheduleDayAgenda(dateStr);
    updateEventTimeAvailability();

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
    selectedScheduleDate = extractDatePart(event.date);

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
    if (startInput) startInput.value = formatLongDate(selectedScheduleDate);
    if (titleInput) titleInput.value = event.title || '';
    if (descriptionInput) descriptionInput.value = event.description || '';
    if (endInput) {
        endInput.value = extractDatePart(event.endDate);
        endInput.min = selectedScheduleDate;
    }
    if (allDayInput) allDayInput.checked = !!event.allDay;
    if (labelSelect) labelSelect.value = event.type || 'None';
    if (startTimeInput) startTimeInput.value = event.allDay ? '' : (event.time || '');
    if (endTimeInput) endTimeInput.value = event.allDay ? '' : (event.endTime || '');
    updateModalTimeFieldsVisibility();
    setScheduleDayViewOnly('');
    if (selectedScheduleDate) renderScheduleDayAgenda(selectedScheduleDate);
    updateEventTimeAvailability();

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
    scheduleDayAgendaDate = '';
    setScheduleDayViewOnly('');
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

    // Check if selected date is a weekend
    if (isWeekend(selectedScheduleDate)) {
        const dayName = getWeekendName(selectedScheduleDate);
        showAlert(`${dayName} is not available. Please select a weekday.`, 'error');
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
        const data = await response.json();

        // A session was booked into that time meanwhile: reload so the
        // form greys it out, and keep the form open to pick another time.
        if (response.status === 409 || data.conflict) {
            showAlert(data.message || 'That time overlaps a booked session. Please choose another time.', 'error');
            await refreshScheduleEventsSafely();
            loadAppointmentRequests();
            updateEventTimeAvailability();
            return;
        }
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Unable to save schedule event');
        }

        showAlert(isEditing ? 'Schedule updated successfully!' : 'Schedule saved successfully!', 'success');
        closeCreateScheduleModal();
        await refreshScheduleEventsSafely();
    } catch (error) {
        console.error('Error saving schedule event:', error);
        showAlert(error.message || 'Unable to save schedule event', 'error');
    }
}

function openViewEventModal(eventId) {
    const scheduleEvents = getScheduleEvents();
    const events = [...appointmentCalendarEvents, ...scheduleEvents];
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    if (isAppointmentEntry(ev)) {
        viewRequestDetails(ev.id);
        return;
    }

    const start = extractDatePart(ev.date);
    const end = extractDatePart(ev.endDate);
    function formatRange(s, e) {
        if (!s) return '';
        if (!e || e === s) return formatLongDate(s);
        return `${new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${formatLongDate(e)}`;
    }
    const span = ScheduleSlots.eventWindow(ev);
    const timeText = span === 'all'
        ? 'All Day'
        : ev.endTime ? `${ScheduleSlots.formatTime(ev.time)} – ${ScheduleSlots.formatTime(ev.endTime)}` : ScheduleSlots.formatTime(ev.time);

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
                    <button class="btn btn-primary" id="viewEventCloseBtn">Close</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('viewEventClose')?.addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('viewEventCloseBtn')?.addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('viewEventEditBtn')?.addEventListener('click', editViewingEvent);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    currentViewingEventId = ev.id || '';
    document.getElementById('viewEventTitle').textContent = ev.title || 'Event';
    document.getElementById('viewEventRange').textContent = formatRange(start, end);
    document.getElementById('viewEventTime').textContent = timeText;
    document.getElementById('viewEventDescription').textContent = ev.description || 'No description';
    modal.style.display = 'flex';
}

function editViewingEvent() {
    if (!currentViewingEventId) return;
    openEditScheduleModal(currentViewingEventId);
}

// ===== STUDENT SESSIONS =====
// Every booked session at the school (sessions the counselor scheduled are
// approved already; a student's own request waits for approval). Rejected
// and cancelled ones aren't shown.
function loadAppointmentRequests() {
    const school = getCurrentSchool();
    if (!school) {
        console.error('User or school not found');
        return;
    }

    const apiUrl = `../../api/appointment-request?school=${encodeURIComponent(school)}&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(result => {
            const requests = result.success && Array.isArray(result.data) ? result.data : [];
            appointmentCalendarEvents = requests
                .filter(ScheduleSlots.isActiveBooking)
                .map(request => ({
                    id: request.id,
                    kind: 'appointment',
                    date: request.preferred_date,
                    title: request.student_name,
                    time: request.preferred_time,
                    student_id: request.student_id,
                    student_name: request.student_name,
                    reason: request.reason,
                    notes: request.notes,
                    status: String(request.status || '').toLowerCase(),
                    counselor_notes: request.counselor_notes,
                    preferred_date: request.preferred_date,
                    preferred_time: request.preferred_time,
                    school_attended: request.school_attended,
                    booking_type: request.booking_type
                }));
            renderAppointmentCalendar();
        })
        .catch(error => {
            console.error('Error loading appointment requests:', error);
            appointmentCalendarEvents = [];
            renderAppointmentCalendar();
        });
}

function findAppointment(requestId) {
    return appointmentCalendarEvents.find(r => String(r.id) === String(requestId)) || null;
}

function viewRequestDetails(requestId) {
    const request = findAppointment(requestId);
    if (!request) {
        showAlert('Request not found', 'error');
        return;
    }

    currentEditingAppointmentId = requestId;
    const awaiting = AWAITING_APPROVAL.has(request.status);

    document.getElementById('requestModalTitle').textContent = `${request.booking_type === 'counseling' ? 'Counseling Session' : 'Appointment Request'} - ${request.student_name}`;
    document.getElementById('requestStudentName').textContent = request.student_name || 'Unknown';
    document.getElementById('requestReason').textContent = formatAppointmentReason(request.reason) || 'Not specified';
    document.getElementById('requestDateTime').textContent = `${formatLongDate(request.preferred_date)} at ${ScheduleSlots.formatTime(request.preferred_time)}`;
    document.getElementById('requestStatus').textContent = awaiting ? '⏳ Waiting for your approval' : '✓ Approved';

    const notesSection = document.getElementById('requestNotesSection');
    if (request.notes && request.notes.trim()) {
        document.getElementById('requestNotes').textContent = request.notes;
        if (notesSection) notesSection.style.display = 'flex';
    } else if (notesSection) {
        notesSection.style.display = 'none';
    }

    // The time was checked as free when it was booked, so the only thing
    // left to do with a waiting request is approve it.
    const approveBtn = document.getElementById('approveRequestBtn');
    if (approveBtn) approveBtn.style.display = awaiting ? 'inline-flex' : 'none';

    const modal = document.getElementById('requestModal');
    if (modal) modal.style.display = 'flex';
}

function approveAppointment(requestId) {
    const request = findAppointment(requestId);
    const what = request
        ? `${request.student_name}'s appointment on ${formatLongDate(request.preferred_date)} at ${ScheduleSlots.formatTime(request.preferred_time)}`
        : 'this appointment';

    // The confirm dialog sits below the request modal, so close that first.
    closeRequestModal();
    confirmAction(`Approve ${what}? The student will be notified.`, async () => {
        try {
            const response = await fetch('../../api/appointment-request', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: requestId, status: 'approved' })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to approve appointment');
            }
            showAlert('Appointment approved!', 'success');
        } catch (error) {
            console.error('Error approving appointment:', error);
            showAlert(error.message || 'Failed to approve appointment', 'error');
        }
        loadAppointmentRequests();
    }, { title: 'Approve appointment', confirmLabel: 'Approve', busyLabel: 'Approving...' });
}

function closeRequestModal() {
    const modal = document.getElementById('requestModal');
    if (modal) modal.style.display = 'none';
    currentEditingAppointmentId = null;
}

function approveAppointmentFromModal() {
    if (!currentEditingAppointmentId) {
        showAlert('No request selected', 'error');
        return;
    }
    approveAppointment(currentEditingAppointmentId);
}

document.addEventListener('DOMContentLoaded', initSchedulePage);
