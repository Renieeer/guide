// SDO Dashboard — one page for district-wide guidance oversight. It merges
// what used to be three pages (Dashboard, School Reports, District
// Analytics): one set of filters — school level, school and period —
// drives every tile, chart, table and download.
//
// Sources (all live records, nothing sampled):
//   api/sdo-school-staff                    -> active schools: level, guidance staff
//   api/referral                            -> every referral (filtered here by school + date)
//   api/case-report?action=school_breakdown -> counseling cases per school (for the period)
//   api/case-report?action=categories       -> counseling cases by category x grade x sex
//
// Downloads (PDF / Excel) are words and tables only: the filters used, key
// figures, key findings and the detail tables. Charts stay on screen.

const ELEMENTARY_LEVELS = ['East', 'West', 'South'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REPORT_HEADER_COLOR = [29, 90, 168];
const CHART = {
    blue: '#1d5aa8', aqua: '#1baf7a', good: '#1b7f5a', warning: '#a15c00', critical: '#b3261e',
    grid: '#eaeef3', tick: '#5a6b80', label: '#16233a'
};
const CASELOAD_LABEL = { good: 'Healthy', warning: 'Elevated', critical: 'Critical gap', none: 'No cases' };

const dash = {
    schools: [],              // [{name, code, level, personnel}]
    schoolIndex: new Map(),   // lower-cased school name/code -> school
    referrals: [],
    breakdown: [],            // [{school, total, male, female}] for the loaded period
    categories: { sections: [], counts: {}, grades: [] },
    scopedKey: null,          // which school/period the two arrays above were loaded for
    view: null                // last computed figures — what's on screen and what gets downloaded
};

const filters = {
    level: 'all',   // 'all' | 'elementary' | 'secondary'
    school: '',     // '' = all schools
    period: 'all',  // 'all' | 'month' | 'quarter' | 'year' | 'custom'
    month: '',      // YYYY-MM
    quarter: 1,
    year: new Date().getFullYear(),
    from: '',       // YYYY-MM-DD
    to: ''
};

const charts = {};
let scopedRequestId = 0;
let pendingApply = null;
let dashBusyCount = 0;

/* ============================== Helpers ============================== */

const $ = (id) => document.getElementById(id);

function isElementaryLevel(level) {
    return ELEMENTARY_LEVELS.includes(level);
}

function levelGroup(level) {
    return isElementaryLevel(level) ? 'Elementary' : 'Secondary';
}

function norm(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function ymd(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

// MySQL "YYYY-MM-DD[ HH:MM:SS]" read as local time (new Date() would read a
// bare date as UTC midnight and shift it a day for some time zones).
function parseDbDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function fmtDate(d) {
    return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}

function pct(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function num(n) {
    return Number(n || 0).toLocaleString('en-US');
}

function plural(n, one, many) {
    return `${num(n)} ${n === 1 ? one : (many || `${one}s`)}`;
}

function listNames(names, max = 5) {
    if (names.length <= max) return names.join(', ');
    return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

async function fetchJson(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || `Request failed: ${url}`);
    return json;
}

// Nested calls (a full refresh runs an apply inside it) are counted, so
// the download buttons stay disabled until the last one finishes.
function setBusy(busy) {
    dashBusyCount = Math.max(0, dashBusyCount + (busy ? 1 : -1));
    const working = dashBusyCount > 0;
    if (busy) $('sdbStatus').textContent = 'Updating…';
    $('sdbPdfBtn').disabled = working;
    $('sdbExcelBtn').disabled = working;
}

function stampUpdated() {
    $('sdbStatus').textContent = `Updated ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/* ============================== Schools ============================== */

function setSchools(assignments) {
    dash.schools = (assignments || []).map(a => ({
        name: String(a.schoolName || '').trim(),
        code: String(a.schoolCode || '').trim(),
        level: a.schoolLevel || 'Secondary',
        personnel: Number(a.totalAssigned) || 0
    })).filter(s => s.name).sort((a, b) => a.name.localeCompare(b.name));

    dash.schoolIndex = new Map();
    dash.schools.forEach(s => {
        dash.schoolIndex.set(norm(s.name), s);
        if (s.code) dash.schoolIndex.set(norm(s.code), s);
    });
}

// The school a referral is counted under: the student's own school,
// falling back to the referring staff's school.
function schoolForReferral(r) {
    const key = norm(r.student_school) || norm(r.school_attended);
    return key ? (dash.schoolIndex.get(key) || null) : null;
}

function schoolPasses(s, { ignoreSchool = false } = {}) {
    if (filters.level === 'elementary' && !isElementaryLevel(s.level)) return false;
    if (filters.level === 'secondary' && isElementaryLevel(s.level)) return false;
    if (!ignoreSchool && filters.school && s.name !== filters.school) return false;
    return true;
}

function hasPlaceFilter() {
    return Boolean(filters.school || filters.level !== 'all');
}

function scopeSchools() {
    return dash.schools.filter(s => schoolPasses(s));
}

/* ============================== Period ============================== */

function periodInfo() {
    const now = new Date();
    switch (filters.period) {
        case 'month': {
            const [y, m] = (filters.month || currentMonthValue()).split('-').map(Number);
            return {
                start: new Date(y, m - 1, 1), end: new Date(y, m, 0),
                label: `${MONTH_NAMES[m - 1]} ${y}`, phrase: `in ${MONTH_NAMES[m - 1]} ${y}`,
                token: `${y}-${pad2(m)}`, trendYear: y
            };
        }
        case 'quarter': {
            const y = filters.year, q = filters.quarter;
            return {
                start: new Date(y, (q - 1) * 3, 1), end: new Date(y, q * 3, 0),
                label: `Q${q} ${y} (${MONTH_SHORT[(q - 1) * 3]}-${MONTH_SHORT[q * 3 - 1]})`, phrase: `in Q${q} ${y}`,
                token: `Q${q}-${y}`, trendYear: y
            };
        }
        case 'year': {
            const y = filters.year;
            return {
                start: new Date(y, 0, 1), end: new Date(y, 11, 31),
                label: String(y), phrase: `in ${y}`, token: String(y), trendYear: y
            };
        }
        case 'custom': {
            let from = filters.from ? parseDbDate(filters.from) : null;
            let to = filters.to ? parseDbDate(filters.to) : null;
            if (from && to && from > to) [from, to] = [to, from];
            if (from || to) {
                return {
                    start: from, end: to,
                    label: from && to ? `${fmtDate(from)} to ${fmtDate(to)}` : (from ? `From ${fmtDate(from)}` : `Up to ${fmtDate(to)}`),
                    phrase: from && to ? `between ${fmtDate(from)} and ${fmtDate(to)}` : (from ? `since ${fmtDate(from)}` : `up to ${fmtDate(to)}`),
                    token: `${from ? ymd(from) : 'start'}_to_${to ? ymd(to) : 'today'}`,
                    trendYear: (to || from).getFullYear()
                };
            }
            break;
        }
    }
    return { start: null, end: null, label: 'All time', phrase: 'across all records', token: 'all-time', trendYear: now.getFullYear() };
}

function inPeriod(date, p) {
    if (!p.start && !p.end) return true;
    if (!date) return false;
    if (p.start && date < p.start) return false;
    if (p.end && date > new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate(), 23, 59, 59, 999)) return false;
    return true;
}

// api/case-report date filter: its 'custom' period (BETWEEN start AND end).
// The end carries 23:59:59 so a DATETIME on the last day still counts.
function periodApiParams(p) {
    if (!p.start && !p.end) return { period: 'all' };
    return {
        period: 'custom',
        start: p.start ? ymd(p.start) : '1970-01-01',
        end: `${p.end ? ymd(p.end) : '2999-12-31'} 23:59:59`
    };
}

/* ============================== Referrals ============================== */

function referralInPlace(r) {
    const school = schoolForReferral(r);
    // A referral whose school isn't an active school only counts while no
    // level/school filter is set (it can't be placed in one).
    if (!school) return !hasPlaceFilter();
    return schoolPasses(school);
}

function scopeReferrals(p, { ignorePeriod = false } = {}) {
    return dash.referrals.filter(r => referralInPlace(r) && (ignorePeriod || inPeriod(parseDbDate(r.date_submitted), p)));
}

// Same buckets as the rest of the system: Stages 1-2 pending, 3-6 in
// progress, 7 (Case Closing) resolved.
function referralBucket(r) {
    const stage = Number(r.stage) || 1;
    if (stage >= 7) return 'resolved';
    if (stage >= 3) return 'inProgress';
    return 'pending';
}

function studentKey(r) {
    return r.student_id ? `id:${r.student_id}` : `name:${norm(r.student_name)}|${norm(r.student_school || r.school_attended)}`;
}

function caseloadStatus(cases, personnel) {
    if (cases === 0) return 'none';
    if (personnel === 0) return 'critical';
    const ratio = cases / personnel;
    if (ratio <= 5) return 'good';
    if (ratio <= 10) return 'warning';
    return 'critical';
}

/* ============================== Data loading ============================== */

async function loadBaseData() {
    const [staffRes, referralRes] = await Promise.all([
        fetchJson('../../api/sdo-school-staff'),
        fetchJson('../../api/referral')
    ]);
    setSchools(staffRes.assignments);
    dash.referrals = referralRes.data || [];
}

// Counseling-case figures come from the server per school/period; skipped
// when that selection hasn't changed (a level change, say, only re-filters
// what's already loaded). Returns false if a newer selection started while
// this one was loading. district=all is the API's "every active school".
async function loadScopedData(force) {
    const dateParams = periodApiParams(periodInfo());
    const key = JSON.stringify({ s: filters.school, ...dateParams });
    if (!force && key === dash.scopedKey) return true;

    const requestId = ++scopedRequestId;
    const breakdownParams = new URLSearchParams({ action: 'school_breakdown', district: 'all', ...dateParams });
    const categoryParams = new URLSearchParams({ action: 'categories', ...dateParams });
    if (filters.school) {
        categoryParams.set('school', filters.school);
    } else {
        categoryParams.set('district', 'all');
    }

    const [breakdown, categories] = await Promise.all([
        fetchJson(`../../api/case-report?${breakdownParams.toString()}`),
        fetchJson(`../../api/case-report?${categoryParams.toString()}`)
    ]);
    if (requestId !== scopedRequestId) return false;

    dash.breakdown = breakdown.schools || [];
    dash.categories = { sections: categories.sections || [], counts: categories.counts || {}, grades: categories.grades || [] };
    dash.scopedKey = key;
    return true;
}

async function applyFilters({ force = false } = {}) {
    syncFilterControls();
    setBusy(true);
    const run = (async () => {
        try {
            const current = await loadScopedData(force);
            if (current === false) return;
            renderAll();
            stampUpdated();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            showAlert('Some dashboard data could not be loaded. Showing the last figures.', 'warning');
            renderAll();
            $('sdbStatus').textContent = 'Could not refresh some data';
        }
    })();
    pendingApply = run;
    try {
        await run;
    } finally {
        if (pendingApply === run) pendingApply = null;
        setBusy(false);
    }
}

async function refreshAll(fromButton) {
    const btn = $('sdbRefreshBtn');
    if (fromButton) { btn.disabled = true; btn.classList.add('is-spinning'); }
    setBusy(true);
    try {
        await loadBaseData();
        populateYearOptions();
        populateSchoolOptions();
        await applyFilters({ force: true });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showAlert('Unable to load the dashboard data. Please try Refresh.', 'error');
        $('sdbStatus').textContent = 'Could not load data';
    } finally {
        setBusy(false);
        if (fromButton) { btn.disabled = false; btn.classList.remove('is-spinning'); }
    }
}

/* ============================== Filter controls ============================== */

function populateSchoolOptions() {
    const select = $('sdbSchool');
    const options = dash.schools.filter(s => schoolPasses(s, { ignoreSchool: true }));
    select.innerHTML = `<option value="">All schools (${options.length})</option>` +
        options.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
    if (!options.some(s => s.name === filters.school)) filters.school = '';
    select.value = filters.school;
}

// This year back to the earliest referral on record (at least 5 years).
function populateYearOptions() {
    const select = $('sdbYear');
    const thisYear = new Date().getFullYear();
    let earliest = thisYear - 4;
    dash.referrals.forEach(r => {
        const d = parseDbDate(r.date_submitted);
        if (d && d.getFullYear() < earliest && d.getFullYear() > 1990) earliest = d.getFullYear();
    });
    const years = [];
    for (let y = thisYear; y >= earliest; y--) years.push(y);
    select.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (!years.includes(filters.year)) filters.year = thisYear;
    select.value = String(filters.year);
}

function syncFilterControls() {
    $('sdbSchool').value = filters.school;
    $('sdbPeriod').value = filters.period;
    $('sdbMonth').value = filters.month;
    $('sdbQuarter').value = String(filters.quarter);
    $('sdbYear').value = String(filters.year);
    $('sdbFrom').value = filters.from;
    $('sdbTo').value = filters.to;
    document.querySelectorAll('#sdbLevel button').forEach(btn => {
        btn.setAttribute('aria-pressed', btn.dataset.level === filters.level ? 'true' : 'false');
    });
    document.querySelectorAll('[data-period-field]').forEach(field => {
        field.hidden = !field.dataset.periodField.split(' ').includes(filters.period);
    });
}

// Sensible starting values the first time a period type is picked.
function applyPeriodDefaults() {
    const now = new Date();
    if (filters.period === 'month' && !filters.month) filters.month = currentMonthValue();
    if (filters.period === 'quarter' && !filters.quarterTouched) filters.quarter = Math.floor(now.getMonth() / 3) + 1;
    if (filters.period === 'custom' && !filters.from && !filters.to) {
        filters.from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
        filters.to = ymd(now);
    }
}

function resetFilters() {
    Object.assign(filters, {
        level: 'all', school: '', period: 'all', month: '',
        quarter: 1, quarterTouched: false, year: new Date().getFullYear(), from: '', to: ''
    });
    $('sdbSchoolSearch').value = '';
    populateSchoolOptions();
    applyFilters();
}

function wireControls() {
    $('sdbLevel').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-level]');
        if (!btn || btn.dataset.level === filters.level) return;
        filters.level = btn.dataset.level;
        populateSchoolOptions();
        applyFilters();
    });

    $('sdbSchool').addEventListener('change', (e) => {
        filters.school = e.target.value;
        applyFilters();
    });

    $('sdbPeriod').addEventListener('change', (e) => {
        filters.period = e.target.value;
        applyPeriodDefaults();
        applyFilters();
    });

    $('sdbMonth').addEventListener('change', (e) => {
        if (!/^\d{4}-\d{2}$/.test(e.target.value)) return;
        filters.month = e.target.value;
        applyFilters();
    });
    $('sdbQuarter').addEventListener('change', (e) => {
        filters.quarter = parseInt(e.target.value, 10) || 1;
        filters.quarterTouched = true;
        applyFilters();
    });
    $('sdbYear').addEventListener('change', (e) => {
        filters.year = parseInt(e.target.value, 10) || new Date().getFullYear();
        applyFilters();
    });
    $('sdbFrom').addEventListener('change', (e) => { filters.from = e.target.value; applyFilters(); });
    $('sdbTo').addEventListener('change', (e) => { filters.to = e.target.value; applyFilters(); });

    $('sdbResetBtn').addEventListener('click', resetFilters);
    $('sdbRefreshBtn').addEventListener('click', () => refreshAll(true));
    $('sdbPdfBtn').addEventListener('click', downloadPdf);
    $('sdbExcelBtn').addEventListener('click', downloadExcel);

    $('sdbSchoolSearch').addEventListener('input', () => renderSchoolTable(dash.view));
    $('sdbSchoolPageSize').addEventListener('change', () => renderSchoolTable(dash.view));

    const today = new Date();
    $('sdbMonth').max = currentMonthValue();
    $('sdbFrom').max = ymd(today);
    $('sdbTo').max = ymd(today);
}

/* ============================== Figures ============================== */

function buildView() {
    const p = periodInfo();
    const schools = scopeSchools();
    const schoolNames = new Set(schools.map(s => s.name));
    const refs = scopeReferrals(p);

    // Referrals
    const status = { pending: 0, inProgress: 0, resolved: 0 };
    refs.forEach(r => { status[referralBucket(r)]++; });
    const totalRefs = refs.length;
    const students = new Set(refs.map(studentKey)).size;
    const resolutionRate = pct(status.resolved, totalRefs);
    const schoolsWithReferrals = new Set(refs.map(r => (schoolForReferral(r) || {}).name || norm(r.student_school || r.school_attended)).filter(Boolean)).size;

    // Counseling cases per school (already narrowed to the period on the server)
    const caseBySchool = new Map();
    dash.breakdown.forEach(row => {
        if (schoolNames.has(row.school)) caseBySchool.set(row.school, row);
    });
    const cases = { total: 0, male: 0, female: 0 };
    caseBySchool.forEach(row => {
        cases.total += Number(row.total) || 0;
        cases.male += Number(row.male) || 0;
        cases.female += Number(row.female) || 0;
    });
    const personnel = schools.reduce((sum, s) => sum + s.personnel, 0);

    // Per school
    const refsBySchool = new Map();
    refs.forEach(r => {
        const school = schoolForReferral(r);
        if (!school) return;
        if (!refsBySchool.has(school.name)) refsBySchool.set(school.name, []);
        refsBySchool.get(school.name).push(r);
    });
    const schoolRows = schools.map(s => {
        const rs = refsBySchool.get(s.name) || [];
        const c = caseBySchool.get(s.name) || { total: 0, male: 0, female: 0 };
        const caseTotal = Number(c.total) || 0;
        return {
            name: s.name,
            level: levelGroup(s.level),
            personnel: s.personnel,
            referrals: rs.length,
            resolved: rs.filter(r => referralBucket(r) === 'resolved').length,
            cases: caseTotal,
            male: Number(c.male) || 0,
            female: Number(c.female) || 0,
            perStaff: s.personnel > 0 ? caseTotal / s.personnel : null,
            status: caseloadStatus(caseTotal, s.personnel)
        };
    }).sort((a, b) => b.referrals - a.referrals || b.cases - a.cases || a.name.localeCompare(b.name));

    // Case categories (grade ranges stand in for school level: the server
    // already reads each school's cases as Grades 1-6 or 7-12 by its level)
    const { sections, counts, grades } = dash.categories;
    const gradeOk = (g) => filters.level === 'all' || (filters.level === 'elementary' ? g >= 1 && g <= 6 : g >= 7 && g <= 12);
    const categoryRows = [];
    const sectionRows = [];
    (sections || []).forEach(section => {
        let sectionElem = 0, sectionSec = 0;
        const entries = (section.categories || []).map(c => ({ id: c.categoryId, name: c.categoryName }));
        entries.push({ id: `section-${section.sectionId}-uncategorized`, name: 'Not yet categorized' });
        entries.forEach(entry => {
            const bucket = counts[entry.id];
            if (!bucket) return;
            let elementary = 0, secondary = 0, male = 0, female = 0;
            Object.entries(bucket).forEach(([grade, v]) => {
                const g = Number(grade);
                if (!gradeOk(g)) return;
                const m = Number(v && v.m) || 0, f = Number(v && v.f) || 0;
                male += m; female += f;
                if (g <= 6) elementary += m + f; else secondary += m + f;
            });
            const total = male + female;
            if (total > 0) {
                categoryRows.push({ section: section.sectionName, name: entry.name, elementary, secondary, male, female, total });
            }
            sectionElem += elementary;
            sectionSec += secondary;
        });
        sectionRows.push({ name: section.sectionName, elementary: sectionElem, secondary: sectionSec });
    });
    categoryRows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    // SARDO by grade
    let sardoId = null;
    (sections || []).forEach(section => (section.categories || []).forEach(c => {
        if (norm(c.categoryName) === 'sardo') sardoId = c.categoryId;
    }));
    const gradeKeys = ((grades && grades.length) ? grades : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
        .map(Number).filter(gradeOk).sort((a, b) => a - b);
    const sardoRows = gradeKeys.map(g => {
        const v = (sardoId && counts[sardoId] && counts[sardoId][String(g)]) || {};
        const male = Number(v.m) || 0, female = Number(v.f) || 0;
        return { grade: g, male, female, total: male + female };
    });
    const sardoTotal = sardoRows.reduce((sum, r) => sum + r.total, 0);

    // Month by month for the period's year (same place filters, whole year)
    const trendYear = p.trendYear;
    const now = new Date();
    const yearRefs = scopeReferrals(p, { ignorePeriod: true }).filter(r => {
        const d = parseDbDate(r.date_submitted);
        return d && d.getFullYear() === trendYear;
    });
    const lastMonth = trendYear < now.getFullYear() ? 12 : (trendYear === now.getFullYear() ? now.getMonth() + 1 : 0);
    const monthly = [];
    for (let m = 1; m <= lastMonth; m++) {
        const monthRefs = yearRefs.filter(r => parseDbDate(r.date_submitted).getMonth() + 1 === m);
        const resolved = monthRefs.filter(r => referralBucket(r) === 'resolved').length;
        monthly.push({
            month: m, name: MONTH_NAMES[m - 1], referrals: monthRefs.length,
            students: new Set(monthRefs.map(studentKey)).size, resolved, rate: pct(resolved, monthRefs.length)
        });
    }
    const yearResolved = yearRefs.filter(r => referralBucket(r) === 'resolved').length;
    const monthlyTotal = {
        referrals: yearRefs.length, students: new Set(yearRefs.map(studentKey)).size,
        resolved: yearResolved, rate: pct(yearResolved, yearRefs.length)
    };

    const view = {
        period: p,
        scope: scopeLabels(),
        schools, schoolRows,
        status, totalRefs, students, resolutionRate, schoolsWithReferrals,
        cases, personnel,
        categoryRows, sectionRows,
        sardoRows, sardoTotal,
        trendYear, monthly, monthlyTotal
    };
    view.findings = buildFindings(view);
    return view;
}

function scopeLabels() {
    return {
        level:filters.level === 'elementary' ? 'Elementary' : (filters.level === 'secondary' ? 'Secondary' : 'All levels'),
        school: filters.school || 'All schools'
    };
}

// Plain-language summary written into the downloads (not shown on screen).
function buildFindings(v) {
    const findings = [];
    const phrase = v.period.phrase;

    if (v.totalRefs === 0) {
        findings.push(`No referrals were submitted ${phrase}.`);
    } else {
        findings.push(`${plural(v.totalRefs, 'referral')} ${v.totalRefs === 1 ? 'was' : 'were'} submitted ${phrase}, covering ${plural(v.students, 'learner')}. ${num(v.status.resolved)} (${v.resolutionRate}%) reached case closing, ${num(v.status.inProgress)} ${v.status.inProgress === 1 ? 'is' : 'are'} in progress and ${num(v.status.pending)} ${v.status.pending === 1 ? 'is' : 'are'} still pending.`);
    }

    if (v.cases.total === 0) {
        findings.push(`No counseling cases were recorded ${phrase}.`);
    } else {
        findings.push(`${plural(v.cases.total, 'learner')} ${v.cases.total === 1 ? 'was' : 'were'} handled in counseling cases ${phrase} (${num(v.cases.male)} male, ${num(v.cases.female)} female).`);
    }

    const schoolCount = v.schools.length;
    if (v.personnel > 0) {
        findings.push(`${plural(v.personnel, 'guidance staff member')} ${v.personnel === 1 ? 'serves' : 'serve'} ${plural(schoolCount, 'school')}, about ${(v.cases.total / v.personnel).toFixed(1)} counseling cases each.`);
    } else if (schoolCount > 0) {
        findings.push(`No guidance staff are assigned to the ${plural(schoolCount, 'selected school')}.`);
    }

    const critical = v.schoolRows.filter(r => r.status === 'critical');
    if (critical.length > 0) {
        findings.push(`${plural(critical.length, 'school')} ${critical.length === 1 ? 'has' : 'have'} a critical caseload gap (more than 10 cases per guidance staff, or cases with no staff): ${listNames(critical.map(r => r.name))}.`);
    } else if (v.cases.total > 0) {
        findings.push('No school has a critical caseload gap.');
    }

    const noStaff = v.schoolRows.filter(r => r.personnel === 0);
    if (noStaff.length > 0 && noStaff.length < schoolCount) {
        findings.push(`${plural(noStaff.length, 'school')} ${noStaff.length === 1 ? 'has' : 'have'} no guidance staff assigned: ${listNames(noStaff.map(r => r.name))}.`);
    }

    if (v.categoryRows.length > 0) {
        const top = v.categoryRows.slice(0, 3).map(c => `${c.name} (${num(c.total)})`);
        findings.push(`Most common case ${v.categoryRows.length === 1 ? 'category' : 'categories'}: ${top.join(', ')}.`);
    }

    if (v.sardoTotal > 0) {
        // Name every grade sharing the top count, so a tie doesn't read as
        // "the most are in Grade 7 (1)" out of four.
        const topCount = Math.max(...v.sardoRows.map(r => r.total));
        const topGrades = v.sardoRows.filter(r => r.total === topCount).map(r => r.grade);
        const gradeList = topGrades.length === 1
            ? `Grade ${topGrades[0]}`
            : `Grades ${topGrades.slice(0, -1).join(', ')} and ${topGrades[topGrades.length - 1]}`;
        const gradesWithAny = v.sardoRows.filter(r => r.total > 0).length;
        let where;
        if (topGrades.length === 1) {
            where = `the most are in ${gradeList} (${num(topCount)})`;
        } else if (topGrades.length === gradesWithAny) {
            where = `spread across ${gradeList} (${num(topCount)} each)`;
        } else {
            where = `the most are in ${gradeList} (${num(topCount)} each)`;
        }
        findings.push(`${plural(v.sardoTotal, 'learner')} ${v.sardoTotal === 1 ? 'is' : 'are'} flagged SARDO (at risk of dropping out); ${v.sardoTotal === 1 ? `in ${gradeList}` : where}.`);
    } else {
        findings.push('No learners are flagged SARDO for this selection.');
    }

    const referringSchools = v.schoolRows.filter(r => r.referrals > 0);
    if (!filters.school && referringSchools.length > 1) {
        const rate = (r) => pct(r.resolved, r.referrals);
        const most = referringSchools.reduce((best, r) => (r.referrals > best.referrals ? r : best));
        const lowest = referringSchools.reduce((worst, r) => (rate(r) < rate(worst) ? r : worst));
        findings.push(`${most.name} has the most referrals (${num(most.referrals)}); ${lowest.name} has the lowest resolution rate (${rate(lowest)}%).`);
    }

    const peak = v.monthly.reduce((best, m) => (m.referrals > (best ? best.referrals : 0) ? m : best), null);
    if (peak) {
        findings.push(`In ${v.trendYear}, referrals peaked in ${peak.name} (${num(peak.referrals)}).`);
    }

    return findings;
}

/* ============================== Rendering ============================== */

function renderAll() {
    dash.view = buildView();
    const v = dash.view;
    renderScope(v);
    renderKpis(v);
    renderStatusChart(v);
    renderTrendChart(v);
    renderCaseloadChart(v);
    renderSardoChart(v);
    renderCaseTypesChart(v);
    renderSchoolTable(v);
    renderMonthlyTable(v);
    renderCategoryTable(v);
}

function renderScope(v) {
    $('sdbScope').innerHTML = `Showing <strong>${escapeHtml(v.scope.level)}</strong> &middot; <strong>${escapeHtml(v.scope.school)}</strong> &middot; <strong>${escapeHtml(v.period.label)}</strong>`;
}

function kpiList(v) {
    return [
        { icon: 'bi-box-arrow-up', label: 'Referrals', value: num(v.totalRefs), sub: `${plural(v.students, 'learner')} referred` },
        { icon: 'bi-hourglass-split', label: 'Open referrals', value: num(v.status.pending + v.status.inProgress), sub: `${num(v.status.pending)} pending · ${num(v.status.inProgress)} in progress` },
        { icon: 'bi-check-circle', label: 'Resolution rate', value: `${v.resolutionRate}%`, sub: v.totalRefs ? `${num(v.status.resolved)} of ${num(v.totalRefs)} resolved` : 'no referrals yet' },
        { icon: 'bi-chat-square-text', label: 'Counseling cases', value: num(v.cases.total), sub: `${num(v.cases.male)} male · ${num(v.cases.female)} female` },
        { icon: 'bi-people', label: 'Guidance staff', value: num(v.personnel), sub: v.personnel ? `~${(v.cases.total / v.personnel).toFixed(1)} cases each · ${plural(v.schools.length, 'school')}` : `${plural(v.schools.length, 'school')}, none assigned` },
        { icon: 'bi-exclamation-triangle', label: 'SARDO flagged', value: num(v.sardoTotal), sub: 'learners at risk of dropping out' }
    ];
}

function renderKpis(v) {
    $('sdbKpis').innerHTML = kpiList(v).map(k => `
        <div class="sdb-kpi">
            <p class="sdb-kpi-label"><i class="bi ${escapeHtml(k.icon)}" aria-hidden="true"></i> ${escapeHtml(k.label)}</p>
            <div class="sdb-kpi-value">${escapeHtml(k.value)}</div>
            <p class="sdb-kpi-sub">${escapeHtml(k.sub)}</p>
        </div>`).join('');
}

function destroyChart(key) {
    if (charts[key]) {
        charts[key].destroy();
        delete charts[key];
    }
}

// Shows the canvas (and returns true) only when there's data and Chart.js loaded.
function prepareChart(key, canvasId, emptyId, hasData) {
    destroyChart(key);
    const ok = hasData && typeof Chart !== 'undefined';
    $(canvasId).style.display = ok ? '' : 'none';
    $(emptyId).hidden = ok;
    if (hasData && typeof Chart === 'undefined') $(emptyId).textContent = 'Charts could not be loaded. The figures are in the tables below.';
    return ok;
}

const BASE_SCALES = (maxValue) => ({
    x: { ticks: { color: CHART.tick }, grid: { display: false } },
    y: { beginAtZero: true, suggestedMax: Math.max(5, maxValue), ticks: { color: CHART.tick, precision: 0 }, grid: { color: CHART.grid } }
});

function renderStatusChart(v) {
    const values = [v.status.resolved, v.status.inProgress, v.status.pending];
    const labels = ['Resolved', 'In progress', 'Pending'];
    const colors = [CHART.good, CHART.blue, CHART.warning];
    const hasData = v.totalRefs > 0;

    $('sdbStatusLegend').innerHTML = labels.map((label, i) => `
        <span class="sdb-legend-item"><span class="sdb-dot" style="background:${colors[i]};"></span> ${label} <b>${num(values[i])}${hasData ? ` · ${pct(values[i], v.totalRefs)}%` : ''}</b></span>`).join('');
    $('sdbStatusTotal').textContent = num(v.totalRefs);
    $('sdbStatusTotalLabel').textContent = v.totalRefs === 1 ? 'referral' : 'referrals';

    const ok = prepareChart('status', 'sdbStatusChart', 'sdbStatusEmpty', hasData);
    $('sdbStatusCenter').hidden = !ok;
    if (!ok) return;

    charts.status = new Chart($('sdbStatusChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#fff', borderWidth: 3 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${values[ctx.dataIndex]} of ${v.totalRefs} (${pct(values[ctx.dataIndex], v.totalRefs)}%)` } }
            }
        }
    });
}

