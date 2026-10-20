// Student History — aggregates referrals, counseling cases, counseling
// follow-ups, and online appointments for one student into folder-style
// panels, with client-side filtering (search/type/status/date range).

let shAllStudents = [];
let shAllRecords = [];   // normalized flat list across all 4 record types
let shCurrentStudent = null;
let shStudentsLoaded = false;
// Student picker pagination — 'all' disables paging entirely.
let shPageSize = 20;
let shListPage = 1;
// Timeline pagination (the merged activity feed for one selected student) —
// separate from the student-picker pagination above. 'all' disables paging.
let shTimelinePageSize = 20;
let shTimelinePage = 1;
// 'personal' shows the static profile panel; anything else shows the merged
// activity timeline (optionally narrowed to one record type via shTypeFilter).
let shActiveFolder = 'timeline';

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

function getUserSchool() {
    try {
        const raw = sessionStorage.getItem('userInfo') || sessionStorage.getItem('user') || localStorage.getItem('currentUser') || localStorage.getItem('teacherSchool');
        if (!raw) return '';
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
        if (parsed && typeof parsed === 'object') return parsed.school_attended || parsed.school || '';
        return '';
    } catch (e) {
        return '';
    }
}

async function shInit() {
    initPage();
    await refreshGradeScope();

    const school = getUserSchool();
    if (school && school !== 'Unknown') {
        fetch(`../../api/get-students?school=${encodeURIComponent(school)}&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`)
            .then(res => res.json())
            .then(result => {
                shAllStudents = result.success ? (result.data || []) : [];
                shStudentsLoaded = true;
                shRenderStudentList(document.getElementById('shStudentSearch').value);
            })
            .catch(err => {
                console.error('Error preloading students:', err);
                shStudentsLoaded = true;
                shRenderStudentList('');
            });
    } else {
        shStudentsLoaded = true;
    }
    shRenderStudentList('');

    const searchInput = document.getElementById('shStudentSearch');
    // The search box only filters the always-visible list below it — no
    // separate dropdown/autocomplete step, so results update as you type.
    searchInput.addEventListener('input', () => {
        shListPage = 1;
        shRenderStudentList(searchInput.value);
    });

    const pageSizeSelect = document.getElementById('shPageSize');
    pageSizeSelect.addEventListener('change', () => {
        shPageSize = pageSizeSelect.value === 'all' ? Infinity : parseInt(pageSizeSelect.value, 10);
        shListPage = 1;
        shRenderStudentList(searchInput.value);
    });

    document.getElementById('shStudentList').addEventListener('click', (e) => {
        const item = e.target.closest('.sh-slist-item');
        if (!item) return;
        shLoadStudent(item.getAttribute('data-student-id'));
    });

    document.getElementById('shSlistPagination').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        shListPage = btn.getAttribute('data-page') === 'next' ? shListPage + 1 : shListPage - 1;
        shRenderStudentList(searchInput.value);
    });

    document.getElementById('shBackToList').addEventListener('click', shShowBrowseList);

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
            shSelectFolder(navTab.getAttribute('data-folder'));
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

    // The compact header chips mirror the folder nav below — clicking
    // either one applies the same selection and keeps both in sync.
    document.getElementById('shStatChips').addEventListener('click', (e) => {
        const chip = e.target.closest('.sh-stat-chip[data-folder]');
        if (!chip) return;
        shSelectFolder(chip.getAttribute('data-folder'));
        document.getElementById('shFolderGrid').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    const params = new URLSearchParams(window.location.search);
    const presetStudentId = params.get('student_id');
    if (presetStudentId) {
        shLoadStudent(presetStudentId);
    }
}

// "Personal Information" swaps to the static profile panel. Any record-type
// tab instead narrows the merged timeline to that type via the existing
// Record Type filter — clicking an already-selected one toggles it back off
// so the timeline returns to showing every record type together.
function shSelectFolder(folder) {
    if (folder === 'personal') {
        shActiveFolder = 'personal';
        shApplyActiveFolder();
        return;
    }
    shActiveFolder = 'timeline';
    const typeSelect = document.getElementById('shTypeFilter');
    typeSelect.value = typeSelect.value === folder ? '' : folder;
    shTimelinePage = 1;
    shRenderFolders();
}

function shShowBrowseList() {
    shCurrentStudent = null;
    document.getElementById('shBackBar').style.display = 'none';
    document.getElementById('shBrowseCard').style.display = 'block';
    document.getElementById('shStudentHeaderCard').style.display = 'none';
    document.getElementById('shFilterCard').style.display = 'none';
    document.getElementById('shFolderGrid').style.display = 'none';
    document.getElementById('shEmptyState').style.display = 'none';
    document.getElementById('shLoadingState').style.display = 'none';

    const url = new URL(window.location.href);
    url.searchParams.delete('student_id');
    window.history.replaceState({}, '', url);
}

function shRenderStudentList(term) {
    const listEl = document.getElementById('shStudentList');
    const countEl = document.getElementById('shSlistCount');
    const paginationEl = document.getElementById('shSlistPagination');
    const q = (term || '').trim().toLowerCase();

    if (!shStudentsLoaded) {
        listEl.innerHTML = '<div class="sh-slist-loading">Loading students…</div>';
        countEl.textContent = '';
        paginationEl.innerHTML = '';
        return;
    }

    if (shAllStudents.length === 0) {
        listEl.innerHTML = '<div class="sh-slist-empty">No students found for your school.</div>';
        countEl.textContent = '';
        paginationEl.innerHTML = '';
        return;
    }

    const matches = shAllStudents.filter(s => {
        if (!q) return true;
        const name = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
        const id = String(s.id || s.StudentId || '').toLowerCase();
        return name.includes(q) || id.includes(q) || String(s.email || '').toLowerCase().includes(q);
    }).sort((a, b) => `${a.first_name || ''} ${a.last_name || ''}`.trim().localeCompare(`${b.first_name || ''} ${b.last_name || ''}`.trim()));

    if (matches.length === 0) {
        countEl.innerHTML = `Showing <strong>0</strong> of <strong>${shAllStudents.length}</strong> students`;
        listEl.innerHTML = '<div class="sh-slist-empty">No students match your search.</div>';
        paginationEl.innerHTML = '';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(matches.length / shPageSize));
    if (shListPage > totalPages) shListPage = totalPages;
    if (shListPage < 1) shListPage = 1;

    const startIdx = shPageSize === Infinity ? 0 : (shListPage - 1) * shPageSize;
    const endIdx = shPageSize === Infinity ? matches.length : Math.min(startIdx + shPageSize, matches.length);
    const pageItems = matches.slice(startIdx, endIdx);

    countEl.innerHTML = matches.length > pageItems.length
        ? `Showing <strong>${startIdx + 1}&ndash;${endIdx}</strong> of <strong>${matches.length}</strong> students`
        : `Showing <strong>${matches.length}</strong> of <strong>${shAllStudents.length}</strong> students`;

    listEl.innerHTML = pageItems.map(s => {
        const id = s.id || s.StudentId || '';
        const name = `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed Student';
        const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'S';
        const grade = s.grade_name || s.grade_level || s.Grade || '';
        const active = shCurrentStudent && String(shCurrentStudent.student_id) === String(id) ? ' active' : '';
        return `<div class="sh-slist-item${active}" data-student-id="${esc(id)}">
            <div class="sh-slist-avatar">${esc(initials)}</div>
            <div class="sh-slist-main">
                <div class="sh-slist-name">${esc(name)}</div>
                <div class="sh-slist-meta">ID: ${esc(id)}${grade ? ' &middot; ' + esc(grade) : ''}</div>
            </div>
        </div>`;
    }).join('');

    if (shPageSize === Infinity || totalPages <= 1) {
        paginationEl.innerHTML = '';
    } else {
        paginationEl.innerHTML = `
            <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${shListPage <= 1 ? 'disabled' : ''}>
                <i class="bi bi-chevron-left"></i> Prev
            </button>
            <span class="sh-slist-page-info">Page ${shListPage} of ${totalPages}</span>
            <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${shListPage >= totalPages ? 'disabled' : ''}>
                Next <i class="bi bi-chevron-right"></i>
            </button>`;
    }
}

function shLoadStudent(studentId) {
    document.getElementById('shBrowseCard').style.display = 'none';
    document.getElementById('shBackBar').style.display = 'block';
    document.getElementById('shEmptyState').style.display = 'none';
    document.getElementById('shFolderGrid').style.display = 'none';
    document.getElementById('shStudentHeaderCard').style.display = 'none';
    document.getElementById('shFilterCard').style.display = 'none';
    document.getElementById('shLoadingState').style.display = 'block';

    const url = new URL(window.location.href);
    url.searchParams.set('student_id', studentId);
    window.history.replaceState({}, '', url);

    const apiUrl = `../../api/student-history?student_id=${encodeURIComponent(studentId)}&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;

    fetch(apiUrl)
        .then(res => res.json())
        .then(result => {
            document.getElementById('shLoadingState').style.display = 'none';
            if (!result.success) {
                document.getElementById('shEmptyState').style.display = 'block';
                document.getElementById('shEmptyState').innerHTML = `
                    <i class="fas fa-triangle-exclamation"></i>
                    <h3>Couldn't load history</h3>
                    <p>${esc(result.message || 'Unknown error')}</p>`;
                return;
            }
            shCurrentStudent = result.student;
            const counts = result.counts || {};
            // Land on the merged timeline with every record type showing
            // together, rather than pre-picking one type to isolate.
            shActiveFolder = 'timeline';
            shTimelinePage = 1;
            document.getElementById('shTypeFilter').value = '';
            shBuildNormalizedRecords(result.data || {});
            shRenderStudentHeader(result.student, counts);
            shRenderPersonalInfo(result.student);
            shPopulateStatusFilter();
            document.getElementById('shFolderGrid').style.display = 'grid';
            document.getElementById('shFilterCard').style.display = 'block';
            shRenderFolders();
        })
        .catch(err => {
            console.error('Error loading student history:', err);
            document.getElementById('shLoadingState').style.display = 'none';
            document.getElementById('shEmptyState').style.display = 'block';
            document.getElementById('shEmptyState').innerHTML = `
                <i class="fas fa-triangle-exclamation"></i>
                <h3>Couldn't load history</h3>
                <p>${esc(err.message || err)}</p>`;
        });
}

function shRenderStudentHeader(student, counts) {
    const card = document.getElementById('shStudentHeaderCard');
    card.style.display = 'block';

    const name = student.name || 'Unnamed Student';
    const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'S';
    document.getElementById('shAvatar').textContent = initials;
    document.getElementById('shStudentName').textContent = name;

    // Grade values in this DB mix legacy numeric codes (e.g. "1" meaning
    // Grade 7) with real grade numbers (e.g. "10") — normalizeGradeNumber
    // (from utils.js, mirrors api/grade-scope) resolves both the same
    // way the rest of the app does instead of printing the raw code.
    const normalizedGrade = normalizeGradeNumber(student.grade);
    const gradeLabel = normalizedGrade ? `Grade ${normalizedGrade}` : (student.grade ? String(student.grade) : 'Grade N/A');
    const subParts = [`ID: ${student.student_id || 'N/A'}`, gradeLabel, student.section || null, student.email || null].filter(Boolean);
    document.getElementById('shStudentSub').textContent = subParts.join(' · ');

    const chipDefs = [
        { key: 'personal', label: 'Personal Info', icon: 'fa-id-card' },
        { key: 'referrals', label: 'Referrals', icon: 'fa-file-alt' },
        { key: 'counseling', label: 'Counseling', icon: 'fa-comments' },
        { key: 'follow_ups', label: 'Follow-Ups', icon: 'fa-calendar-check' },
        { key: 'appointments', label: 'Appointments', icon: 'fa-calendar-day' }
    ];
    document.getElementById('shStatChips').innerHTML = chipDefs.map(c => `
        <div class="sh-stat-chip" data-folder="${c.key}" role="button" tabindex="0">
            <i class="fas ${c.icon}"></i> ${c.label}${c.key === 'personal' ? '' : ` <span class="sh-stat-count">${counts[c.key] || 0}</span>`}
        </div>
    `).join('');
}

function shRenderPersonalInfo(student) {
    const body = document.getElementById('shBody-personal');
    const normalizedGrade = normalizeGradeNumber(student.grade);
    const gradeLabel = normalizedGrade ? `Grade ${normalizedGrade}` : (student.grade ? String(student.grade) : 'N/A');
    const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ') || student.name || 'N/A';

    const rows = (pairs) => pairs.map(([label, value]) => `
        <div class="sh-detail-row">
            <div class="sh-detail-label">${esc(label)}</div>
            <div class="sh-detail-value">${value ? esc(value) : 'N/A'}</div>
        </div>
    `).join('');

    body.innerHTML = `
        <div class="sh-subheading">Basic Information</div>
        ${rows([
            ['Full Name', fullName],
            ['Nickname', student.nickname],
            ['LRN', student.lrn],
            ['Sex', student.sex],
            ['Age', student.age],
            ['Date of Birth', shFormatDate(student.date_of_birth)],
            ['Place of Birth', student.place_of_birth],
            ['Religion (from birth)', student.religion_from_birth],
            ['Current Religion', student.current_religion]
        ])}

        <div class="sh-subheading">Contact &amp; Address</div>
        ${rows([
            ['Email', student.email],
            ['Cellphone', student.contact],
            ['Current Address', student.current_address],
            ['Permanent Address', student.permanent_address]
        ])}

        <div class="sh-subheading">Academic Info</div>
        ${rows([
            ['Student ID', student.student_id],
            ['Grade', gradeLabel],
            ['Section', student.section]
        ])}
    `;
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

function shApplyActiveFolder() {
    const typeFilter = document.getElementById('shTypeFilter').value;
    const highlighted = shActiveFolder === 'personal' ? 'personal' : (typeFilter || null);

    document.querySelectorAll('.sh-folder-tab[data-folder]').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-folder') === highlighted);
    });
    document.querySelectorAll('.sh-stat-chip[data-folder]').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-folder') === highlighted);
    });
    document.getElementById('shBody-personal').classList.toggle('active', shActiveFolder === 'personal');
    document.getElementById('shBody-timeline').classList.toggle('active', shActiveFolder !== 'personal');

    const titles = {
        referrals: 'Referrals',
        counseling: 'Counseling Sessions',
        follow_ups: 'Counseling Appointment Span',
        appointments: 'Online Appointments'
    };
    const titleEl = document.getElementById('shActiveFolderTitle');
    if (titleEl) {
        titleEl.textContent = shActiveFolder === 'personal' ? 'Personal Information' : (titles[typeFilter] || 'Recent History');
    }
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
    if (!shCurrentStudent) return;
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

    // Any filter interaction is about the record timeline, not the static
    // Personal Information panel, so it always takes over as the active view.
    const hasActiveFilters = shHasActiveFilters(filters);
    if (shActiveFolder !== 'personal' || hasActiveFilters) {
        shActiveFolder = 'timeline';
    }

    shRenderTimeline(grouped, hasActiveFilters);

    shApplyActiveFolder();
}

