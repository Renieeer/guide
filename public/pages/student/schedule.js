// Student Schedule: the school calendar plus the student's own appointment
// requests.
//
// A request can only be sent for a free slot. Times taken by a school event
// or by another student's session are greyed out here (js/schedule-slots.js),
// and api/appointment-request checks again when the request is saved, so a
// request never has to be declined or moved because of a clash. If someone
// takes the slot first, the server says so and the times are reloaded.

let currentCalendarDate = new Date();
let scheduleEventsCache = [];          // events in the month on screen
let studentAppointmentRequests = [];   // this student's own requests

document.addEventListener('DOMContentLoaded', initSchedulePage);

async function initSchedulePage() {
    checkAuth('student');
    loadUserInfo();
    renderSidebarAvatar();
    setupCalendarControls();
    setupEventListeners();
    setupAppointmentForm();
    await Promise.all([refreshScheduleEventsSafely(), loadStudentAppointmentRequests()]);
    renderAppointmentCalendar();
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

function getTodayDateStr() {
    return ScheduleSlots.todayStr();
}

function formatLongDate(dateStr) {
    return new Date(`${ScheduleSlots.datePart(dateStr)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function viewMonth() {
    return `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}`;
}

/* ===== AVAILABILITY ===== */

// What holds the slot (a school event or a booked session), or null. Uses
// the cached month data, so the date's month must be loaded first
// (loadAvailability()).
function slotOccupant(dateStr, time) {
    return ScheduleSlots.slotOccupant(
        dateStr,
        time,
        ScheduleSlots.eventsBetween(dateStr, dateStr),
        ScheduleSlots.bookedBetween(dateStr, dateStr)
    );
}

function isSlotUnavailable(dateStr, time) {
    return ScheduleSlots.isPastSlot(dateStr, time) || Boolean(slotOccupant(dateStr, time));
}

function isDateFullyBlocked(dateStr) {
    return ScheduleSlots.SLOTS.every(time => isSlotUnavailable(dateStr, time));
}

// The student's own session that day, if any: only one a day is allowed.
function ownSessionOn(dateStr) {
    return studentAppointmentRequests.find(req =>
        ScheduleSlots.datePart(req.preferred_date) === dateStr && ScheduleSlots.isActiveBooking(req)) || null;
}

async function loadAvailability(dateStr, force = false) {
    await ScheduleSlots.loadMonth(ScheduleSlots.monthOf(dateStr), { school: getCurrentSchool(), force });
}

// Greys out every "Preferred Time" option that can't be booked on dateStr,
// and clears the picked time if it just became unavailable.
function updateTimeSlotOptions(dateStr) {
    const select = document.getElementById('appointmentTimeInput');
    if (!select) return;

    Array.from(select.options).forEach(option => {
        if (!option.value) return;
        if (option.dataset.label === undefined) option.dataset.label = option.textContent;
        let note = '';
        if (dateStr) {
            if (ScheduleSlots.isPastSlot(dateStr, option.value)) {
                note = 'passed';
            } else {
                const occupant = slotOccupant(dateStr, option.value);
                if (occupant) note = occupant.kind === 'event' ? occupant.label : 'booked';
            }
        }
        option.disabled = Boolean(note);
        option.textContent = note ? `${option.dataset.label} (${note})` : option.dataset.label;
    });

    if (select.value && select.selectedOptions[0]?.disabled) {
        select.value = '';
    }
}

// Checks a picked date and loads its month's availability. Returns false
// (after telling the student why) when no request can be made for it.
async function checkDateForRequest(dateStr) {
    if (dateStr < getTodayDateStr()) {
        showAlert('You cannot request an appointment for a date that has already passed.', 'error');
        return false;
    }
    if (isWeekend(dateStr)) {
        showAlert(`${getWeekendName(dateStr)} is not available. Please select a weekday.`, 'error');
        return false;
    }
    try {
        await loadAvailability(dateStr);
    } catch (error) {
        console.error('Error loading availability:', error);
        showAlert('Could not check which times are free on that day. Please try again.', 'error');
        return false;
    }
    const own = ownSessionOn(dateStr);
    if (own) {
        showAlert(`You already have an appointment on ${formatLongDate(dateStr)} at ${ScheduleSlots.formatTime(own.preferred_time)}. Only one session a day is allowed, so please pick another day.`, 'error');
        return false;
    }
    if (isDateFullyBlocked(dateStr)) {
        showAlert('Every time on this date is already taken. Please choose another date.', 'error');
        return false;
    }
    return true;
}

/* ===== DATA ===== */

async function refreshScheduleEvents() {
    const data = await ScheduleSlots.loadMonth(viewMonth(), { school: getCurrentSchool(), force: true });
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

async function loadStudentAppointmentRequests() {
    const user = getCurrentUser();
    if (!user || !user.id) {
        studentAppointmentRequests = [];
        return;
    }
    try {
        // The list covers the whole school, but only this student's own rows
        // come back in full (see api/appointment-request).
        const response = await fetch(`../../api/appointment-request?school=${encodeURIComponent(getCurrentSchool())}`);
        const result = await response.json();
        if (!response.ok || !result.success) {
            studentAppointmentRequests = [];
            return;
        }
        studentAppointmentRequests = (result.data || []).filter(req => String(req.student_id) === String(user.id));
    } catch (error) {
        console.error('Error loading student appointment requests:', error);
        studentAppointmentRequests = [];
    }
}

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
            avatarEl.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="">`;
        } else {
            const initials = String(user.name || 'Student').split(' ').map(n => n[0]).join('');
            avatarEl.textContent = initials.substring(0, 2);
        }
    }
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