function renderTrendChart(v) {
    $('sdbTrendEyebrow').textContent = `${v.trendYear} · ${v.scope.school}`;
    const hasData = v.monthly.some(m => m.referrals > 0);
    if (!prepareChart('trend', 'sdbTrendChart', 'sdbTrendEmpty', hasData)) return;

    charts.trend = new Chart($('sdbTrendChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: v.monthly.map(m => MONTH_SHORT[m.month - 1]),
            datasets: [
                { label: 'Referrals', data: v.monthly.map(m => m.referrals), backgroundColor: CHART.blue, borderRadius: 4, maxBarThickness: 22 },
                { label: 'Resolved', data: v.monthly.map(m => m.resolved), backgroundColor: CHART.good, borderRadius: 4, maxBarThickness: 22 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: BASE_SCALES(Math.max(...v.monthly.map(m => m.referrals)))
        }
    });
}

function renderCaseloadChart(v) {
    const rows = v.schoolRows.filter(r => r.cases > 0).sort((a, b) => b.cases - a.cases).slice(0, 12);
    if (!prepareChart('caseload', 'sdbCaseloadChart', 'sdbCaseloadEmpty', rows.length > 0)) return;

    charts.caseload = new Chart($('sdbCaseloadChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: rows.map(r => r.name),
            datasets: [{
                data: rows.map(r => r.cases),
                backgroundColor: rows.map(r => CHART[r.status] || CHART.good),
                borderRadius: 4, maxBarThickness: 18
            }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const r = rows[ctx.dataIndex];
                            const per = r.perStaff == null ? 'no staff' : `${r.perStaff.toFixed(1)} per staff`;
                            return `${r.cases} case${r.cases === 1 ? '' : 's'} · ${r.personnel} staff · ${per}`;
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, suggestedMax: Math.max(5, ...rows.map(r => r.cases)), ticks: { color: CHART.tick, precision: 0 }, grid: { color: CHART.grid } },
                y: { ticks: { color: CHART.label, font: { size: 11 }, callback: (val, idx) => truncate(rows[idx].name, 28) }, grid: { display: false } }
            }
        }
    });
}

