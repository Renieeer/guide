// My History (student self-service) — shows the logged-in student's own
// referrals, counseling cases, counseling follow-ups, and online
// appointments as folder-style panels, with client-side filtering.
//
// Unlike the counselor-facing student-history.js this never accepts a
// student_id from the URL or a picker — the id always comes from the
// logged-in session, so a student can only ever load their own records.

let shAllRecords = [];   // normalized flat list across all 4 record types
// Timeline pagination — 'all' page size disables paging entirely.
let shTimelinePageSize = 20;
let shTimelinePage = 1;

function esc(value) {
    const div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
}

function shFormatDate(value) {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function shFormatDateTime(value) {
    if (!value) return 'N/A';
    const d = new Date(value.replace ? value.replace(' ', 'T') : value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function shStatusBadgeClass(status) {
    const s = String(status || '').toLowerCase();
    if (['completed', 'approved', 'resolved', 'done', 'closed'].includes(s)) return 'badge-completed';
    if (['in-progress', 'in progress', 'ongoing', 'scheduled'].includes(s)) return 'badge-in-progress';
    if (['rejected', 'cancelled', 'canceled', 'declined', 'denied'].includes(s)) return 'badge-rejected';
    return 'badge-pending';
}

/* Mirrors resolveStudentId() in student-information.js — a logged-in
   student's own identifier can show up under several different keys
   depending on which login path/storage was used, so every plausible
   source is checked rather than assuming one shape. */
function parseStoredJson(storage, key) {
    try {
        return JSON.parse(storage.getItem(key) || '{}');
    } catch (e) {
        return {};
    }
}

function resolveOwnStudentId() {
    const storedUser = parseStoredJson(sessionStorage, 'user');
    const storedUserInfo = parseStoredJson(sessionStorage, 'userInfo');
    const storedCurrentUser = parseStoredJson(localStorage, 'currentUser');

    const candidates = [
        storedUser.studentId, storedUser.StudentId, storedUser.student_id, storedUser.id,
        storedUserInfo.studentId, storedUserInfo.StudentId, storedUserInfo.student_id, storedUserInfo.id,
        storedCurrentUser.studentId, storedCurrentUser.StudentId, storedCurrentUser.student_id, storedCurrentUser.id,
        sessionStorage.getItem('studentId'), sessionStorage.getItem('StudentId')
    ];

    const found = candidates.find(value => String(value ?? '').trim() !== '');
    return found ? String(found).trim() : '';
}

function shInit() {
    initPage();

    const studentId = resolveOwnStudentId();
    if (!studentId) {
        document.getElementById('shEmptyState').innerHTML = `
            <i class="fas fa-triangle-exclamation"></i>
            <h3>Couldn't identify your account</h3>
            <p>Please log out and log back in, then try again.</p>`;
        return;
    }

    ['shSearchText', 'shTypeFilter', 'shStatusFilter', 'shDateFrom', 'shDateTo'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', () => { shTimelinePage = 1; shRenderFolders(); });
        el.addEventListener('change', () => { shTimelinePage = 1; shRenderFolders(); });
    });

    const timelinePageSizeSelect = document.getElementById('shTimelinePageSize');
    timelinePageSizeSelect.addEventListener('change', () => {
        shTimelinePageSize = timelinePageSizeSelect.value === 'all' ? Infinity : parseInt(timelinePageSizeSelect.value, 10);
        shTimelinePage = 1;
        shRenderFolders();
    });

    document.getElementById('shTimelinePagination').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        shTimelinePage = btn.getAttribute('data-page') === 'next' ? shTimelinePage + 1 : shTimelinePage - 1;
        shRenderFolders();
    });

    document.getElementById('shClearFilters').addEventListener('click', () => {
        document.getElementById('shSearchText').value = '';
        document.getElementById('shTypeFilter').value = '';
        document.getElementById('shStatusFilter').value = '';
        document.getElementById('shDateFrom').value = '';
        document.getElementById('shDateTo').value = '';
        shTimelinePage = 1;
        shRenderFolders();
    });

    document.getElementById('shFolderGrid').addEventListener('click', (e) => {
        const navTab = e.target.closest('.sh-folder-tab[data-folder]');
        if (navTab) {
            // Folder tabs are shortcuts into the Record Type filter, not
            // separate isolated panels — everything shows together in one
            // timeline, narrowed by whichever filters are active. Clicking
            // an already-selected type toggles it back off.
            const typeSelect = document.getElementById('shTypeFilter');
            const folder = navTab.getAttribute('data-folder');
            typeSelect.value = typeSelect.value === folder ? '' : folder;
            shTimelinePage = 1;
            shRenderFolders();
            return;
        }
        const fileRow = e.target.closest('.sh-file-row');
        if (fileRow) {
            fileRow.closest('.sh-file').classList.toggle('open');
            return;
        }
        // Referral and counseling-case threads both collapse to just their
        // summary header by default (see shBuildReferralThreadEntry() /
        // shBuildCaseThreadEntry()) — clicking it reveals the full
        // Day 1/2/3... story underneath. Both share the same
        // .sh-referral-thread-* toggle classes/CSS rather than each having
        // their own collapse mechanism.
        const threadToggle = e.target.closest('.sh-referral-thread-toggle');
        if (threadToggle) {
            threadToggle.closest('.sh-referral-thread').classList.toggle('open');
        }
    });

    shLoadHistory(studentId);
}