/* ===== CALENDAR ===== */

function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// escapeHtml() is the shared copy in js/utils.js.

// Fixed category per item so the calendar reads consistently at a glance:
// school events, appointments the student booked online, and counseling
// appointments the counselor scheduled. Each maps to a CSS class + icon — see
// the SCHEDULE CALENDAR section of css/style.css for the chip styling.
const SCHEDULE_CATEGORY_META = {
    event: { className: 'cat-event', icon: 'bi-calendar2-week', label: 'Event' },
    online: { className: 'cat-online', icon: 'bi-laptop', label: 'Online Appointment' },
    counseling: { className: 'cat-counseling', icon: 'bi-person-check-fill', label: 'Counseling Appointment' }
};

const REQUEST_STATUS_LABELS = {
    pending: '⏳ Waiting for counselor approval',
    // Older requests a counselor moved to a new time before that option was
    // removed; they still only need approving.
    proposed_change: '⏳ Waiting for counselor approval',
    approved: '✓ Approved',
    rejected: '✗ Rejected',
    cancelled: '✗ Cancelled'
};

function renderAppointmentCalendar() {
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

    // Rejected/cancelled requests stay in My History, not on the calendar.
    const activeRequests = studentAppointmentRequests.filter(ScheduleSlots.isActiveBooking);

    let html = '<div class="schedule-calendar-grid">';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
        html += `<div class="schedule-calendar-weekday">${day}</div>`;
    });

    for (let index = 0; index < totalCells; index++) {
        const cellDay = index - startDay + 1;

        // Days from the neighbouring months only pad out the first/last week;
        // their items show when that month is opened.
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
        const dayItems = [
            ...scheduleEventsCache
                .filter(event => ScheduleSlots.eventCoversDate(event, dateStr))
                .map(event => ({ id: event.id || '', title: event.title || 'Event', category: 'event' })),
            ...activeRequests
                .filter(req => ScheduleSlots.datePart(req.preferred_date) === dateStr)
                .map(req => ({
                    id: req.id || '',
                    title: `${ScheduleSlots.formatTime(req.preferred_time)} Appointment`,
                    category: req.booking_type === 'counseling' ? 'counseling' : 'online'
                }))
        ];

        html += `<div class="schedule-calendar-day ${dateStr === today ? 'is-today' : ''}" data-date="${dateStr}">
            <div class="schedule-day-number">${cellDay}</div>
            <div class="schedule-event-list">`;

        dayItems.forEach(item => {
            const itemTitle = escapeHtml(item.title);
            const meta = SCHEDULE_CATEGORY_META[item.category] || SCHEDULE_CATEGORY_META.event;
            html += `<div class="schedule-event-block ${escapeHtml(meta.className)}" data-event-id="${escapeHtml(item.id)}" title="${escapeHtml(meta.label)}: ${itemTitle}"><i class="bi ${escapeHtml(meta.icon)}"></i><span class="chip-label">${itemTitle}</span></div>`;
        });

        html += '</div></div>';
    }

    html += '</div>';
    calendarEl.innerHTML = html;
    attachCalendarClickHandlers();
}