function renderSardoChart(v) {
    const max = Math.max(0, ...v.sardoRows.map(r => r.total));
    if (!prepareChart('sardo', 'sdbSardoChart', 'sdbSardoEmpty', max > 0)) return;

    charts.sardo = new Chart($('sdbSardoChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: v.sardoRows.map(r => `Grade ${r.grade}`),
            datasets: [{
                data: v.sardoRows.map(r => r.total),
                backgroundColor: v.sardoRows.map(r => (r.total >= max * 0.66 ? CHART.critical : (r.total >= max * 0.33 ? CHART.warning : CHART.good))),
                borderRadius: 4, maxBarThickness: 34
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: BASE_SCALES(max)
        }
    });
}

function truncate(label, max) {
    const s = String(label || '');
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function renderCaseTypesChart(v) {
    const showElem = filters.level !== 'secondary';
    const showSec = filters.level !== 'elementary';
    $('sdbCaseTypesEyebrow').textContent = showElem && showSec ? 'elementary vs. secondary' : (showElem ? 'elementary' : 'secondary');
    $('sdbCaseTypesLegend').style.display = showElem && showSec ? '' : 'none';

    const rows = v.sectionRows;
    const hasData = rows.some(r => r.elementary > 0 || r.secondary > 0);
    if (!prepareChart('caseTypes', 'sdbCaseTypesChart', 'sdbCaseTypesEmpty', hasData)) return;

    const datasets = [];
    if (showElem) datasets.push({ label: 'Elementary', data: rows.map(r => r.elementary), backgroundColor: CHART.blue, borderRadius: 4, maxBarThickness: 26 });
    if (showSec) datasets.push({ label: 'Secondary', data: rows.map(r => r.secondary), backgroundColor: CHART.aqua, borderRadius: 4, maxBarThickness: 26 });

    charts.caseTypes = new Chart($('sdbCaseTypesChart').getContext('2d'), {
        type: 'bar',
        data: { labels: rows.map(r => r.name), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => rows[items[0].dataIndex].name } } },
            scales: {
                x: { ticks: { color: CHART.tick, callback: (val, idx) => truncate(rows[idx].name, 16), maxRotation: 0, autoSkip: false, font: { size: 10 } }, grid: { display: false } },
                y: { beginAtZero: true, suggestedMax: Math.max(5, ...rows.map(r => Math.max(r.elementary, r.secondary))), ticks: { color: CHART.tick, precision: 0 }, grid: { color: CHART.grid } }
            }
        }
    });
}