function shEmptyFolderHtml(noun, hasActiveFilters) {
    const message = hasActiveFilters
        ? `No ${noun} match the current filters.`
        : `No ${noun} recorded for this student yet.`;
    return `<div class="sh-folder-empty">${esc(message)}</div>`;
}

function shParseDate(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        // A bare "YYYY-MM-DD" (no time part — e.g. follow_up_date) is parsed
        // by the JS Date constructor as UTC midnight per spec, while the
        // "T"-joined datetime strings below (e.g. created_at) parse as local
        // time — so a date-only value ends up several hours off from where
        // it belongs once displayed/compared in local time (UTC midnight
        // shows as 8 AM local for a UTC+8 reader). Parse date-only values as
        // local midnight instead so both kinds compare and group correctly.
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

/* Builds one timeline entry — reusing the exact same .sh-file/.sh-file-row/
   .sh-file-detail structure the old per-folder cards used, so the existing
   click-to-expand delegation in shInit() keeps working unchanged. Referrals
   no longer go through here — see shBuildReferralThreadEntry() below, which
   renders a full Day 1/2/3... story instead of a flat field list. Each
   remaining type gets a "who did what" head line so the feed reads as a
   log of counselor/coordinator actions, matching how the referring record
   actually gets attributed in the data. */
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
            <div class="sh-detail-row"><div class="sh-detail-label">Linked Case</div><div class="sh-detail-value">${esc(f.case_title || f.case_uid) || '—'}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Follow-Up Date</div><div class="sh-detail-value">${esc(shFormatDate(f.follow_up_date))}</div></div>
        `;
    } else if (record.type === 'appointments') {
        const a = record.raw;
        const status = String(a.status || '').toLowerCase();
        const resolved = SH_RESOLVED_APPOINTMENT_STATUSES.includes(status);
        if (resolved) {
            actorLine = `<strong>Counselor</strong> ${esc(status)} an appointment request — <strong>${esc(a.reason || 'Appointment')}</strong>`;
            dateVal = a.updated_at || a.created_at;
        } else {
            const studentName = (shCurrentStudent && shCurrentStudent.name) || 'Student';
            actorLine = `<strong>${esc(studentName)}</strong> requested an appointment — <strong>${esc(a.reason || 'Appointment')}</strong>`;
            dateVal = a.created_at;
        }
        detailBody = `
            <div class="sh-detail-row"><div class="sh-detail-label">Preferred Date</div><div class="sh-detail-value">${esc(shFormatDate(a.preferred_date))} ${esc(a.preferred_time || '')}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Student Notes</div><div class="sh-detail-value">${esc(a.notes) || '—'}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Counselor Notes</div><div class="sh-detail-value">${esc(a.counselor_notes) || '—'}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Requested</div><div class="sh-detail-value">${esc(shFormatDateTime(a.created_at))}</div></div>
            <div class="sh-detail-row"><div class="sh-detail-label">Last Updated</div><div class="sh-detail-value">${esc(shFormatDateTime(a.updated_at))}</div></div>
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
    // (referrals.js) can send a referral there from any stage, not just
    // after Student Follow-up (6), so anything else landing on 7 is an
    // early close rather than the normal end-of-workflow path above.
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
   nest under, so it falls back to its own node. */
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

    // Collapsed-row summary — same shape as the referral thread's (see
    // shBuildReferralThreadEntry below): date of the last activity, plus
    // either an activity count or "Awaiting follow-up" for a case that has
    // nothing logged yet beyond its own opening.
    const dateLabel = shFormatDate(resolved ? (c.updated_at || lastActivityDate) : lastActivityDate);
    const summaryLabel = totalNotes > 1
        ? `${sessionNum} session${sessionNum === 1 ? '' : 's'} &middot; ${followUpNum} follow-up${followUpNum === 1 ? '' : 's'}`
        : 'Awaiting follow-up';

    // Collapses to just its summary header by default, like the referral
    // thread — reusing its .sh-referral-thread-* toggle classes/CSS/click
    // handler rather than duplicating a second collapse mechanism.
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

/* A referral's full story — submission (with the parent/guardian and grade/
   section context staff need, folded into the Day 1 note) and every risk-
   assessment note logged against it (Stage 2's screenings) — as one
   Day 1/2/3... thread of what actually happened, same pattern as a
   counseling case's thread above. No synthetic "current stage" summary is
   appended — a static 7-stage indicator isn't itself an event, and the
   collapsed row's status pill already covers "where things stand"; new
   days only appear here once a coordinator/counselor logs a real
   follow-up or update. Collapses to just its summary header by default
   (.sh-referral-thread, toggled in shInit()'s click delegation) — every
   referral renders this way now, even one with no screenings yet (just a
   single "Day 1 — Submitted" entry), instead of the old flat field list. */
// Same image-vs-file-link treatment as loadAssessmentFiles() in
// other-school/referrals.js — an actual picture thumbnail for an image
// upload, a plain file link for anything else (e.g. a PDF).
function shRenderStepFilePreview(url, fileName) {
    const ext = String(fileName || '').split('.').pop().toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    if (!isImage) {
        return `<a href="${url}" target="_blank" rel="noopener" class="file-chip"><i class="fas fa-file-lines"></i> ${esc(fileName)}</a>`;
    }
    // nextElementSibling is the .file-chip fallback right after this link —
    // swapped in if the image itself 404s (e.g. a missing file), so a
    // broken upload still reads as a clean row instead of a broken icon.
    return `<a href="${url}" target="_blank" rel="noopener" class="file-thumb-link"><img src="${url}" alt="${esc(fileName)}" class="file-thumb" onerror="this.closest('a').style.display='none'; this.closest('a').nextElementSibling.style.display='inline-flex';"></a><a href="${url}" target="_blank" rel="noopener" class="file-chip" style="display:none;"><i class="fas fa-image"></i> ${esc(fileName)}</a>`;
}

// linkedCase (optional) is the counseling case whose referral_code matches
// this referral's own code — looked up client-side in shRenderTimeline(),
// since both referrals and counseling cases are already loaded together
// there and there's no server-side join between the two tables. Shown in
// the collapsed subtitle so the connection is visible without expanding
// either card (see the matching "From Referral #..." tag added to
// shBuildCaseThreadEntry() above).
function shBuildReferralThreadEntry(r, linkedCase) {
    const day1Parts = [r.referral_reason || 'Referral submitted.'];
    if (r.intervention_attempts) day1Parts.push(`Initial actions taken: ${r.intervention_attempts}`);
    const events = [{
        rawDate: r.date_submitted,
        title: 'Referral submitted',
        stage: 1,
        by: r.teacher_name || 'A teacher',
        note: day1Parts.join(' '),
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

    // The Stage 2 assessment document itself (see api/referral-assessment)
    // — a separate table from the screening notes above, so it gets its own
    // step with an inline picture preview (fileUrl/fileName below, rendered
    // by stepsHtml). Confidential: api/student-history omits `assessments`
    // entirely for role=student callers, so this array is always empty on
    // the student's own copy of this page (appointment-history.js).
    (r.assessments || []).forEach(a => {
        events.push({
            rawDate: a.uploaded_at,
            title: 'Assessment document uploaded',
            stage: 2,
            by: a.uploaded_by || 'A counselor',
            note: '',
            pill: 'DOCUMENT',
            fileUrl: a.url,
            fileName: a.file_name
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
                ${ev.fileUrl ? shRenderStepFilePreview(ev.fileUrl, ev.fileName) : ''}
            </div>
        </div>`;
    }).join('');

    const lastEvent = events[events.length - 1];

    const gradeSection = [r.grade, r.section].filter(Boolean).join(' / ');
    const parentInfo = r.parent_guardian ? `${r.parent_guardian}${r.parent_contact ? ' (' + r.parent_contact + ')' : ''}` : '';
    const urgencyLabel = r.urgency ? String(r.urgency).charAt(0).toUpperCase() + String(r.urgency).slice(1) : '';
    const stageLabel = `Stage ${r.stage || 1}/6${r.stage_note ? ` — ${r.stage_note}` : ''}`;
    const subParts = [
        `Referral #${r.referral_code ? esc(r.referral_code) : '—'}`,
        `Referred by ${esc(r.teacher_name || 'a teacher')}`,
        gradeSection ? esc(gradeSection) : '',
        urgencyLabel ? `Urgency: ${esc(urgencyLabel)}` : '',
        esc(stageLabel),
        parentInfo ? `Parent: ${esc(parentInfo)}` : '',
        linkedCase ? `<span class="sh-linked-tag">Linked Counseling Case #${esc(linkedCase.case_uid)}</span>` : ''
    ].filter(Boolean).join(' &middot; ');

    // Collapsed-row summary: date of the last activity, plus either a step
    // count (once a counselor has actually logged something) or "Awaiting
    // counselor" for a referral that's just sitting at step 1.
    const dateLabel = shFormatDate(lastEvent.rawDate);
    const summaryLabel = events.length > 1
        ? `${events.length} step${events.length === 1 ? '' : 's'} logged`
        : 'Awaiting counselor';

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

    // Bucket follow-ups by case so each counseling case can absorb its own
    // follow-ups into one thread. A follow-up whose case isn't in the
    // current (filtered) counseling results falls back to a standalone
    // entry — e.g. filtering to "Counseling Follow-Ups" only.
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
    shAnimateTimelineEntries();

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
}

// Fades/slides each entry in as it scrolls into view within the timeline's
// own scrollable panel (see css/student-history.css's #shBody-timeline
// .sh-in rules). Re-run after every re-render since body.innerHTML wipes
// out any previously-observed nodes — cheap to redo, there's never more
// than a page's worth of entries in this panel.
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