function shLoadHistory(studentId) {
    document.getElementById('shLoadingState').style.display = 'block';

    fetch(`../../api/student-history?student_id=${encodeURIComponent(studentId)}&role=student`)
        .then(res => res.json())
        .then(result => {
            document.getElementById('shLoadingState').style.display = 'none';
            if (!result.success) {
                document.getElementById('shEmptyState').style.display = 'block';
                document.getElementById('shEmptyState').innerHTML = `
                    <i class="fas fa-triangle-exclamation"></i>
                    <h3>Couldn't load your history</h3>
                    <p>${esc(result.message || 'Unknown error')}</p>`;
                return;
            }

            document.getElementById('shEmptyState').style.display = 'none';
            const counts = result.counts || {};
            shBuildNormalizedRecords(result.data || {});
            shRenderStudentHeader(result.student, counts);
            shPopulateStatusFilter();
            document.getElementById('shFolderGrid').style.display = 'grid';
            document.getElementById('shFilterCard').style.display = 'block';
            shRenderFolders();
        })
        .catch(err => {
            console.error('Error loading history:', err);
            document.getElementById('shLoadingState').style.display = 'none';
            document.getElementById('shEmptyState').style.display = 'block';
            document.getElementById('shEmptyState').innerHTML = `
                <i class="fas fa-triangle-exclamation"></i>
                <h3>Couldn't load your history</h3>
                <p>${esc(err.message || err)}</p>`;
        });
}

function shRenderStudentHeader(student, counts) {
    const card = document.getElementById('shStudentHeaderCard');
    card.style.display = 'block';

    const name = student.name || 'My Records';
    const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'S';
    document.getElementById('shAvatar').textContent = initials;
    document.getElementById('shStudentName').textContent = name;

    // Grade values in this DB mix legacy numeric codes (e.g. "1" meaning
    // Grade 7) with real grade numbers (e.g. "10") — normalizeGradeNumber
    // (from utils.js, mirrors api/grade-scope) resolves both the same
    // way the rest of the app does instead of printing the raw code.
    const normalizedGrade = normalizeGradeNumber(student.grade);
    const gradeLabel = normalizedGrade ? `Grade ${normalizedGrade}` : (student.grade ? String(student.grade) : 'Grade N/A');
    const subParts = [gradeLabel, student.section || null].filter(Boolean);
    document.getElementById('shStudentSub').textContent = subParts.join(' · ');

    const chipDefs = [
        { key: 'referrals', label: 'Referrals', icon: 'fa-file-alt' },
        { key: 'counseling', label: 'Counseling', icon: 'fa-comments' },
        { key: 'follow_ups', label: 'Follow-Ups', icon: 'fa-calendar-check' },
        { key: 'appointments', label: 'Appointments', icon: 'fa-calendar-day' }
    ];
    document.getElementById('shStatChips').innerHTML = chipDefs.map(c => `
        <div class="sh-stat-chip"><i class="fas ${c.icon}"></i> ${c.label} <span class="sh-stat-count">${counts[c.key] || 0}</span></div>
    `).join('');
}

/* Flattens the four record arrays into one normalized list — each entry
   carries a searchable blob and a single sortable date — so filtering
   (text/type/status/date range) is one pass instead of four near-duplicate
   ones per folder. */
function shBuildNormalizedRecords(data) {
    shAllRecords = [];

    (data.referrals || []).forEach(r => {
        shAllRecords.push({
            type: 'referrals',
            status: r.status || 'pending',
            date: r.date_submitted,
            search: [r.referral_reason, r.description, r.intervention_attempts, r.observed_behaviors, r.teacher_name, r.referral_code].join(' ').toLowerCase(),
            raw: r
        });
    });

    (data.counseling || []).forEach(c => {
        shAllRecords.push({
            type: 'counseling',
            status: c.status || 'pending',
            date: c.case_date || c.created_at,
            search: [c.case_title, c.case_summary, c.case_objective, c.first_action, c.category_name, c.counselor_name].join(' ').toLowerCase(),
            raw: c
        });
    });

    (data.follow_ups || []).forEach(f => {
        shAllRecords.push({
            type: 'follow_ups',
            status: 'completed',
            date: f.follow_up_date || f.created_at,
            search: [f.category_name, f.note, f.case_title, f.counselor_name].join(' ').toLowerCase(),
            raw: f
        });
    });

    (data.appointments || []).forEach(a => {
        shAllRecords.push({
            type: 'appointments',
            status: a.status || 'pending',
            date: a.preferred_date,
            search: [a.reason, a.notes, a.counselor_notes].join(' ').toLowerCase(),
            raw: a
        });
    });
}

function shPopulateStatusFilter() {
    const select = document.getElementById('shStatusFilter');
    const current = select.value;
    const statuses = Array.from(new Set(shAllRecords.map(r => String(r.status || '').trim()).filter(Boolean)));
    statuses.sort();
    select.innerHTML = '<option value="">All Statuses</option>' + statuses.map(s => `<option value="${esc(s)}">${esc(s.charAt(0).toUpperCase() + s.slice(1))}</option>`).join('');
    if (statuses.includes(current)) select.value = current;
}

// Folder tabs no longer switch panels — they just highlight to reflect
// whichever Record Type filter is active, and the title reflects it too.
function shApplyActiveFolder() {
    const titles = {
        referrals: 'Referrals',
        counseling: 'Counseling Sessions',
        follow_ups: 'Counseling Appointment Span',
        appointments: 'Online Appointments'
    };
    const typeFilter = document.getElementById('shTypeFilter').value;
    document.querySelectorAll('.sh-folder-tab[data-folder]').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-folder') === typeFilter);
    });
    const titleEl = document.getElementById('shActiveFolderTitle');
    if (titleEl) titleEl.textContent = titles[typeFilter] || 'Recent History';
}

function shGetFilters() {
    return {
        text: document.getElementById('shSearchText').value.trim().toLowerCase(),
        type: document.getElementById('shTypeFilter').value,
        status: document.getElementById('shStatusFilter').value.toLowerCase(),
        from: document.getElementById('shDateFrom').value,
        to: document.getElementById('shDateTo').value
    };
}

function shRecordMatches(record, filters) {
    if (filters.type && record.type !== filters.type) return false;
    if (filters.status && String(record.status || '').toLowerCase() !== filters.status) return false;
    if (filters.text && !record.search.includes(filters.text)) return false;
    if (filters.from || filters.to) {
        if (!record.date) return false;
        const recordDate = String(record.date).slice(0, 10);
        if (filters.from && recordDate < filters.from) return false;
        if (filters.to && recordDate > filters.to) return false;
    }
    return true;
}