function emptyRow(cols, text) {
    return `<tr><td colspan="${cols}" class="sdb-table-empty">${escapeHtml(text)}</td></tr>`;
}

function renderSchoolTable(v) {
    if (!v) return;
    const body = $('sdbSchoolBody');
    const term = norm($('sdbSchoolSearch').value);
    const sizeValue = $('sdbSchoolPageSize').value;
    const size = sizeValue === 'all' ? Infinity : parseInt(sizeValue, 10);

    const matching = term ? v.schoolRows.filter(r => norm(r.name).includes(term)) : v.schoolRows;
    const shown = matching.slice(0, size);

    if (shown.length === 0) {
        body.innerHTML = emptyRow(8, term ? 'No school matches your search.' : 'No schools match these filters.');
    } else {
        body.innerHTML = shown.map(r => `
            <tr>
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td>${escapeHtml(r.level)}</td>
                <td class="num">${num(r.personnel)}</td>
                <td class="num">${num(r.referrals)}</td>
                <td class="num">${num(r.resolved)}</td>
                <td class="num">${num(r.cases)} <span class="sdb-eyebrow">(${num(r.male)}/${num(r.female)})</span></td>
                <td class="num">${r.perStaff == null ? '&ndash;' : r.perStaff.toFixed(1)}</td>
                <td><span class="sdb-status is-${escapeHtml(r.status)}">${escapeHtml(CASELOAD_LABEL[r.status])}</span></td>
            </tr>`).join('');
    }

    $('sdbSchoolFoot').textContent = matching.length > shown.length
        ? `Showing ${shown.length} of ${matching.length} schools. Downloads include every school.`
        : `${plural(matching.length, 'school')}.`;
}

