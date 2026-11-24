// Time-slot rules shared by every Schedule page (student, counselor,
// coordinator, counselor-and-coordinator). The server applies the same rules
// whenever something is saved (app/Support/ScheduleAvailability.php), so this
// file only greys out what's already taken before anyone picks it:
//
// - A counseling session is one 30-minute slot starting at one of SLOTS.
// - A session holds its slot unless it was rejected or cancelled.
// - An all-day event blocks the whole day; a timed event blocks its
//   [start, end) window, or one slot when it has no end time.
//
// Also keeps each month's events and booked times (GET api/schedule-events
// returns both; booked times carry no names) in a small cache.
//
// Exposes one global, ScheduleSlots. Needs nothing else.

const ScheduleSlots = (() => {
    const API = '../../api/schedule-events';
    const SLOT_MINUTES = 30;
    const SLOTS = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];
    const INACTIVE_STATUSES = new Set(['rejected', 'cancelled']);

    const pad = (n) => String(n).padStart(2, '0');

    /* ---------- dates & times ---------- */

    function toMinutes(time) {
        const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    }

    // "13:30" -> "1:30 PM"; anything that isn't a time comes back as-is.
    function formatTime(time) {
        const minutes = toMinutes(time);
        if (minutes === null) return String(time ?? '');
        const h = Math.floor(minutes / 60) % 24;
        return `${h % 12 || 12}:${pad(minutes % 60)} ${h < 12 ? 'AM' : 'PM'}`;
    }

    function datePart(value) {
        return String(value ?? '').split('T')[0].split(' ')[0];
    }

    function todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function monthOf(dateStr) {
        return String(dateStr).slice(0, 7);
    }

    // Every 'YYYY-MM-DD' from `from` to `to`, inclusive (a year at most).
    function daysBetween(from, to) {
        const days = [];
        if (!from) return days;
        const [y, m, d] = from.split('-').map(Number);
        const cursor = new Date(y, m - 1, d);
        const last = to && to > from ? to : from;
        while (days.length < 366) {
            const day = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
            days.push(day);
            if (day >= last) break;
            cursor.setDate(cursor.getDate() + 1);
        }
        return days;
    }

    // A slot today whose start time has already gone by.
    function isPastSlot(dateStr, time) {
        const today = todayStr();
        if (dateStr !== today) return dateStr < today;
        const now = new Date();
        const start = toMinutes(time);
        return start !== null && start <= now.getHours() * 60 + now.getMinutes();
    }

    /* ---------- what holds a slot ---------- */

    function isActiveBooking(booking) {
        return !INACTIVE_STATUSES.has(String(booking?.status ?? '').toLowerCase());
    }

    function bookingDate(booking) {
        return datePart(booking.date || booking.preferred_date);
    }

    function bookingStart(booking) {
        return toMinutes(booking.time || booking.preferred_time);
    }

    function eventCoversDate(event, dateStr) {
        const start = datePart(event.date);
        const end = datePart(event.endDate) || start;
        return Boolean(start) && dateStr >= start && dateStr <= end;
    }

    // [start, end) minutes an event blocks on each of its days, 'all' for the
    // whole day, or null when it blocks nothing.
    function eventWindow(event) {
        const allDay = event.allDay === true || event.allDay === 1 || event.allDay === '1';
        if (allDay || String(event.time ?? '').trim().toLowerCase() === 'all day') return 'all';
        const start = toMinutes(event.time);
        if (start === null) return null;
        const end = toMinutes(event.endTime);
        return [start, end !== null && end > start ? end : start + SLOT_MINUTES];
    }

    // What already holds the slot starting at `time` on dateStr, or null:
    // { kind: 'event', label } or { kind: 'booking', label, booking }.
    // `bookings` are appointment rows (preferred_date/preferred_time/status)
    // or booked times from api/schedule-events (date/time).
    function slotOccupant(dateStr, time, events, bookings) {
        const start = toMinutes(time);
        if (!dateStr || start === null) return null;
        const end = start + SLOT_MINUTES;

        for (const event of events || []) {
            if (!eventCoversDate(event, dateStr)) continue;
            const window = eventWindow(event);
            if (window === 'all' || (window && start < window[1] && end > window[0])) {
                return { kind: 'event', label: event.title || 'School event', event };
            }
        }
        for (const booking of bookings || []) {
            if (bookingDate(booking) !== dateStr || !isActiveBooking(booking)) continue;
            const bStart = bookingStart(booking);
            if (bStart !== null && start < bStart + SLOT_MINUTES && end > bStart) {
                return { kind: 'booking', label: booking.student_name || 'Booked', booking };
            }
        }
        return null;
    }

    // The bookings an event would cover.
    function bookingsUnderEvent(event, bookings) {
        const window = eventWindow(event);
        if (!window) return [];
        return (bookings || []).filter(booking => {
            if (!isActiveBooking(booking) || !eventCoversDate(event, bookingDate(booking))) return false;
            if (window === 'all') return true;
            const bStart = bookingStart(booking);
            return bStart !== null && bStart < window[1] && bStart + SLOT_MINUTES > window[0];
        });
    }

    /* ---------- month data (events + booked times) ---------- */

    const months = new Map(); // 'YYYY-MM' -> { events, booked }

    async function loadMonth(month, { school = '', force = false } = {}) {
        if (!force && months.has(month)) return months.get(month);
        const query = new URLSearchParams({ month });
        if (school) query.set('school', school);
        const response = await fetch(`${API}?${query}`);
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to load the calendar');
        }
        const data = {
            events: Array.isArray(result.data) ? result.data : [],
            booked: Array.isArray(result.booked) ? result.booked : []
        };
        months.set(month, data);
        return data;
    }

    // Loads every month from `from` to `to` that isn't cached yet.
    async function loadRange(from, to, options = {}) {
        const wanted = [...new Set(daysBetween(from, to).map(monthOf))];
        await Promise.all(wanted.map(month => loadMonth(month, options)));
    }

    // Cached events touching any day from `from` to `to` (each event once).
    function eventsBetween(from, to) {
        const last = to && to > from ? to : from;
        const seen = new Map();
        new Set(daysBetween(from, last).map(monthOf)).forEach(month => {
            (months.get(month)?.events || []).forEach(event => {
                const start = datePart(event.date);
                const end = datePart(event.endDate) || start;
                if (start <= last && end >= from) seen.set(event.id || `${event.title}|${start}`, event);
            });
        });
        return [...seen.values()];
    }

    // Cached booked times on any day from `from` to `to`.
    function bookedBetween(from, to) {
        const last = to && to > from ? to : from;
        const list = [];
        new Set(daysBetween(from, last).map(monthOf)).forEach(month => {
            (months.get(month)?.booked || []).forEach(slot => {
                const date = bookingDate(slot);
                if (date >= from && date <= last) list.push(slot);
            });
        });
        return list;
    }

    function forgetCache() {
        months.clear();
    }

    /* ---------- event form ---------- */

    // Greys out the start/end times that would put an event over a booked
    // session, and turns off All Day while sessions are booked that day.
    // `bookings` are the sessions on the event's day(s) it must stay clear of.
    // `hintEl` (optional) lists their times; no names, so coordinators can
    // plan around sessions without seeing whose they are.
    function applyEventTimeAvailability({ startSelect, endSelect, allDayInput, hintEl }, bookings) {
        const starts = (bookings || []).filter(isActiveBooking).map(bookingStart).filter(s => s !== null);
        const clashes = (start, end) => starts.some(b => start < b + SLOT_MINUTES && end > b);
        const mark = (option, taken) => {
            if (!option.value) return;
            if (option.dataset.label === undefined) option.dataset.label = option.textContent;
            option.disabled = taken;
            option.textContent = taken ? `${option.dataset.label} (booked)` : option.dataset.label;
        };

        if (startSelect) {
            Array.from(startSelect.options).forEach(option => {
                const start = toMinutes(option.value);
                if (start !== null) mark(option, clashes(start, start + SLOT_MINUTES));
            });
            if (startSelect.value && startSelect.selectedOptions[0]?.disabled) startSelect.value = '';
        }

        const chosenStart = toMinutes(startSelect?.value);
        if (endSelect) {
            Array.from(endSelect.options).forEach(option => {
                const end = toMinutes(option.value);
                if (end === null) return;
                const taken = chosenStart !== null
                    ? end > chosenStart && clashes(chosenStart, end)
                    : clashes(end - SLOT_MINUTES, end);
                mark(option, taken);
            });
            if (endSelect.value && endSelect.selectedOptions[0]?.disabled) endSelect.value = '';
        }

        if (allDayInput) {
            const blocked = starts.length > 0;
            if (blocked && allDayInput.checked) {
                allDayInput.checked = false;
                allDayInput.dispatchEvent(new Event('change'));
            }
            allDayInput.disabled = blocked;
            allDayInput.title = blocked ? 'Counseling sessions are booked on this day, so the event cannot take the whole day.' : '';
        }

        if (hintEl) {
            if (!starts.length) {
                hintEl.hidden = true;
                hintEl.innerHTML = '';
            } else {
                const byDay = new Map();
                (bookings || []).filter(isActiveBooking).forEach(booking => {
                    const day = bookingDate(booking);
                    if (!byDay.has(day)) byDay.set(day, new Set());
                    byDay.get(day).add(formatTime(booking.time || booking.preferred_time));
                });
                const multiDay = byDay.size > 1;
                const parts = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, times]) => {
                    const label = multiDay
                        ? `${new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: `
                        : '';
                    return label + [...times].join(', ');
                });
                const count = starts.length;
                hintEl.hidden = false;
                hintEl.innerHTML = '<i class="bi bi-exclamation-circle"></i><span></span>';
                hintEl.querySelector('span').textContent =
                    `${count} counseling session${count === 1 ? ' is' : 's are'} booked ${multiDay ? 'on these days' : 'this day'} (${parts.join('; ')}). The event can't overlap ${count === 1 ? 'it' : 'them'}, so those times are greyed out.`;
            }
        }
    }

    return {
        SLOT_MINUTES,
        SLOTS,
        toMinutes,
        formatTime,
        datePart,
        todayStr,
        monthOf,
        daysBetween,
        isPastSlot,
        isActiveBooking,
        eventCoversDate,
        eventWindow,
        slotOccupant,
        bookingsUnderEvent,
        loadMonth,
        loadRange,
        eventsBetween,
        bookedBetween,
        forgetCache,
        applyEventTimeAvailability
    };
})();