function shHasActiveFilters(filters) {
    return Boolean(filters.text || filters.type || filters.status || filters.from || filters.to);
}

function shRenderFolders() {
    const filters = shGetFilters();

    const grouped = { referrals: [], counseling: [], follow_ups: [], appointments: [] };
    let totalMatches = 0;
    shAllRecords.forEach(r => {
        if (shRecordMatches(r, filters)) {
            grouped[r.type].push(r);
            totalMatches++;
        }
    });

    document.getElementById('shResultCount').innerHTML = `Showing <strong>${totalMatches}</strong> of <strong>${shAllRecords.length}</strong> records`;

    document.getElementById('shCount-referrals').textContent = grouped.referrals.length;
    document.getElementById('shCount-counseling').textContent = grouped.counseling.length;
    document.getElementById('shCount-follow_ups').textContent = grouped.follow_ups.length;
    document.getElementById('shCount-appointments').textContent = grouped.appointments.length;

    shRenderTimeline(grouped, shHasActiveFilters(filters));
    shApplyActiveFolder();
}

function shEmptyFolderHtml(noun, hasActiveFilters) {
    const message = hasActiveFilters
        ? `No ${noun} match the current filters.`
        : `No ${noun} recorded yet.`;
    return `<div class="sh-folder-empty">${esc(message)}</div>`;
}

function shParseDate(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        // A bare "YYYY-MM-DD" (no time part) is parsed by the JS Date
        // constructor as UTC midnight per spec, while the "T"-joined
        // datetime strings below (e.g. created_at) parse as local time — so
        // a date-only value ends up several hours off from where it belongs
        // once displayed/compared in local time (UTC midnight shows as
        // 8 AM local for a UTC+8 reader). Parse date-only values as local
        // midnight instead so both kinds compare and group correctly.
        const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) {
            const [, y, m, d] = dateOnly;
            return new Date(Number(y), Number(m) - 1, Number(d));
        }
        value = value.replace(' ', 'T');
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function shTimelineDotColor(status) {
    const cls = shStatusBadgeClass(status);
    if (cls === 'badge-completed') return 'var(--ok)';
    if (cls === 'badge-in-progress') return 'var(--info)';
    if (cls === 'badge-rejected') return 'var(--danger)';
    return 'var(--warn)';
}

function shTimelineGroupLabel(dateObj) {
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOf(new Date()) - startOf(dateObj)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

const SH_RESOLVED_APPOINTMENT_STATUSES = ['approved', 'declined', 'rejected', 'completed', 'done', 'cancelled', 'canceled'];

/* Builds one flat timeline entry — same .sh-file/.sh-file-row/.sh-file-detail
   structure the old per-folder cards used, so the existing click-to-expand
   delegation in shInit() keeps working unchanged. Referrals no longer go
   through here — see shBuildReferralThreadEntry() above, which renders a
   full Day 1/2/3... story instead of a flat field list. Counseling/
   follow-up entries attribute to the staff member who acted (counselor_name);
   appointment requests read as "You" since this is always the logged-in
   student's own history. */
function shBuildTimelineEntry(record) {
    let actorLine = '';
    let dateVal = record.date;
    let detailBody = '';

    if (record.type === 'follow_ups') {
        const f = record.raw;
        const isSession = f.title === 'Counseling Session';
        actorLine = `<strong>${esc(f.counselor_name || 'A counselor')}</strong> ${isSession ? 'logged a counseling session' : 'added a follow-up note'} — <strong>${esc(f.category_name || f.case_title || (isSession ? 'Counseling Session' : 'Follow-up Session'))}</strong>`;
        dateVal = f.created_at || f.follow_up_date;
        detailBody = `
            <div class="sh-detail-row"><div class="sh-detail-label">Note</div><div class="sh-detail-value">${esc(f.note) || '—'}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Follow-Up Date</div><div class="sh-detail-value">${esc(shFormatDate(f.follow_up_date))}</div></div>
        `;
    } else if (record.type === 'appointments') {
        const a = record.raw;
        const status = String(a.status || '').toLowerCase();
        const resolved = SH_RESOLVED_APPOINTMENT_STATUSES.includes(status);
        if (resolved) {
            actorLine = `<strong>Counselor</strong> ${esc(status)} your appointment request — <strong>${esc(a.reason || 'Appointment')}</strong>`;
            dateVal = a.updated_at || a.created_at;
        } else {
            actorLine = `<strong>You</strong> requested an appointment — <strong>${esc(a.reason || 'Appointment')}</strong>`;
            dateVal = a.created_at;
        }
        detailBody = `
            <div class="sh-detail-row"><div class="sh-detail-label">Preferred Date</div><div class="sh-detail-value">${esc(shFormatDate(a.preferred_date))} ${esc(a.preferred_time || '')}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Your Notes</div><div class="sh-detail-value">${esc(a.notes) || '—'}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Counselor Notes</div><div class="sh-detail-value">${esc(a.counselor_notes) || '—'}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Requested</div><div class="sh-detail-value">${esc(shFormatDateTime(a.created_at))}</div></div>
        `;
    } else {
        return null;
    }

    const dateObj = shParseDate(dateVal) || new Date(0);
    const dot = shTimelineDotColor(record.status);
    const meta = `${esc(shFormatDateTime(dateVal))} &middot; <span class="badge ${shStatusBadgeClass(record.status)}">${esc(record.status)}</span>`;

    const html = `
        <div class="sh-file sh-timeline-item">
            <div class="sh-file-row">
                <span class="sh-timeline-dot" style="background:${dot}"></span>
                <div class="sh-file-main">
                    <div class="sh-timeline-text">${actorLine}</div>
                    <div class="sh-timeline-meta">${meta}</div>
                </div>
                <i class="fas fa-chevron-right sh-file-chevron"></i>
            </div>
            <div class="sh-file-detail">${detailBody}</div>
        </div>`;

    return { dateObj, html };
}

const SH_RESOLVED_CASE_STATUSES = ['completed', 'resolved', 'done', 'closed'];

const SH_STAGE_NAMES = {
    1: 'Interview/Background',
    2: 'Initial Risk Assessment',
    3: 'Parent Call-up/Consent',
    4: 'Intervention',
    5: 'Counseling',
    6: 'Student Follow-up',
    7: 'Case Closing'
};

// Turns one referral_stage_log row (see api/update-referral) into a
// plain-English sentence for the timeline. The specific cases mirror the
// actual branching logic in referral-status.js/referrals.js
// (confirmAssessmentCompleted(), confirmConsentDecision()) — everything
// else (a plain advance, or a coordinator's manual stage jump) falls back
// to a generic "moved from X to Y" description built from the stage names.
function shDescribeStageTransition(fromStage, toStage, note) {
    const key = `${fromStage}-${toStage}`;

    // Both the "agreed" and "declined" consent outcomes land on the same
    // next stage now — Intervention is mandatory before Counseling either
    // way (see confirmConsentDecision()) — so this reads the note it
    // actually recorded instead of a fixed per-key sentence.
    if (key === '3-4') {
        return note ? `${note} — proceeding to Intervention first.` : 'Completed Parent Call-up/Consent and moved to Intervention.';
    }

    const specific = {
        '1-2': 'Completed the Interview/Background check-up and moved to Initial Risk Assessment.',
        '2-3': 'Completed the assessment test and moved to Parent Call-up/Consent.',
        '4-5': 'Completed intervention activities and moved to Counseling.',
        '5-6': 'Completed counseling sessions and moved to Student Follow-up.',
        '6-7': 'Completed Student Follow-up and closed the case.'
    };
    if (specific[key]) return specific[key];

    const fromName = SH_STAGE_NAMES[fromStage] || `Stage ${fromStage}`;
    const toName = SH_STAGE_NAMES[toStage] || `Stage ${toStage}`;

    // Case Closing (Stage 7) is the actual last stage now — closeCase()
    // can send a referral there from any stage, not just after Student
    // Follow-up (6), so anything else landing on 7 is an early close rather
    // than the normal end-of-workflow path above.
    if (toStage === 7 && fromStage !== 6) {
        return note ? `Case closed early (${note}) while at ${fromName}.` : `Case closed early while at ${fromName}.`;
    }
    return note ? `Moved from ${fromName} to ${toName} — ${note}.` : `Moved from ${fromName} to ${toName}.`;
}

// Cases created from a referral (see applyReferralPrefill() in
// counseling.js) carry a "(Linked to Referral <code>)" tag appended to
// case_summary purely so the referral side can find the case again — it's
// bookkeeping, not part of the clinical narrative, so every place that
// displays a case's summary strips it back out first.
function shStripReferralLinkTag(text) {
    return String(text || '').replace(/\s*\(Linked to Referral [^)]*\)\s*$/, '').trim();
}