function renderMonthlyTable(v) {
    $('sdbMonthlyEyebrow').textContent = `${v.trendYear} · referrals by month submitted`;
    const body = $('sdbMonthlyBody');
    if (v.monthly.length === 0) {
        body.innerHTML = emptyRow(5, `No months to show for ${v.trendYear} yet.`);
        return;
    }
    body.innerHTML = v.monthly.map(m => `
        <tr>
            <td><strong>${escapeHtml(m.name)}</strong></td>
            <td class="num">${num(m.referrals)}</td>
            <td class="num">${num(m.students)}</td>
            <td class="num">${num(m.resolved)}</td>
            <td class="num">${m.referrals ? `${m.rate}%` : '&ndash;'}</td>
        </tr>`).join('') + `
        <tr class="is-total">
            <td>Total ${v.trendYear}</td>
            <td class="num">${num(v.monthlyTotal.referrals)}</td>
            <td class="num">${num(v.monthlyTotal.students)}</td>
            <td class="num">${num(v.monthlyTotal.resolved)}</td>
            <td class="num">${v.monthlyTotal.referrals ? `${v.monthlyTotal.rate}%` : '&ndash;'}</td>
        </tr>`;
}

function renderCategoryTable(v) {
    const body = $('sdbCategoryBody');
    const top = v.categoryRows.slice(0, 10);
    if (top.length === 0) {
        body.innerHTML = emptyRow(4, 'No counseling cases for this selection.');
        $('sdbCategoryFoot').textContent = '';
        return;
    }
    body.innerHTML = top.map(c => `
        <tr>
            <td><strong>${escapeHtml(c.name)}</strong><br><span class="sdb-eyebrow">${escapeHtml(c.section)}</span></td>
            <td class="num">${num(c.male)}</td>
            <td class="num">${num(c.female)}</td>
            <td class="num">${num(c.total)}</td>
        </tr>`).join('');
    $('sdbCategoryFoot').textContent = v.categoryRows.length > top.length
        ? `Top ${top.length} of ${v.categoryRows.length} categories with cases. Downloads list all of them.`
        : '';
}