function attachCalendarClickHandlers() {
    const container = document.getElementById('scheduleCalendar');
    if (!container || container.dataset.listenerAttached) return;
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

// Clicking a day on the calendar starts a new appointment request for that
// date, so students don't have to open the panel and re-pick the date.
async function openRequestFormForDate(dateStr) {
    const formPanel = document.getElementById('appointmentFormPanel');
    const dateInput = document.getElementById('appointmentDateInput');
    const timeInput = document.getElementById('appointmentTimeInput');
    if (!formPanel || !dateInput) return;

    // Fresh booked times for that month, so what's shown is current.
    try {
        await loadAvailability(dateStr, true);
    } catch (error) {
        console.error('Error loading availability:', error);
    }
    if (!(await checkDateForRequest(dateStr))) return;

    dateInput.min = getTodayDateStr();
    dateInput.value = dateStr;
    updateTimeSlotOptions(dateStr);
    formPanel.style.display = 'block';
    timeInput?.focus();
}

/* ===== DETAIL MODALS ===== */

function setupEventListeners() {
    const viewModal = document.getElementById('viewEventModal');
    document.getElementById('closeViewEventModal')?.addEventListener('click', () => { if (viewModal) viewModal.style.display = 'none'; });
    viewModal?.addEventListener('click', (e) => { if (e.target === viewModal) viewModal.style.display = 'none'; });

    const requestModal = document.getElementById('viewAppointmentRequestModal');
    document.getElementById('closeAppointmentRequestModal')?.addEventListener('click', () => { if (requestModal) requestModal.style.display = 'none'; });
    requestModal?.addEventListener('click', (e) => { if (e.target === requestModal) requestModal.style.display = 'none'; });
}

function openViewEventModal(id) {
    const request = studentAppointmentRequests.find(r => r.id === id);
    if (request) {
        openViewAppointmentRequestModal(request);
        return;
    }

    const ev = scheduleEventsCache.find(e => e.id === id);
    if (!ev) return;

    const start = ScheduleSlots.datePart(ev.date);
    const end = ScheduleSlots.datePart(ev.endDate);
    const range = !end || end === start
        ? formatLongDate(start)
        : `${new Date(`${start}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${formatLongDate(end)}`;
    const span = ScheduleSlots.eventWindow(ev);
    const time = span === 'all'
        ? 'All Day'
        : ev.endTime ? `${ScheduleSlots.formatTime(ev.time)} – ${ScheduleSlots.formatTime(ev.endTime)}` : ScheduleSlots.formatTime(ev.time);

    document.getElementById('viewEventTitle').textContent = ev.title || 'Event';
    document.getElementById('viewEventRange').textContent = range;
    document.getElementById('viewEventTime').textContent = time;
    document.getElementById('viewEventDescription').textContent = ev.description || 'No description';

    const viewModal = document.getElementById('viewEventModal');
    if (viewModal) viewModal.style.display = 'flex';
}

function openViewAppointmentRequestModal(request) {
    const modal = document.getElementById('viewAppointmentRequestModal');
    if (!modal) return;

    document.getElementById('requestReason').textContent = request.reason ? request.reason.replace(/-/g, ' ') : 'Not specified';
    document.getElementById('requestDateTime').textContent = `${formatLongDate(request.preferred_date)} at ${ScheduleSlots.formatTime(request.preferred_time)}`;
    const status = String(request.status || '').toLowerCase();
    document.getElementById('requestStatus').textContent = REQUEST_STATUS_LABELS[status] || request.status;

    const notesSection = document.getElementById('requestNotesSection');
    if (request.notes && request.notes.trim()) {
        document.getElementById('requestNotes').textContent = request.notes;
        if (notesSection) notesSection.style.display = 'flex';
    } else if (notesSection) {
        notesSection.style.display = 'none';
    }

    modal.style.display = 'flex';
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', requestLogout);

/* ===== APPOINTMENT REQUEST FORM ===== */

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

    // Only 'change': listening to input/change/blur as well showed every
    // alert up to three times for one pick.
    dateInput?.addEventListener('change', async function() {
        const selectedDate = this.value;
        updateTimeSlotOptions('');
        if (!selectedDate) return;
        const ok = await checkDateForRequest(selectedDate);
        if (this.value !== selectedDate) return; // picked again meanwhile
        if (!ok) {
            this.value = '';
            return;
        }
        updateTimeSlotOptions(selectedDate);
    });
}

// Reloads what is booked around dateStr (after a request is saved, or after
// the server said its slot was already taken) and redraws the page.
async function reloadAvailabilityFor(dateStr) {
    try {
        await Promise.all([loadAvailability(dateStr, true), loadStudentAppointmentRequests()]);
        await refreshScheduleEvents();
    } catch (error) {
        console.error('Error reloading availability:', error);
    }
    renderAppointmentCalendar();
    updateTimeSlotOptions(dateStr);
}

async function submitAppointmentRequest(e) {
    e.preventDefault();

    const date = document.getElementById('appointmentDateInput').value;
    const time = document.getElementById('appointmentTimeInput').value;
    const reason = document.getElementById('appointmentReasonSelect').value;
    const notes = document.getElementById('appointmentNotesInput').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!date || !time || !reason) {
        showAlert('Please fill all required fields', 'error');
        return;
    }

    if (!(await checkDateForRequest(date))) return;

    if (isSlotUnavailable(date, time)) {
        showAlert('That time is no longer available. Please choose another time.', 'error');
        updateTimeSlotOptions(date);
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
        const response = await fetch('../../api/appointment-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                preferred_date: date,
                preferred_time: time,
                reason,
                notes
            })
        });

        const result = await response.json();
        if (response.status === 409 || result.conflict) {
            showAlert(result.message || 'That time was just taken. Please choose another time.', 'error');
            await reloadAvailabilityFor(date);
            return;
        }
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to submit appointment request');
        }

        showAlert('Appointment request sent. Your counselor will approve it.', 'success');
        document.getElementById('appointmentRequestForm').reset();
        updateTimeSlotOptions('');
        document.getElementById('appointmentFormPanel').style.display = 'none';

        // Refresh so the new request shows on the calendar and its slot is
        // greyed out from now on.
        await reloadAvailabilityFor(date);
    } catch (error) {
        console.error('Error submitting appointment request:', error);
        showAlert(error.message || 'Failed to submit appointment request', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}
