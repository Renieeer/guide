// Stage 6 (Student Follow-up) for a referral — shared by the counselor and
// counselor-and-coordinator referral pages (pages/counselor/referral-status.js
// and pages/other-school/referrals.js call FollowUpScheduler.open()).
//
// 1. A month calendar (same look as the counseling "Appoint Students"
//    calendar) where the counselor picks every day the student should come
//    back, each with its own time. Every day shows how many students are
//    already booked, and clicking a day lists everything set on it (school
//    events and every student's appointments), so sessions can be spread
//    out and the office doesn't get crowded on one day.
// 2. "Schedule sessions" books each picked day as a real counseling
//    appointment (api/appointment-request, auto-approved for staff, so it
//    shows on the Schedule page and the student is notified like any other
//    staff-scheduled appointment). The reason names the referral code, which
//    api/appointment-request uses to tie it back to this referral's reason.
// 3. The check-in log, shown as a folder: each check-in is a "file" dated the
//    day it was saved; "Next session" is the next follow-up session after it.
//
// Needs js/utils.js (escapeHtml, showAlert, confirmAction, localDateString)
// and js/auth.js (getCurrentUser).

const FollowUpScheduler = (() => {
    const APPOINTMENT_API = '../../api/appointment-request';
    const EVENTS_API = '../../api/schedule-events';
    const FOLLOW_UP_API = '../../api/referral-follow-up';

    // Same 30-minute slots as the Appoint Students "Preferred time" list.
    const SLOT_MINUTES = 30;
    const SLOT_GROUPS = [
        { label: 'Morning (8:00 AM - 12:00 PM)', slots: ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] },
        { label: 'Afternoon (1:00 PM - 4:00 PM)', slots: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'] }
    ];
    const ALL_SLOTS = SLOT_GROUPS.flatMap(g => g.slots);
    // Appointments in these states hold their time slot (same rule as the
    // student booking page and the Appoint Students modal).
    const HOLDING_STATUSES = new Set(['pending', 'approved']);
    const INACTIVE_STATUSES = new Set(['rejected', 'cancelled']);
    // Students booked on one day: 3+ is busy, 5+ is crowded.
    const LOAD_BUSY = 3;
    const LOAD_FULL = 5;
    const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const state = {
        referral: null,
        viewDate: new Date(),
        selected: new Map(),     // 'YYYY-MM-DD' -> 'HH:MM' ('' = no time yet)
        agendaDate: '',
        lastTime: '',
        appointments: [],
        eventsByMonth: new Map(), // 'YYYY-MM' -> schedule events
        loadId: 0,
        wired: false
    };

    const $ = (id) => document.getElementById(id);

    /* ---------- dates & times ---------- */

    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
    function today() { return ymd(new Date()); }
    function datePart(v) { return String(v || '').split('T')[0].split(' ')[0]; }
    function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
    function isWeekend(s) { const day = parseDay(s).getDay(); return day === 0 || day === 6; }
    function fmtLong(s) { return parseDay(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
    function fmtShort(s) { return parseDay(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
    function fmtDay(s) { return s ? parseDay(datePart(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
    function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }

    function toMinutes(t) {
        const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    }
    function fmtTime(t) {
        const min = toMinutes(t);
        if (min === null) return String(t || '');
        const h = Math.floor(min / 60) % 24;
        return `${h % 12 || 12}:${pad(min % 60)} ${h < 12 ? 'AM' : 'PM'}`;
    }

    /* ---------- what's on a day ---------- */

    function referralCode() {
        const r = state.referral || {};
        return String(r.referral_code || r.id || '');
    }

    function studentId() {
        return String((state.referral || {}).student_id || '').trim();
    }

    // This referral's own follow-up sessions: booked from here, so the reason
    // names the referral code ("Follow-up session for referral REF-...").
    function isOwnSession(a) {
        const code = referralCode();
        return Boolean(code) && String(a.student_id) === studentId()
            && String(a.reason || '').includes(code) && /follow-up/i.test(String(a.reason || ''));
    }

    function eventsOn(dateStr) {
        const events = state.eventsByMonth.get(dateStr.slice(0, 7)) || [];
        return events.filter(ev => {
            const start = datePart(ev.date);
            const end = datePart(ev.endDate) || start;
            return start && dateStr >= start && dateStr <= end;
        });
    }

    function appointmentsOn(dateStr) {
        return state.appointments
            .filter(a => datePart(a.preferred_date) === dateStr && !INACTIVE_STATUSES.has(String(a.status || '').toLowerCase()))
            .sort((a, b) => (toMinutes(a.preferred_time) ?? 0) - (toMinutes(b.preferred_time) ?? 0));
    }

    function dayInfo(dateStr) {
        const events = eventsOn(dateStr);
        const appts = appointmentsOn(dateStr);
        const students = appts.length;
        // This referral's student's own appointments that day (any kind).
        const mine = appts.filter(a => String(a.student_id) === studentId());
        return {
            events,
            appts,
            students,
            mine,
            blocked: events.some(ev => ev.allDay),
            own: mine.length > 0,
            level: students >= LOAD_FULL ? 'full' : students >= LOAD_BUSY ? 'busy' : students > 0 ? 'light' : 'free'
        };
    }

    // Who or what holds the slot starting at `time` on `dateStr`, or null.
    function slotOccupant(dateStr, time) {
        const start = toMinutes(time);
        if (start === null) return null;
        const end = start + SLOT_MINUTES;
        for (const ev of eventsOn(dateStr)) {
            if (ev.allDay) return ev.title || 'All-day event';
            const s = toMinutes(ev.time), e = toMinutes(ev.endTime);
            if (s !== null && e !== null && start < e && end > s) return ev.title || 'Event';
        }
        for (const a of appointmentsOn(dateStr)) {
            if (!HOLDING_STATUSES.has(String(a.status || '').toLowerCase())) continue;
            const s = toMinutes(a.preferred_time);
            if (s !== null && start < s + SLOT_MINUTES && end > s) return a.student_name || 'Another student';
        }
        return null;
    }

    function freeSlotCount(dateStr) {
        return ALL_SLOTS.filter(t => !slotOccupant(dateStr, t)).length;
    }

    // One session a day per student: a day the student already has an
    // appointment on can't be picked (api/appointment-request enforces it too).
    function isSelectable(dateStr) {
        const info = dayInfo(dateStr);
        return dateStr >= today() && !isWeekend(dateStr) && !info.blocked && !info.own;
    }

    function studentName() {
        return (state.referral && state.referral.student_name) || 'The student';
    }

    function loadText(students) {
        return students === 0 ? 'No students booked' : `${students} student${students === 1 ? '' : 's'} booked`;
    }

    /* ---------- data ---------- */

    function school() {
        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        return (user && user.school_attended) || (state.referral && (state.referral.school_attended || state.referral.student_school)) || '';
    }

    async function loadAppointments() {
        const res = await fetch(`${APPOINTMENT_API}?school=${encodeURIComponent(school())}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Could not load appointments');
        state.appointments = json.data || [];
    }

    async function loadEvents(date) {
        const key = monthKey(date);
        if (state.eventsByMonth.has(key)) return;
        const res = await fetch(`${EVENTS_API}?school=${encodeURIComponent(school())}&month=${encodeURIComponent(key)}`);
        const json = await res.json();
        state.eventsByMonth.set(key, json && json.success ? (json.data || []) : []);
    }

    async function refreshCalendarData({ appointments = false } = {}) {
        const id = ++state.loadId;
        // Events for the month on screen plus every month a picked day is in,
        // so time-slot checks on picked days stay right after paging away.
        const months = [state.viewDate, ...[...state.selected.keys()].map(parseDay)];
        try {
            await Promise.all([...months.map(loadEvents), appointments ? loadAppointments() : Promise.resolve()]);
        } catch (error) {
            console.error('Follow-up calendar:', error);
            if (id === state.loadId) showAlert('Some schedules could not be loaded. The calendar may be incomplete.', 'warning');
        }
        if (id === state.loadId) render();
    }

    /* ---------- rendering ---------- */

    function render() {
        renderCalendar();
        renderAgenda();
        renderSelected();
    }

    function renderCalendar() {
        const grid = $('fusCalendarGrid');
        const label = $('fusCalendarMonth');
        if (!grid || !label) return;

        const year = state.viewDate.getFullYear();
        const month = state.viewDate.getMonth();
        const startDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = Math.ceil((startDay + daysInMonth) / 7) * 7;
        const now = today();

        label.textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        let html = WEEKDAYS.map(d => `<div class="appoint-mini-weekday">${d}</div>`).join('');
        for (let i = 0; i < cells; i++) {
            const day = i - startDay + 1;
            if (day < 1 || day > daysInMonth) {
                html += '<div class="appoint-mini-day is-outside" aria-hidden="true"></div>';
                continue;
            }
            const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
            const info = dayInfo(dateStr);
            const selectable = isSelectable(dateStr);
            const selected = state.selected.has(dateStr);
            const classes = ['appoint-mini-day', 'fus-day', `load-${info.level}`];
            if (dateStr === now) classes.push('is-today');
            if (!selectable) classes.push('is-disabled');
            if (selected) classes.push('is-selected');
            if (info.own) classes.push('has-own');
            if (info.events.length) classes.push(info.blocked ? 'is-blocked' : 'has-events');
            if (dateStr === state.agendaDate) classes.push('is-focused');

            const parts = [fmtLong(dateStr), loadText(info.students)];
            if (info.blocked) parts.push('all-day event, not available');
            else if (info.events.length) parts.push(`${info.events.length} event${info.events.length === 1 ? '' : 's'}`);
            if (info.own) parts.push(`${studentName()} already has a session, one a day only`);
            if (selected) parts.push('picked for a session');
            const title = parts.join(' · ');

            html += `<button type="button" class="${classes.join(' ')}" data-date="${dateStr}" aria-pressed="${selected}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
                <span class="appoint-day-num">${day}</span>
                <span class="fus-load">${info.students > 0 ? info.students : ''}</span>
            </button>`;
        }
        grid.innerHTML = html;
    }

    function renderAgenda() {
        const chip = $('fusAgendaDate');
        const list = $('fusAgendaList');
        if (!chip || !list) return;
        const dateStr = state.agendaDate;
        if (!dateStr) {
            chip.innerHTML = '<i class="bi bi-calendar-x"></i> <span class="placeholder">Click a day to see what\'s set on it</span>';
            list.innerHTML = '';
            return;
        }
        chip.innerHTML = `<i class="bi bi-calendar-check"></i> ${escapeHtml(fmtLong(dateStr))}`;

        const info = dayInfo(dateStr);
        const notes = [];
        if (dateStr < today()) notes.push('This day has passed.');
        else if (isWeekend(dateStr)) notes.push('Weekends are not available for appointments.');
        else if (info.blocked) notes.push('An all-day event is set, so no sessions can be booked.');
        if (info.own) {
            const times = info.mine.map(a => fmtTime(a.preferred_time)).join(', ');
            notes.push(`${studentName()} already has a session at ${times}. A student can only have one session a day.`);
        }

        const free = freeSlotCount(dateStr);
        const summaryClass = info.blocked || info.level === 'full' ? 'is-full' : info.level === 'busy' ? 'is-busy' : 'is-light';
        const slotsText = info.blocked ? 'not available' : `${free} of ${ALL_SLOTS.length} time slots free`;
        const summary = `<div class="fus-agenda-summary ${summaryClass}">
            <i class="bi bi-people-fill"></i>
            <span><strong>${escapeHtml(loadText(info.students))}</strong> &middot; ${slotsText}${info.level === 'full' ? ' &middot; crowded day' : ''}</span>
        </div>`;

        const items = [
            ...info.events.map(ev => {
                const when = ev.allDay ? 'All day' : `${fmtTime(ev.time)}${ev.endTime ? ` – ${fmtTime(ev.endTime)}` : ''}`;
                return `<li class="fus-agenda-item is-event">
                    <i class="bi bi-calendar2-week" aria-hidden="true"></i>
                    <span class="fus-agenda-time">${escapeHtml(when)}</span>
                    <span class="fus-agenda-what">${escapeHtml(ev.title || 'Event')}</span>
                </li>`;
            }),
            ...info.appts.map(a => {
                const own = String(a.student_id) === studentId();
                const tag = isOwnSession(a) ? 'This referral' : 'This student';
                const type = a.booking_type === 'counseling' ? 'Counseling' : 'Online';
                const status = String(a.status || 'pending').toLowerCase();
                return `<li class="fus-agenda-item is-appt${own ? ' is-own' : ''}">
                    <i class="bi ${a.booking_type === 'counseling' ? 'bi-person-check-fill' : 'bi-laptop'}" aria-hidden="true"></i>
                    <span class="fus-agenda-time">${escapeHtml(fmtTime(a.preferred_time))}</span>
                    <span class="fus-agenda-what">${escapeHtml(a.student_name || 'Student')}${own ? ` <span class="fus-own-tag">${tag}</span>` : ''}
                        <small>${escapeHtml(type)} &middot; ${escapeHtml(status === 'approved' ? 'scheduled' : status)}</small></span>
                </li>`;
            })
        ];

        list.innerHTML = notes.map(n => `<p class="fus-agenda-note"><i class="bi bi-info-circle"></i> ${escapeHtml(n)}</p>`).join('')
            + summary
            + (items.length
                ? `<ul class="fus-agenda-list">${items.join('')}</ul>`
                : '<div class="appoint-day-events is-vacant"><i class="bi bi-check-circle"></i> Fully vacant: no events or appointments on this day.</div>');
    }

    function timeOptions(dateStr, chosen) {
        let html = '<option value="">Select a time...</option>';
        SLOT_GROUPS.forEach(group => {
            html += `<optgroup label="${escapeHtml(group.label)}">`;
            group.slots.forEach(t => {
                const occupant = slotOccupant(dateStr, t);
                const label = occupant ? `${fmtTime(t)} — taken (${occupant})` : fmtTime(t);
                html += `<option value="${t}"${occupant ? ' disabled' : ''}${t === chosen ? ' selected' : ''}>${escapeHtml(label)}</option>`;
            });
            html += '</optgroup>';
        });
        return html;
    }

    function renderSelected() {
        const list = $('fusSelectedList');
        const count = $('fusSelectedCount');
        const btn = $('fusScheduleBtn');
        if (!list) return;

        const dates = [...state.selected.keys()].sort();
        if (count) count.textContent = dates.length ? `${dates.length} picked` : '';
        if (btn) {
            btn.disabled = dates.length === 0 || !canSchedule();
            btn.innerHTML = `<i class="bi bi-calendar-plus"></i> ${dates.length > 1 ? `Schedule ${dates.length} sessions` : 'Schedule session'}`;
        }

        if (!canSchedule()) {
            list.innerHTML = '<p class="fus-empty">This referral isn\'t linked to a student account, so sessions can\'t be booked from here.</p>';
            return;
        }
        if (dates.length === 0) {
            list.innerHTML = '<p class="fus-empty">Pick one or more days on the calendar. Each day you pick becomes a session the student should come back for.</p>';
            return;
        }

        list.innerHTML = dates.map(dateStr => {
            const info = dayInfo(dateStr);
            const loadClass = info.level === 'full' ? 'is-full' : info.level === 'busy' ? 'is-busy' : 'is-light';
            return `<div class="fus-selected-row" data-date="${dateStr}">
                <div class="fus-selected-date">
                    <strong>${escapeHtml(fmtShort(dateStr))}</strong>
                    <small class="${loadClass}">${escapeHtml(loadText(info.students))}${info.level === 'full' ? ' · crowded' : ''}</small>
                </div>
                <select class="fus-time" data-date="${dateStr}" aria-label="Time on ${escapeHtml(fmtLong(dateStr))}">${timeOptions(dateStr, state.selected.get(dateStr))}</select>
                <button type="button" class="fus-remove" data-date="${dateStr}" aria-label="Remove ${escapeHtml(fmtLong(dateStr))}" title="Remove"><i class="bi bi-x-lg"></i></button>
            </div>`;
        }).join('');
    }

    /* ---------- actions ---------- */

    function canSchedule() {
        return /^\d+$/.test(studentId());
    }

    function firstFreeTime(dateStr) {
        if (state.lastTime && !slotOccupant(dateStr, state.lastTime)) return state.lastTime;
        return ALL_SLOTS.find(t => !slotOccupant(dateStr, t)) || '';
    }

    function onDayClick(dateStr) {
        state.agendaDate = dateStr;
        if (isSelectable(dateStr) && canSchedule()) {
            if (state.selected.has(dateStr)) state.selected.delete(dateStr);
            else state.selected.set(dateStr, firstFreeTime(dateStr));
        }
        render();
    }

    async function changeMonth(delta) {
        state.viewDate = delta === 0
            ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            : new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + delta, 1);
        renderCalendar();
        await refreshCalendarData();
    }

    function scheduleSessions() {
        const referral = state.referral;
        const dates = [...state.selected.keys()].sort();
        if (!referral || dates.length === 0) return;

        const doubled = dates.filter(d => dayInfo(d).own);
        if (doubled.length) {
            doubled.forEach(d => state.selected.delete(d));
            render();
            showAlert(`${studentName()} already has a session on ${doubled.map(fmtShort).join(', ')}. A student can only have one session a day, so ${doubled.length === 1 ? 'that day was' : 'those days were'} removed.`, 'warning');
            return;
        }
        const missing = dates.filter(d => !state.selected.get(d));
        if (missing.length) {
            showAlert(`Pick a time for ${missing.map(fmtShort).join(', ')}.`, 'warning');
            return;
        }
        const taken = dates.filter(d => slotOccupant(d, state.selected.get(d)));
        if (taken.length) {
            showAlert(`The time picked is already taken on ${taken.map(fmtShort).join(', ')}. Choose another time.`, 'warning');
            return;
        }

        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        const note = ($('fusNote')?.value || '').trim();
        const reason = `Follow-up session for referral ${referralCode()}`;
        const name = referral.student_name || 'the student';

        confirmAction(
            `Schedule ${dates.length} follow-up session${dates.length === 1 ? '' : 's'} for ${name}? Each one is added to the Schedule and the student is notified.`,
            async () => {
                const failed = [];
                for (const date of dates) {
                    try {
                        const res = await fetch(APPOINTMENT_API, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                student_id: studentId(),
                                student_name: referral.student_name || '',
                                preferred_date: date,
                                preferred_time: state.selected.get(date),
                                reason,
                                notes: note,
                                school: school(),
                                role: user?.role || '',
                                counselor_id: user?.id || 0
                            })
                        });
                        const json = await res.json();
                        if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
                        state.selected.delete(date);
                    } catch (error) {
                        failed.push(`${fmtShort(date)} (${error.message})`);
                    }
                }

                const booked = dates.length - failed.length;
                if (booked) showAlert(`${booked} follow-up session${booked === 1 ? '' : 's'} scheduled.`, 'success');
                if (failed.length) showAlert(`Could not schedule: ${failed.join('; ')}`, 'error');
                if (booked && $('fusNote')) $('fusNote').value = '';
                await refreshCalendarData({ appointments: true });
            },
            { title: 'Schedule follow-up sessions', confirmLabel: 'Schedule', busyLabel: 'Scheduling...' }
        );
    }

    /* ---------- check-in log ---------- */

    // The next follow-up session after `dateStr` that's still on.
    function nextSessionAfter(dateStr) {
        return state.appointments
            .filter(a => isOwnSession(a) && HOLDING_STATUSES.has(String(a.status || '').toLowerCase()) && datePart(a.preferred_date) > dateStr)
            .map(a => datePart(a.preferred_date))
            .sort()[0] || '';
    }

    function setFolderInfo(rows) {
        const count = $('fusCheckinCount');
        const summary = $('fusFolderSummary');
        if (count) count.textContent = rows ? rows.length : '…';
        if (summary) {
            summary.textContent = !rows ? 'Loading check-ins…'
                : rows.length === 0 ? 'Empty: no check-ins saved yet.'
                : `${rows.length} check-in${rows.length === 1 ? '' : 's'}, latest on ${fmtDay(rows[0].follow_up_date)}. Click the tab to open.`;
        }
    }

    // Each saved check-in is a "file" in the Check-in log folder, newest first.
    function checkInFile(row, number) {
        const intervalLabels = { weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly', custom: 'Custom' };
        const next = row.interval_label === 'scheduled'
            ? (row.next_follow_up_date ? `Next session ${fmtDay(row.next_follow_up_date)}` : 'No further session scheduled')
            : `${intervalLabels[row.interval_label] || row.interval_label} (${row.interval_days}d) · next due ${fmtDay(row.next_follow_up_date)}`;
        return `<div class="fus-file">
            <div class="fus-file-head">
                <i class="bi bi-file-earmark-text fus-file-icon" aria-hidden="true"></i>
                <div class="fus-file-title">
                    <strong>${escapeHtml(fmtDay(row.follow_up_date))}</strong>
                    <small>Check-in #${number}</small>
                </div>
            </div>
            ${row.notes ? `<p class="fus-file-note">${escapeHtml(row.notes)}</p>` : ''}
            <div class="fus-file-foot">
                <span><i class="bi bi-person" aria-hidden="true"></i> ${escapeHtml(row.counselor_name || 'Counselor')}</span>
                <span class="fus-file-next"><i class="bi bi-calendar-event" aria-hidden="true"></i> ${escapeHtml(next)}</span>
            </div>
        </div>`;
    }

    function loadCheckIns() {
        const container = $('followUpHistoryList');
        const referral = state.referral;
        if (!container || !referral) return;
        container.innerHTML = '<p class="fus-empty">Loading check-ins...</p>';
        setFolderInfo(null);

        fetch(`${FOLLOW_UP_API}?referral_id=${encodeURIComponent(referral.id)}`)
            .then(response => response.json())
            .then(result => {
                if (!result.success) throw new Error(result.message || 'Failed to load follow-up check-ins');
                const rows = result.data || [];
                setFolderInfo(rows);
                container.innerHTML = rows.length === 0
                    ? '<p class="fus-empty fus-files-empty"><i class="bi bi-folder2"></i> This folder is empty. Save the first check-in below.</p>'
                    : rows.map((row, i) => checkInFile(row, rows.length - i)).join('');
                container.scrollTop = 0;
                fitFileList();
                // Icon/web fonts arriving later change line wraps, so measure again.
                document.fonts?.ready?.then(fitFileList);
            })
            .catch(error => {
                container.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
                fitFileList();
            });
    }

    // Shows the newest VISIBLE_FILES check-ins; any older ones scroll inside
    // the folder instead of making the page longer.
    const VISIBLE_FILES = 3;
    function fitFileList() {
        const list = $('followUpHistoryList');
        if (!list) return;
        const files = list.querySelectorAll('.fus-file');
        let more = $('fusFilesMore');
        list.style.maxHeight = '';
        if (files.length <= VISIBLE_FILES || !list.offsetParent) {
            list.classList.remove('is-scrollable');
            if (more) more.remove();
            return;
        }
        // Scrollable first (it reserves the scrollbar's width), then measure,
        // so the text doesn't re-wrap after the height is set.
        list.classList.add('is-scrollable');
        const last = files[VISIBLE_FILES - 1];
        list.style.maxHeight = `${last.offsetTop + last.offsetHeight + 4}px`;
        if (!more) {
            more = document.createElement('p');
            more.id = 'fusFilesMore';
            more.className = 'fus-files-more';
            list.after(more);
        }
        const older = files.length - VISIBLE_FILES;
        more.innerHTML = `<i class="bi bi-arrow-down-circle" aria-hidden="true"></i> Scroll for ${older} older check-in${older === 1 ? '' : 's'}`;
    }

    function setFolderOpen(isOpen) {
        const folder = $('fusCheckinFolder');
        const toggle = $('fusFolderToggle');
        if (!folder || !toggle) return;
        folder.classList.toggle('is-open', isOpen);
        toggle.setAttribute('aria-expanded', String(isOpen));
        const icon = toggle.querySelector('.fus-folder-icon');
        if (icon) icon.className = `bi ${isOpen ? 'bi-folder2-open' : 'bi-folder2'} fus-folder-icon`;
        fitFileList();
    }

    // A check-in is dated the day it's saved.
    function submitCheckIn(e) {
        e.preventDefault();
        const referral = state.referral;
        const date = localDateString();
        const notes = $('followUpNotes').value.trim();
        if (!notes) { showAlert('Write a note about this check-in before saving.', 'warning'); return; }

        const next = nextSessionAfter(date);
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        fetch(FOLLOW_UP_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                referral_id: referral.id,
                interval_label: 'scheduled',
                interval_days: next ? daysBetween(date, next) : 0,
                follow_up_date: date,
                next_follow_up_date: next,
                notes
            })
        })
            .then(response => response.json())
            .then(result => {
                if (!result.success) throw new Error(result.message || 'Failed to save check-in');
                showAlert('Check-in saved.', 'success');
                $('followUpNotes').value = '';
                loadCheckIns();
            })
            .catch(error => showAlert(error.message || 'Failed to save check-in.', 'error'))
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHtml;
            });
    }

    /* ---------- wiring ---------- */

    function wire() {
        if (state.wired) return;
        state.wired = true;

        $('fusCalendarGrid')?.addEventListener('click', (e) => {
            const cell = e.target.closest('.fus-day');
            if (cell && cell.dataset.date) onDayClick(cell.dataset.date);
        });
        $('fusPrevMonth')?.addEventListener('click', () => changeMonth(-1));
        $('fusNextMonth')?.addEventListener('click', () => changeMonth(1));
        $('fusTodayBtn')?.addEventListener('click', () => changeMonth(0));

        const list = $('fusSelectedList');
        list?.addEventListener('change', (e) => {
            const select = e.target.closest('.fus-time');
            if (!select) return;
            state.selected.set(select.dataset.date, select.value);
            if (select.value) state.lastTime = select.value;
        });
        list?.addEventListener('click', (e) => {
            const btn = e.target.closest('.fus-remove');
            if (!btn) return;
            state.selected.delete(btn.dataset.date);
            render();
        });

        $('fusScheduleBtn')?.addEventListener('click', scheduleSessions);
        $('followUpForm')?.addEventListener('submit', submitCheckIn);
        $('fusFolderToggle')?.addEventListener('click', () => {
            setFolderOpen(!$('fusCheckinFolder').classList.contains('is-open'));
        });
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(fitFileList, 150);
        });
    }

    // Called each time Stage 6 is shown for a referral.
    async function open(referral) {
        wire();
        if (!state.referral || String(state.referral.id) !== String(referral.id)) {
            state.selected.clear();
            state.agendaDate = '';
            state.viewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        }
        state.referral = referral;
        state.eventsByMonth.clear();

        render();
        loadCheckIns();
        await refreshCalendarData({ appointments: true });
    }

    return { open };
})();