/* ============================== Downloads ============================== */

// Everything a download contains, built from the same figures as the screen.
function buildReportModel(v) {
    const perStaff = v.personnel > 0 ? (v.cases.total / v.personnel).toFixed(1) : 'n/a';
    const noData = 'No data for this selection.';

    return {
        title: 'SDO Guidance Dashboard Report',
        generated: new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
        filters: [
            ['School level', v.scope.level],
            ['School', v.scope.school],
            ['Period', v.period.label]
        ],
        keyFigures: [
            ['Referrals submitted', num(v.totalRefs)],
            ['Learners referred', num(v.students)],
            ['Pending (Stages 1-2)', num(v.status.pending)],
            ['In progress (Stages 3-6)', num(v.status.inProgress)],
            ['Resolved (Stage 7, Case Closing)', num(v.status.resolved)],
            ['Resolution rate', `${v.resolutionRate}%`],
            ['Schools with referrals', num(v.schoolsWithReferrals)],
            ['Learners in counseling cases', num(v.cases.total)],
            ['   Male', num(v.cases.male)],
            ['   Female', num(v.cases.female)],
            ['Schools in scope', num(v.schools.length)],
            ['Guidance staff', num(v.personnel)],
            ['Counseling cases per guidance staff', perStaff],
            ['SARDO-flagged learners', num(v.sardoTotal)]
        ],
        findings: v.findings,
        tables: [
            {
                name: 'Schools', title: 'School breakdown',
                headers: ['School', 'Level', 'Guidance staff', 'Referrals', 'Resolved', 'Cases', 'Male', 'Female', 'Cases per staff', 'Caseload'],
                align: 'llrrrrrrrl', widths: [40, 12, 13, 11, 11, 9, 8, 9, 13, 14],
                rows: v.schoolRows.map(r => [r.name, r.level, r.personnel, r.referrals, r.resolved, r.cases, r.male, r.female, r.perStaff == null ? '-' : r.perStaff.toFixed(1), CASELOAD_LABEL[r.status]]),
                total: v.schoolRows.length ? ['Total', '', v.personnel, sumOf(v.schoolRows, 'referrals'), sumOf(v.schoolRows, 'resolved'), v.cases.total, v.cases.male, v.cases.female, v.personnel > 0 ? perStaff : '-', ''] : null,
                empty: 'No schools match these filters.'
            },
            {
                name: 'Case Categories', title: 'Case categories (learners in counseling cases)',
                headers: ['Section', 'Category', 'Elementary', 'Secondary', 'Male', 'Female', 'Total'],
                align: 'llrrrrr', widths: [30, 34, 12, 12, 9, 9, 9],
                rows: v.categoryRows.map(c => [c.section, c.name, c.elementary, c.secondary, c.male, c.female, c.total]),
                total: v.categoryRows.length ? ['Total', '', sumOf(v.categoryRows, 'elementary'), sumOf(v.categoryRows, 'secondary'), sumOf(v.categoryRows, 'male'), sumOf(v.categoryRows, 'female'), sumOf(v.categoryRows, 'total')] : null,
                empty: 'No counseling cases for this selection.'
            },
            {
                name: 'SARDO by Grade', title: 'SARDO / at-risk learners by grade',
                headers: ['Grade', 'Male', 'Female', 'Total'],
                align: 'lrrr', widths: [14, 10, 10, 10],
                rows: v.sardoRows.map(r => [`Grade ${r.grade}`, r.male, r.female, r.total]),
                total: v.sardoRows.length ? ['Total', sumOf(v.sardoRows, 'male'), sumOf(v.sardoRows, 'female'), v.sardoTotal] : null,
                empty: noData
            },
            {
                name: 'Monthly', title: `Monthly referrals, ${v.trendYear}`,
                headers: ['Month', 'Referrals', 'Learners', 'Resolved', 'Resolution rate'],
                align: 'lrrrr', widths: [16, 11, 11, 11, 15],
                rows: v.monthly.map(m => [m.name, m.referrals, m.students, m.resolved, m.referrals ? `${m.rate}%` : '-']),
                total: v.monthly.length ? [`Total ${v.trendYear}`, v.monthlyTotal.referrals, v.monthlyTotal.students, v.monthlyTotal.resolved, v.monthlyTotal.referrals ? `${v.monthlyTotal.rate}%` : '-'] : null,
                empty: `No months to show for ${v.trendYear} yet.`
            }
        ]
    };
}