/* A counseling case with linked follow-ups becomes one "case thread": the
   case's own opening, then a node per counseling session in date order,
   with every follow-up nested inside whichever session most recently
   preceded it (a follow-up is a check-in on progress since that session,
   not its own separate step) — same grouping as buildCaseTimelineRail() in
   counseling.js, so a case reads identically here and in its own case
   drawer. A follow-up logged before any session exists yet has nothing to
   nest under, so it falls back to its own node. Collapses to just its
   summary header by default, like the referral thread — reusing its
   .sh-referral-thread-* toggle classes/CSS/click handler rather than
   duplicating a second collapse mechanism. */
function shBuildCaseThreadEntry(c, followUpsRaw, appointmentsRaw) {
    appointmentsRaw = appointmentsRaw || [];
    const resolved = SH_RESOLVED_CASE_STATUSES.includes(String(c.status || '').toLowerCase());
    const counselorName = esc(c.counselor_name || 'A counselor');
    const openedNote = [
        shStripReferralLinkTag(c.case_summary),
        c.case_objective ? `Objective: ${c.case_objective}` : '',
        c.first_action ? `First action: ${c.first_action}` : ''
    ].filter(Boolean).join(' ') || 'Counseling session recorded.';

    // Title tells a counseling-session entry apart from a follow-up entry
    // (see saveFollowUp()/submitAppointments() in counseling.js — both
    // write into this same follow_up table, distinguished only by Title);
    // a row saved before that distinction existed has no title, and reads
    // as 'Follow-up' same as api/follow-up's own default.
    const sortedFollowUps = followUpsRaw.slice().sort((a, b) => {
        const da = shParseDate(a.follow_up_date || a.created_at) || new Date(0);
        const db = shParseDate(b.follow_up_date || b.created_at) || new Date(0);
        return da - db;
    });

    const groups = [];
    let currentGroup = null;
    sortedFollowUps.forEach(f => {
        const isSession = (f.title || 'Follow-up') === 'Counseling Session';
        if (isSession) {
            currentGroup = { session: f, followUps: [] };
            groups.push(currentGroup);
        } else if (currentGroup) {
            currentGroup.followUps.push(f);
        } else {
            groups.push({ session: null, followUps: [f] });
        }
    });

    // inlineLabel + its own LOGGED badge only apply to a nested follow-up
    // (no day-bar of its own to carry a label/pill) — a session's own note
    // gets both from its bar instead. Category is the counselor's own read
    // on this student's behavior for this entry (see
    // renderFollowUpNoteTile()), picked per-student rather than one
    // category for the whole batch.
    const buildFollowUpNoteRow = (f, inlineLabel) => `
        <div class="sh-case-note-row">
            <span class="sh-case-note-icon"><i class="fas fa-pen"></i></span>
            <div class="sh-case-note-body">
                <div class="sh-case-note-head">
                    ${inlineLabel ? `<strong>${esc(inlineLabel)}</strong> &middot; ` : ''}${f.category_name ? `Category <strong>${esc(f.category_name)}</strong> &middot; ` : ''}<strong>${counselorName}</strong> added a note &middot; ${esc(shFormatDateTime(f.follow_up_date || f.created_at))}
                    ${inlineLabel ? `<span class="badge badge-completed" style="margin-left:6px;">LOGGED</span>` : ''}
                </div>
                <div class="sh-case-note-text">${esc(f.note || 'Follow-up session recorded.')}</div>
            </div>
        </div>`;

    // The appointment_requests row created alongside a session (see
    // submitAppointments() in counseling.js) shares that exact same date —
    // both are set from the same `date` variable in the same call — so
    // matching on preferred_date/follow_up_date reliably ties an
    // appointment back to the specific session it was booked for, not just
    // "this case somewhere". Any appointment whose date matches no session
    // (shouldn't normally happen) is nested under the case-opened node
    // instead of silently dropped.
    const appointmentsByDate = {};
    const unmatchedAppointments = [];
    appointmentsRaw.forEach(a => {
        const key = a.preferred_date || '';
        const hasSessionOnDate = sortedFollowUps.some(f => (f.title || 'Follow-up') === 'Counseling Session' && f.follow_up_date === key);
        if (key && hasSessionOnDate) {
            (appointmentsByDate[key] = appointmentsByDate[key] || []).push(a);
        } else {
            unmatchedAppointments.push(a);
        }
    });

    // Only ever reached nested in a case thread, i.e. booked via "Add
    // Counseling Session" (see submitAppointments() in counseling.js,
    // the only place that stamps case_uid) — never a student's own
    // request, so there's no separate approval step to name; "approved"
    // here just means "the counselor booked it", not "someone reviewed
    // and accepted it". Any other status (e.g. later declined/cancelled)
    // is a real action, so that still shows as-is.
    const buildAppointmentNoteRow = a => `
        <div class="sh-case-note-row">
            <span class="sh-case-note-icon"><i class="fas fa-calendar-check"></i></span>
            <div class="sh-case-note-body">
                <div class="sh-case-note-head">
                    Appointment <strong>${a.status === 'approved' ? 'scheduled' : esc(a.status || 'pending')}</strong> &middot; ${esc(shFormatDate(a.preferred_date))} ${esc(a.preferred_time || '')}
                </div>
                <div class="sh-case-note-text">${esc(a.reason || 'Counseling appointment')}</div>
            </div>
        </div>`;

    let sessionNum = 0;
    let followUpNum = 0;
    let nodeNum = 1; // the opened node below is node 1
    const groupNodes = groups.map(group => {
        nodeNum++;
        if (group.session) {
            sessionNum++;
            const nestedFollowUps = group.followUps.map(f => buildFollowUpNoteRow(f, `Student Follow-up #${++followUpNum}`)).join('');
            const nestedAppointments = (appointmentsByDate[group.session.follow_up_date] || []).map(buildAppointmentNoteRow).join('');
            return `
            <div class="sh-case-day">
                <div class="sh-case-day-row">
                    <span class="sh-case-day-badge sh-case-day-badge--session">${nodeNum}</span>
                    <div class="sh-case-day-bar">
                        <span>COUNSELING SESSION &middot; #${sessionNum}</span>
                        <span class="sh-case-day-pill sh-case-day-pill--session">LOGGED</span>
                    </div>
                </div>
                ${buildFollowUpNoteRow(group.session)}
                ${nestedAppointments}
                ${nestedFollowUps}
            </div>`;
        }
        // No session has happened yet — nothing to nest this follow-up
        // under, so it gets its own node.
        return group.followUps.map(f => {
            const html = `
            <div class="sh-case-day">
                <div class="sh-case-day-row">
                    <span class="sh-case-day-badge">${nodeNum}</span>
                    <div class="sh-case-day-bar">
                        <span>STUDENT FOLLOW-UP &middot; #${++followUpNum}</span>
                        <span class="sh-case-day-pill">LOGGED</span>
                    </div>
                </div>
                ${buildFollowUpNoteRow(f)}
            </div>`;
            nodeNum++;
            return html;
        }).join('');
    });

    const openedLabel = c.referral_code
        ? `CASE OPENED &mdash; FROM REFERRAL #${esc(c.referral_code)}`
        : 'CASE OPENED &mdash; WALK-IN';
    const openedNode = `
        <div class="sh-case-day">
            <div class="sh-case-day-row">
                <span class="sh-case-day-badge sh-case-day-badge--opened"><i class="bi bi-folder2-open"></i></span>
                <div class="sh-case-day-bar">
                    <span>${openedLabel}</span>
                </div>
            </div>
            <div class="sh-case-note-row">
                <span class="sh-case-note-icon"><i class="fas fa-pen"></i></span>
                <div class="sh-case-note-body">
                    <div class="sh-case-note-head"><strong>${counselorName}</strong> added a note &middot; ${esc(shFormatDateTime(c.created_at || c.case_date))}</div>
                    <div class="sh-case-note-text">${esc(openedNote)}</div>
                </div>
            </div>
            ${unmatchedAppointments.map(buildAppointmentNoteRow).join('')}
        </div>`;

    const lastFollowUp = sortedFollowUps[sortedFollowUps.length - 1];
    const lastActivityDate = lastFollowUp ? (lastFollowUp.follow_up_date || lastFollowUp.created_at) : (c.created_at || c.case_date);
    const totalNotes = 1 + sortedFollowUps.length;

    const ongoingNode = !resolved ? `
        <div class="sh-case-day">
            <div class="sh-case-day-row">
                <span class="sh-case-day-badge sh-case-day-badge--ongoing"></span>
                <span class="sh-case-day-ongoing-text">Case ongoing — add another session or follow-up.</span>
            </div>
        </div>` : '';

    const doneHtml = resolved ? `
        <div class="sh-case-done-row">
            <span class="sh-case-done-icon"><i class="fas fa-check"></i></span>
            <div class="sh-case-note-body">
                <div class="sh-case-note-head"><strong>${counselorName}</strong> marked the case as done &middot; ${esc(shFormatDateTime(c.updated_at || lastActivityDate))}</div>
                <div class="sh-case-done-summary">${sessionNum} session${sessionNum === 1 ? '' : 's'} &middot; ${followUpNum} follow-up${followUpNum === 1 ? '' : 's'}</div>
            </div>
        </div>` : '';

    const dateLabel = shFormatDate(resolved ? (c.updated_at || lastActivityDate) : lastActivityDate);
    const summaryLabel = totalNotes > 1
        ? `${sessionNum} session${sessionNum === 1 ? '' : 's'} &middot; ${followUpNum} follow-up${followUpNum === 1 ? '' : 's'}`
        : 'Awaiting follow-up';

    const html = `
        <div class="sh-case-thread sh-referral-thread">
            <div class="sh-case-thread-header sh-referral-thread-toggle">
                <div class="sh-referral-row-icon"><i class="fas fa-comments"></i></div>
                <div class="sh-referral-row-main">
                    <div class="sh-referral-row-eyebrow">Counseling</div>
                    <div class="sh-referral-row-title">${c.case_uid ? `Case #${esc(c.case_uid)} &middot; ` : ''}${esc(c.case_title || c.section_name || 'Counseling Case')}</div>
                    <div class="sh-referral-row-sub">${esc(c.category_name || 'Counseling')} &middot; Handled by ${counselorName} &middot; ${c.referral_code ? `<span class="sh-linked-tag">From Referral #${esc(c.referral_code)}</span>` : `<span class="sh-linked-tag sh-walkin-tag">Walk-in</span>`}</div>
                </div>
                <div class="sh-referral-row-meta">
                    <div class="sh-referral-row-dates">${esc(dateLabel)}</div>
                    <div class="sh-referral-row-summary">${summaryLabel}</div>
                </div>
                <span class="badge ${shStatusBadgeClass(c.status)} sh-case-thread-status">${esc(c.status)}</span>
                <i class="fas fa-chevron-down sh-referral-thread-chevron"></i>
            </div>
            <div class="sh-referral-thread-body">
                <div class="sh-case-thread-days">${openedNode}${groupNodes.join('')}${ongoingNode}</div>
                ${doneHtml}
            </div>
        </div>`;

    const dateObj = shParseDate(resolved ? (c.updated_at || lastActivityDate) : lastActivityDate) || new Date(0);
    return { dateObj, html };
}

/* A referral's full story — submission, and every risk-assessment note
   logged against it (Stage 2's screenings, one per counselor visit) — as
   one Day 1/2/3... thread of what actually happened, same pattern as a
   counseling case's thread above. No synthetic "current stage" summary is
   appended — a static 7-stage indicator isn't itself an event, and the
   collapsed row's status pill already covers "where things stand"; new
   days only appear here once a coordinator/counselor logs a real
   follow-up or update. Every referral renders this way now, even one with
   no screenings yet (just a single "Day 1 — Submitted" entry), instead of
   the old flat field list. */
// linkedCase (optional) is the counseling case whose referral_code matches
// this referral's own code — looked up client-side in shRenderTimeline(),
// since both referrals and counseling cases are already loaded together
// there and there's no server-side join between the two tables. Shown in
// the collapsed subtitle so the connection is visible without expanding
// either card (see the matching "From Referral #..." tag added to
// shBuildCaseThreadEntry() above).
function shBuildReferralThreadEntry(r, linkedCase) {
    const events = [{
        rawDate: r.date_submitted,
        title: 'Referral submitted',
        stage: 1,
        by: r.teacher_name || 'A teacher',
        note: r.referral_reason || 'Referral submitted.',
        pill: 'SUBMITTED'
    }];

    // referral_screening now serves two stages (see api/referral-screening)
    // — Stage 1's Interview/Background notes and Stage 2's Risk Assessment
    // notes are the same table shape, told apart by `stage`.
    (r.screenings || []).forEach(s => {
        const isBackground = Number(s.stage) === 1;
        const parts = [];
        if (s.risk_level) parts.push(`Risk level: ${s.risk_level}.`);
        if (s.interview_notes) parts.push(isBackground ? s.interview_notes : `Interview: ${s.interview_notes}`);
        if (s.observations) parts.push(`Observations: ${s.observations}`);
        events.push({
            rawDate: s.created_at,
            title: isBackground ? 'Interview / Background started' : 'Initial Risk Assessment started',
            stage: isBackground ? 1 : 2,
            by: s.counselor_name || 'A counselor',
            note: parts.join(' ') || (isBackground ? 'Interview / background check-up recorded.' : 'Risk assessment recorded.'),
            pill: isBackground ? 'INTERVIEWED' : 'ASSESSED'
        });
    });

    // Every stage change this referral has gone through (see
    // api/update-referral's referral_stage_log) — narrated in plain
    // English via shDescribeStageTransition() for the detail line, and as a
    // short "{stage that just finished} completed" headline via
    // SH_STAGE_NAMES for the title — so e.g. a Stage 3 disagreement still
    // reads as "Parent Call-up/Consent completed" up top, with the sentence
    // explaining what happens next and why underneath. update-referral.php
    // logs even a same-stage re-save (e.g. re-confirming a gated decision
    // without the referral actually moving on) — titling that "completed"
    // would be wrong since nothing advanced, so those get an honest "update
    // logged" title instead.
    (r.stage_log || []).forEach(log => {
        const fromName = SH_STAGE_NAMES[log.from_stage] || `Stage ${log.from_stage}`;
        const advanced = Number(log.from_stage) !== Number(log.to_stage);
        const isClosed = Number(log.to_stage) === 7;
        events.push({
            rawDate: log.changed_at,
            title: isClosed ? 'Case closed' : (advanced ? `${fromName} completed` : `${fromName} — update logged`),
            stage: log.to_stage,
            by: log.changed_by || 'A counselor',
            note: shDescribeStageTransition(log.from_stage, log.to_stage, log.note),
            pill: isClosed ? 'CLOSED' : (advanced ? 'UPDATED' : 'NOTE')
        });
    });

    // The counseling case opened from this referral (matched by
    // referral_code in shRenderTimeline() and passed in as linkedCase) gets
    // its own step here, right around when it actually happened, instead of
    // only showing up as a "Linked Counseling Case #..." tag on the
    // collapsed header above — so it's clear in the stage-by-stage story
    // exactly when the referral turned into a real counseling session, not
    // just that it eventually did.
    if (linkedCase) {
        const caseLabel = `Case #${linkedCase.case_uid}${linkedCase.case_title ? ` &middot; ${linkedCase.case_title}` : ''}`;
        events.push({
            rawDate: linkedCase.created_at || linkedCase.case_date,
            title: `Counseling case created — ${caseLabel}`,
            stage: 5,
            by: linkedCase.counselor_name || 'A counselor',
            note: `Opened a counseling case for this referral — ${caseLabel}.`,
            pill: 'UPDATED'
        });
    }

    events.sort((a, b) => (shParseDate(a.rawDate) || new Date(0)) - (shParseDate(b.rawDate) || new Date(0)));

    // Fill in any stage this referral passed through with nothing logged at
    // all — e.g. its stage was changed directly in the database, bypassing
    // update-referral.php's logging, so the events above jump straight from
    // Stage 1 to Stage 4 with no record of 2-3 ever happening. Rather than
    // silently skip over that, walk the sorted events tracking the highest
    // stage confirmed so far and insert a "no record found" placeholder for
    // every stage number that gets skipped — so every stage 1..current is
    // represented in the history one way or another.
    const displayEvents = [];
    let knownStage = 0;
    events.forEach(ev => {
        const evStage = Number(ev.stage) || knownStage;
        for (let s = knownStage + 1; s < evStage; s++) {
            displayEvents.push({
                rawDate: ev.rawDate,
                title: `${SH_STAGE_NAMES[s] || `Stage ${s}`} — no record found`,
                stage: s,
                by: '—',
                note: 'Done.',
                pill: 'GAP'
            });
        }
        displayEvents.push(ev);
        knownStage = Math.max(knownStage, evStage);
    });

    // UPDATED (a stage actually finished and advanced) reads green like the
    // rest of the app's "completed" badge; SUBMITTED/INTERVIEWED/ASSESSED/
    // NOTE are all real work still short of finishing a stage, so they share
    // the "in-progress" blue; CLOSED/GAP keep their existing red/gray.
    const PILL_BADGE_CLASS = { GAP: 'badge-gap', CLOSED: 'badge-rejected', UPDATED: 'badge-completed' };

    // Every step logged as its own entry — no merging same-day activity into
    // one combined "Day N — A + B + C" header (that used to cram, say, a
    // submission, an interview, and three stage advances made in one
    // sitting into a single unreadable line). Each step gets its own clear
    // title, timestamp/actor, and stage/status line instead. The dot marker
    // is colored to match its pill (see .sh-dot-badge-* in
    // student-history.css) so the timeline reads at a glance.
    const stepsHtml = displayEvents.map(ev => {
        const badgeClass = PILL_BADGE_CLASS[ev.pill] || 'badge-in-progress';
        return `
        <div class="sh-referral-step">
            <span class="sh-referral-step-dot sh-dot-${badgeClass}"></span>
            <div class="sh-referral-step-body">
                <div class="sh-referral-step-title">${esc(ev.title)}</div>
                <div class="sh-referral-step-meta">${esc(shFormatDateTime(ev.rawDate))} &middot; ${esc(ev.by)}</div>
                <div class="sh-referral-step-stage">Stage ${ev.stage} &middot; <span class="badge ${badgeClass}">${esc(ev.pill)}</span></div>
                ${ev.note ? `<div class="sh-referral-step-note">${esc(ev.note)}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    const lastEvent = events[events.length - 1];

    // Collapsed-row summary: date of the last activity, plus either a step
    // count (once a counselor has actually logged something) or "Awaiting
    // counselor" for a referral that's just sitting at step 1.
    const dateLabel = shFormatDate(lastEvent.rawDate);
    const summaryLabel = events.length > 1
        ? `${events.length} step${events.length === 1 ? '' : 's'} logged`
        : 'Awaiting counselor';

    const urgencyLabel = r.urgency ? String(r.urgency).charAt(0).toUpperCase() + String(r.urgency).slice(1) : '';
    const stageLabel = `Stage ${r.stage || 1}/6${r.stage_note ? ` — ${r.stage_note}` : ''}`;
    const subParts = [
        r.referral_code ? `Referral #${esc(r.referral_code)}` : '',
        `Referred by ${esc(r.teacher_name || 'a teacher')}`,
        urgencyLabel ? `Urgency: ${esc(urgencyLabel)}` : '',
        esc(stageLabel),
        linkedCase ? `<span class="sh-linked-tag">Linked Counseling Case #${esc(linkedCase.case_uid)}</span>` : ''
    ].filter(Boolean).join(' &middot; ');

    const html = `
        <div class="sh-case-thread sh-referral-thread">
            <div class="sh-case-thread-header sh-referral-thread-toggle">
                <div class="sh-referral-row-icon"><i class="fas fa-arrow-right"></i></div>
                <div class="sh-referral-row-main">
                    <div class="sh-referral-row-eyebrow">Referral</div>
                    <div class="sh-referral-row-title">${esc(r.referral_reason || 'Referral')}</div>
                    <div class="sh-referral-row-sub">${subParts}</div>
                </div>
                <div class="sh-referral-row-meta">
                    <div class="sh-referral-row-dates">${esc(dateLabel)}</div>
                    <div class="sh-referral-row-summary">${summaryLabel}</div>
                </div>
                <span class="badge ${shStatusBadgeClass(r.status)} sh-case-thread-status">${esc(r.status)}</span>
                <i class="fas fa-chevron-down sh-referral-thread-chevron"></i>
            </div>
            <div class="sh-referral-thread-body">
                <div class="sh-referral-steps">${stepsHtml}</div>
            </div>
        </div>`;

    const dateObj = shParseDate(lastEvent.rawDate) || new Date(0);
    return { dateObj, html };
}

function shRenderTimeline(grouped, hasActiveFilters) {
    const body = document.getElementById('shBody-timeline');
    const paginationEl = document.getElementById('shTimelinePagination');
    const totalCount = grouped.referrals.length + grouped.counseling.length + grouped.follow_ups.length + grouped.appointments.length;
    if (totalCount === 0) {
        body.innerHTML = shEmptyFolderHtml('records', hasActiveFilters);
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }

    const followUpsByCase = {};
    grouped.follow_ups.forEach(f => {
        const key = f.raw.case_uid || '';
        if (!key) return;
        (followUpsByCase[key] = followUpsByCase[key] || []).push(f.raw);
    });

    // Same bucketing for appointments booked from a case's "Add Counseling
    // Session" (see submitAppointments() in counseling.js, which now stamps
    // case_uid on the appointment it creates) — nested into that session's
    // own node in shBuildCaseThreadEntry() instead of showing up a second
    // time as an unrelated standalone entry. A student's own self-service
    // request has no case_uid and is never bucketed here.
    const appointmentsByCase = {};
    grouped.appointments.forEach(a => {
        const key = a.raw.case_uid || '';
        if (!key) return;
        (appointmentsByCase[key] = appointmentsByCase[key] || []).push(a.raw);
    });

    const threadedCaseUids = new Set();
    const entries = [];

    // Client-side lookup from a referral's own code to whichever counseling
    // case was opened from it (see referral_code on both records — api/
    // case-scenario.php and api/student-history) — referrals and
    // counseling cases come from two separate queries with no server-side
    // join between them, but both are already loaded here together.
    const caseByReferralCode = {};
    grouped.counseling.forEach(c => {
        if (c.raw.referral_code) caseByReferralCode[c.raw.referral_code] = c.raw;
    });

    grouped.counseling.forEach(c => {
        const caseUid = c.raw.case_uid || '';
        const linkedFollowUps = caseUid ? (followUpsByCase[caseUid] || []) : [];
        const linkedAppointments = caseUid ? (appointmentsByCase[caseUid] || []) : [];
        if (caseUid) threadedCaseUids.add(caseUid);
        // Every counseling case gets the same card/thread treatment as a
        // referral — including a brand-new one with zero follow-ups yet
        // (shBuildCaseThreadEntry already renders that fine, as a single
        // "Day 1 — Initial session" card) — rather than falling back to a
        // plain flat row just because no follow-up has been logged.
        entries.push(shBuildCaseThreadEntry(c.raw, linkedFollowUps, linkedAppointments));
    });

    grouped.follow_ups.forEach(f => {
        const caseUid = f.raw.case_uid || '';
        if (caseUid && threadedCaseUids.has(caseUid)) return;
        const entry = shBuildTimelineEntry(f);
        if (entry) entries.push(entry);
    });

    grouped.referrals.forEach(r => {
        const linkedCase = r.raw.referral_code ? caseByReferralCode[r.raw.referral_code] : null;
        entries.push(shBuildReferralThreadEntry(r.raw, linkedCase));
    });

    grouped.appointments.forEach(a => {
        const caseUid = a.raw.case_uid || '';
        if (caseUid && threadedCaseUids.has(caseUid)) return;
        const entry = shBuildTimelineEntry(a);
        if (entry) entries.push(entry);
    });

    entries.sort((a, b) => b.dateObj - a.dateObj);

    const totalPages = Math.max(1, Math.ceil(entries.length / shTimelinePageSize));
    if (shTimelinePage > totalPages) shTimelinePage = totalPages;
    if (shTimelinePage < 1) shTimelinePage = 1;

    const startIdx = shTimelinePageSize === Infinity ? 0 : (shTimelinePage - 1) * shTimelinePageSize;
    const endIdx = shTimelinePageSize === Infinity ? entries.length : Math.min(startIdx + shTimelinePageSize, entries.length);
    const pageEntries = entries.slice(startIdx, endIdx);

    let html = '';
    let currentGroup = null;
    pageEntries.forEach(entry => {
        const label = shTimelineGroupLabel(entry.dateObj);
        if (label !== currentGroup) {
            if (currentGroup !== null) html += '</div>';
            html += `<div class="sh-timeline-group"><div class="sh-timeline-group-label">${esc(label)}</div>`;
            currentGroup = label;
        }
        html += entry.html;
    });
    html += '</div>';

    body.innerHTML = html;

    if (paginationEl) {
        if (shTimelinePageSize === Infinity || totalPages <= 1) {
            paginationEl.innerHTML = '';
        } else {
            paginationEl.innerHTML = `
                <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${shTimelinePage <= 1 ? 'disabled' : ''}>
                    <i class="bi bi-chevron-left"></i> Prev
                </button>
                <span class="sh-slist-page-info">Showing ${startIdx + 1}&ndash;${endIdx} of ${entries.length} &middot; Page ${shTimelinePage} of ${totalPages}</span>
                <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${shTimelinePage >= totalPages ? 'disabled' : ''}>
                    Next <i class="bi bi-chevron-right"></i>
                </button>`;
        }
    }
    shAnimateTimelineEntries();
}

// Fades/slides each entry in as it scrolls into view within the timeline's
// own scrollable panel (see css/student-history.css's #shBody-timeline
// .sh-in rules — shared with the counselor/other-school versions of this
// page). Re-run after every re-render since body.innerHTML wipes out any
// previously-observed nodes.
function shAnimateTimelineEntries() {
    const body = document.getElementById('shBody-timeline');
    const items = body.querySelectorAll('.sh-timeline-item, .sh-case-thread');
    if (!('IntersectionObserver' in window)) {
        items.forEach(i => i.classList.add('sh-in'));
        return;
    }
    const io = new IntersectionObserver((observed) => {
        observed.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('sh-in');
                io.unobserve(e.target);
            }
        });
    }, { root: body, threshold: 0.12 });
    items.forEach(i => io.observe(i));
}

document.addEventListener('DOMContentLoaded', shInit);