function sumOf(rows, key) {
    return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

function reportFileName(ext) {
    const v = dash.view;
    const place = filters.school || 'All-Schools';
    const level = filters.level === 'all' ? '' : `_${filters.level}`;
    const safe = (s) => String(s).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    return `SDO-Dashboard-Report_${safe(place)}${level}_${safe(v.period.token)}_${localDateString()}.${ext}`;
}

// Waits for any filter change still loading, so a download always matches
// what the filters currently say.
async function currentReport() {
    if (pendingApply) await pendingApply;
    if (!dash.view) throw new Error('The dashboard has not finished loading yet.');
    return buildReportModel(dash.view);
}

// jsPDF's built-in fonts only cover Latin-1, so swap the few typographic
// characters the text uses for plain ones.
function pdfText(value) {
    return String(value == null ? '' : value)
        .replace(/[–—]/g, '-')
        .replace(/·/g, '|')
        .replace(/…/g, '...')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"');
}

function buildPdf(model) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const top = sdoPdfContentTop(doc);
    const bottom = sdoPdfFooterReserve(doc);
    const tableBase = {
        margin: { top, bottom, left: margin, right: margin },
        theme: 'grid',
        headStyles: { fillColor: REPORT_HEADER_COLOR, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' }
    };

    let y = sdoDrawReportTitle(doc, model.title, `Generated: ${pdfText(model.generated)}`) + 3;

    const ensureSpace = (height) => {
        if (y + height > pageH - bottom) {
            doc.addPage();
            y = top;
        }
    };
    const heading = (text) => {
        ensureSpace(16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(20);
        doc.text(pdfText(text), margin, y);
        doc.setFont('helvetica', 'normal');
        y += 3;
    };
    const alignStyles = (align) => {
        const styles = {};
        String(align || '').split('').forEach((a, i) => { styles[i] = { halign: a === 'r' ? 'right' : 'left' }; });
        return styles;
    };

    heading('Filters applied');
    doc.autoTable({
        ...tableBase,
        theme: 'plain',
        startY: y,
        body: model.filters.map(([k, val]) => [{ content: k, styles: { fontStyle: 'bold' } }, pdfText(val)]),
        styles: { fontSize: 9.5, cellPadding: 1.2 },
        columnStyles: { 0: { cellWidth: 32 } }
    });
    y = doc.lastAutoTable.finalY + 8;

    heading('Key figures');
    doc.autoTable({
        ...tableBase,
        startY: y,
        head: [['Measure', 'Value']],
        body: model.keyFigures.map(([k, val]) => [pdfText(k), pdfText(val)]),
        columnStyles: { 1: { halign: 'right', cellWidth: 36 } },
        tableWidth: 120
    });
    y = doc.lastAutoTable.finalY + 8;

    heading('Key findings');
    y += 2;
    doc.setFontSize(10);
    doc.setTextColor(30);
    const textWidth = pageW - margin * 2 - 5;
    model.findings.forEach(text => {
        const lines = doc.splitTextToSize(pdfText(text), textWidth);
        ensureSpace(lines.length * 4.6 + 2);
        doc.text('-', margin + 1, y);
        doc.text(lines, margin + 5, y);
        y += lines.length * 4.6 + 2;
    });
    y += 4;

    model.tables.forEach(table => {
        heading(table.title);
        const body = table.rows.map(r => r.map(pdfText));
        if (table.total) body.push(table.total.map(pdfText));
        doc.autoTable({
            ...tableBase,
            startY: y,
            head: [table.headers],
            body: body.length ? body : [[{ content: table.empty, colSpan: table.headers.length, styles: { halign: 'center', textColor: 120 } }]],
            columnStyles: alignStyles(table.align),
            didParseCell: (data) => {
                if (table.total && data.section === 'body' && data.row.index === table.rows.length) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [241, 245, 249];
                }
            }
        });
        y = doc.lastAutoTable.finalY + 9;
    });

    drawSdoPdfLetterhead(doc);
    return doc;
}

const THIN_BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5AA8' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

function buildWorkbook(model) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Guidance Management System';
    wb.created = new Date();

    const titleRows = (ws, cols, title, subtitle) => {
        ws.mergeCells(1, 1, 1, cols);
        ws.getCell(1, 1).value = title;
        ws.getCell(1, 1).font = { bold: true, size: 14 };
        ws.mergeCells(2, 1, 2, cols);
        ws.getCell(2, 1).value = subtitle;
        ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF666666' } };
        return 4;
    };
    const writeTable = (ws, startRow, headers, rows, total, align, empty) => {
        let r = startRow;
        headers.forEach((h, c) => {
            const cell = ws.getCell(r, c + 1);
            cell.value = h;
            cell.fill = HEAD_FILL;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = THIN_BORDER;
        });
        r++;
        const writeRow = (values, isTotal) => {
            values.forEach((value, c) => {
                const cell = ws.getCell(r, c + 1);
                cell.value = value;
                cell.border = THIN_BORDER;
                cell.alignment = { vertical: 'middle', wrapText: true, horizontal: (align || '')[c] === 'r' ? 'right' : 'left' };
                if (isTotal) { cell.font = { bold: true }; cell.fill = TOTAL_FILL; }
            });
            r++;
        };
        if (rows.length === 0) {
            ws.mergeCells(r, 1, r, headers.length);
            ws.getCell(r, 1).value = empty;
            ws.getCell(r, 1).font = { italic: true, color: { argb: 'FF777777' } };
            r++;
        }
        rows.forEach(row => writeRow(row, false));
        if (total) writeRow(total, true);
        return r;
    };

    // Summary sheet: filters, key figures, findings.
    const summary = wb.addWorksheet('Summary');
    summary.getColumn(1).width = 40;
    summary.getColumn(2).width = 48;
    let row = titleRows(summary, 2, model.title, `Generated: ${model.generated}`);

    summary.getCell(row, 1).value = 'Filters applied';
    summary.getCell(row, 1).font = { bold: true, size: 12 };
    row++;
    model.filters.forEach(([k, val]) => {
        summary.getCell(row, 1).value = k;
        summary.getCell(row, 1).font = { bold: true };
        summary.getCell(row, 2).value = val;
        row++;
    });
    row++;

    summary.getCell(row, 1).value = 'Key figures';
    summary.getCell(row, 1).font = { bold: true, size: 12 };
    row++;
    row = writeTable(summary, row, ['Measure', 'Value'], model.keyFigures, null, 'lr', '');
    row++;

    summary.getCell(row, 1).value = 'Key findings';
    summary.getCell(row, 1).font = { bold: true, size: 12 };
    row++;
    model.findings.forEach(text => {
        summary.mergeCells(row, 1, row, 2);
        const cell = summary.getCell(row, 1);
        cell.value = `• ${text}`;
        cell.alignment = { wrapText: true, vertical: 'top' };
        summary.getRow(row).height = Math.max(15, Math.ceil(text.length / 85) * 15);
        row++;
    });

    // One sheet per detail table.
    model.tables.forEach(table => {
        const ws = wb.addWorksheet(table.name);
        table.widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
        const start = titleRows(ws, table.headers.length, table.title, model.filters.map(([k, val]) => `${k}: ${val}`).join('   |   '));
        writeTable(ws, start, table.headers, table.rows, table.total, table.align, table.empty);
    });

    return wb;
}

/* ---- Preview modals: same "view before you download" flow as the other SDO report pages ---- */

let pdfPreviewUrl = null;

function ensurePdfModal() {
    if ($('sdbPdfPreviewModal')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="sdbPdfPreviewModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="sdbPdfPreviewTitle">
        <div class="modal-content" style="max-width:980px; width:95%; height:88vh;">
            <div class="modal-header">
                <h2 id="sdbPdfPreviewTitle"><i class="bi bi-file-earmark-pdf"></i> PDF Preview</h2>
                <button type="button" class="modal-close" id="sdbPdfCloseX" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body" style="padding:0; flex:1; display:flex;">
                <iframe id="sdbPdfFrame" title="PDF preview" style="width:100%; height:100%; border:0;"></iframe>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="sdbPdfCloseBtn">Close</button>
                <button type="button" class="btn btn-secondary" id="sdbPdfPrintBtn"><i class="bi bi-printer"></i> Print</button>
                <button type="button" class="btn btn-primary" id="sdbPdfDownloadBtn"><i class="bi bi-download"></i> Download</button>
            </div>
        </div>
    </div>`);
    $('sdbPdfCloseX').addEventListener('click', closePdfPreview);
    $('sdbPdfCloseBtn').addEventListener('click', closePdfPreview);
}

function closePdfPreview() {
    closeModal('sdbPdfPreviewModal');
    $('sdbPdfFrame').src = 'about:blank';
    if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); pdfPreviewUrl = null; }
}

function ensureExcelModal() {
    if ($('sdbExcelPreviewModal')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="sdbExcelPreviewModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="sdbExcelPreviewTitle">
        <div class="modal-content" style="max-width:980px; width:95%; height:85vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2 id="sdbExcelPreviewTitle"><i class="bi bi-file-earmark-excel"></i> Excel Preview</h2>
                <button type="button" class="modal-close" id="sdbExcelCloseX" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body" style="flex:1; overflow:auto;" id="sdbExcelPreviewBody"></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="sdbExcelCloseBtn">Close</button>
                <button type="button" class="btn btn-success" id="sdbExcelDownloadBtn"><i class="bi bi-download"></i> Download</button>
            </div>
        </div>
    </div>`);
    $('sdbExcelCloseX').addEventListener('click', () => closeModal('sdbExcelPreviewModal'));
    $('sdbExcelCloseBtn').addEventListener('click', () => closeModal('sdbExcelPreviewModal'));
}

function previewTableHtml(headers, rows, total, align, empty) {
    const cell = (tag, value, i) => `<${tag}${(align || '')[i] === 'r' ? ' class="num"' : ''}>${escapeHtml(value == null ? '' : value)}</${tag}>`;
    const body = rows.length
        ? rows.map(r => `<tr>${r.map((v, i) => cell('td', v, i)).join('')}</tr>`).join('')
        : `<tr><td colspan="${headers.length}" class="sdb-table-empty">${escapeHtml(empty)}</td></tr>`;
    const totalRow = total ? `<tr class="is-total">${total.map((v, i) => cell('td', v, i)).join('')}</tr>` : '';
    return `<div class="table-container sdb-table-wrap"><table class="sdb-table">
        <thead><tr>${headers.map((h, i) => cell('th', h, i)).join('')}</tr></thead>
        <tbody>${body}${totalRow}</tbody></table></div>`;
}

function excelPreviewHtml(model) {
    const summary = `
        <div class="sdb-preview-sheet">
            <h3>Sheet: Summary</h3>
            <p>${escapeHtml(model.title)} &middot; Generated ${escapeHtml(model.generated)}</p>
            <h4>Filters applied</h4>
            ${previewTableHtml(['Filter', 'Value'], model.filters, null, 'll', '')}
            <h4>Key figures</h4>
            ${previewTableHtml(['Measure', 'Value'], model.keyFigures, null, 'lr', '')}
            <h4>Key findings</h4>
            <ul class="sdb-findings">${model.findings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
        </div>`;
    const sheets = model.tables.map(t => `
        <div class="sdb-preview-sheet">
            <h3>Sheet: ${escapeHtml(t.name)}</h3>
            <p>${escapeHtml(t.title)}</p>
            ${previewTableHtml(t.headers, t.rows, t.total, t.align, t.empty)}
        </div>`).join('');
    return summary + sheets;
}

async function downloadPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showAlert('The PDF library failed to load. Check your connection and refresh the page.', 'error');
        return;
    }
    try {
        const model = await currentReport();
        const doc = buildPdf(model);
        const filename = reportFileName('pdf');
        ensurePdfModal();
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        pdfPreviewUrl = doc.output('bloburl');
        $('sdbPdfFrame').src = pdfPreviewUrl;
        $('sdbPdfDownloadBtn').onclick = () => doc.save(filename);
        $('sdbPdfPrintBtn').onclick = () => {
            const frame = $('sdbPdfFrame');
            frame.contentWindow.focus();
            frame.contentWindow.print();
        };
        openModal('sdbPdfPreviewModal');
    } catch (error) {
        console.error('Error building PDF report:', error);
        showAlert(`Could not build the PDF: ${error.message}`, 'error');
    }
}

async function downloadExcel() {
    if (typeof ExcelJS === 'undefined') {
        showAlert('The Excel library failed to load. Check your connection and refresh the page.', 'error');
        return;
    }
    try {
        const model = await currentReport();
        const filename = reportFileName('xlsx');
        ensureExcelModal();
        $('sdbExcelPreviewBody').innerHTML = excelPreviewHtml(model);
        $('sdbExcelDownloadBtn').onclick = async () => {
            try {
                const buffer = await buildWorkbook(model).xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                showAlert('Excel report downloaded.', 'success');
            } catch (error) {
                console.error('Error writing Excel report:', error);
                showAlert(`Could not write the Excel file: ${error.message}`, 'error');
            }
        };
        openModal('sdbExcelPreviewModal');
    } catch (error) {
        console.error('Error building Excel report:', error);
        showAlert(`Could not build the Excel report: ${error.message}`, 'error');
    }
}

/* ============================== Start ============================== */

async function initSdoDashboard() {
    initPage();
    wireControls();
    syncFilterControls();
    // The PDF letterhead (built-in DepEd design or the division's uploaded
    // one, set under Report Cases > Report Settings) is needed before the
    // first PDF; loaded alongside the data rather than blocking it.
    loadSdoReportLetterheadOverride();
    await refreshAll(false);
}

document.addEventListener('DOMContentLoaded', initSdoDashboard);
