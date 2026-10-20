// District Guidance Analytics — all figures computed from live Division
// records (no sample/placeholder data). Sources:
//   - api/sdo-school-staff      -> per-school active guidance personnel
//   - api/case-report?action=school_breakdown -> per-school case totals
//   - api/case-report?action=categories        -> case counts by section/category/grade
//   - api/referral                              -> referral pipeline stages
// Elementary vs. Secondary is read off each school's own school_level
// (East/West/South = elementary, Secondary = secondary) rather than assumed,
// and grade buckets 1-6 / 7-12 already come pre-normalized per that level
// from case-report.php's own 'categories' action.

const ELEMENTARY_LEVELS = ['East', 'West', 'South'];

const state = {
    staff: [],          // [{schoolName, schoolLevel, district, totalAssigned}]
    schoolCases: {},     // schoolName -> {total, male, female}
    categoriesAll: null, // {sections, counts, grades} for every school (district=all)
    categoriesScoped: null, // same shape, scoped to the selected school (or same as categoriesAll)
    referrals: [],
    level: 'all',        // 'all' | 'elementary' | 'secondary'
    school: ''           // '' = all schools
};

const charts = {};

function isElementaryLevel(level) {
    return ELEMENTARY_LEVELS.includes(level);
}

function schoolMatchesLevel(schoolLevel, levelFilter) {
    if (levelFilter === 'all') return true;
    if (levelFilter === 'elementary') return isElementaryLevel(schoolLevel);
    return !isElementaryLevel(schoolLevel);
}

function gradeMatchesLevel(grade, levelFilter) {
    const g = Number(grade);
    if (levelFilter === 'all') return true;
    if (levelFilter === 'elementary') return g >= 1 && g <= 6;
    return g >= 7 && g <= 12;
}

function parseReferralGrade(raw) {
    const match = String(raw || '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

function findCategoryIdByName(sections, name) {
    const target = name.trim().toLowerCase();
    for (const section of sections || []) {
        for (const cat of section.categories || []) {
            if ((cat.categoryName || '').trim().toLowerCase() === target) {
                return cat.categoryId;
            }
        }
    }
    return null;
}

function sumBucket(bucket) {
    if (!bucket) return 0;
    return (bucket.m || 0) + (bucket.f || 0);
}

async function fetchJson(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || `Request failed: ${url}`);
    return json;
}

async function loadAll() {
    const [staffRes, breakdownRes, categoriesRes, referralRes] = await Promise.all([
        fetchJson('../../api/sdo-school-staff'),
        fetchJson('../../api/case-report?action=school_breakdown&district=all'),
        fetchJson('../../api/case-report?action=categories&district=all'),
        fetchJson('../../api/referral')
    ]);

    state.staff = staffRes.assignments || [];
    state.schoolCases = {};
    (breakdownRes.schools || []).forEach(row => {
        state.schoolCases[row.school] = row;
    });
    state.categoriesAll = { sections: categoriesRes.sections || [], counts: categoriesRes.counts || {}, grades: categoriesRes.grades || [] };
    state.categoriesScoped = state.categoriesAll;
    state.referrals = referralRes.data || [];
}

// Bumped on every call so that if the school/level selection changes again
// before an in-flight fetch resolves, that older request's response gets
// dropped instead of overwriting the newer (and thus correct) selection's
// data — same reportRequestId pattern as district-report-cases.js.
let scopedRequestId = 0;

async function loadScopedCategories() {
    const requestId = ++scopedRequestId;
    if (!state.school) {
        state.categoriesScoped = state.categoriesAll;
        return;
    }
    const res = await fetchJson(`../../api/case-report?action=categories&school=${encodeURIComponent(state.school)}`);
    if (requestId !== scopedRequestId) return; // superseded by a newer selection
    state.categoriesScoped = { sections: res.sections || [], counts: res.counts || {}, grades: res.grades || [] };
}

function scopedStaff() {
    return state.staff.filter(s => {
        if (state.school) return s.schoolName === state.school;
        return schoolMatchesLevel(s.schoolLevel, state.level);
    });
}

function scopedReferrals() {
    return state.referrals.filter(r => {
        const school = r.student_school || r.school_attended || '';
        if (state.school) {
            if (school !== state.school) return false;
        } else if (state.level !== 'all') {
            const grade = parseReferralGrade(r.grade);
            if (grade === null) return false;
            if (!gradeMatchesLevel(grade, state.level)) return false;
        }
        return true;
    });
}

function populateSchoolDropdown() {
    const select = document.getElementById('daSchoolSelect');
    const previous = state.school;

    const options = state.staff
        .filter(s => schoolMatchesLevel(s.schoolLevel, state.level))
        .map(s => s.schoolName)
        .sort((a, b) => a.localeCompare(b));

    select.innerHTML = '<option value="">All schools</option>' +
        options.map(name => `<option value="${name.replace(/"/g, '&quot;')}">${name}</option>`).join('');

    if (previous && options.includes(previous)) {
        select.value = previous;
    } else {
        state.school = '';
        select.value = '';
    }
}

function destroyChart(id) {
    if (charts[id]) {
        charts[id].destroy();
        delete charts[id];
    }
}

function renderStatTiles() {
    const staff = scopedStaff();
    const names = staff.map(s => s.schoolName);
    const personnelTotal = staff.reduce((sum, s) => sum + (s.totalAssigned || 0), 0);
    const caseTotal = names.reduce((sum, name) => sum + (state.schoolCases[name]?.total || 0), 0);

    document.getElementById('daStatActiveCases').textContent = caseTotal.toLocaleString();
    document.getElementById('daStatActiveCasesSub').textContent = `across ${names.length} school${names.length === 1 ? '' : 's'}`;

    document.getElementById('daStatPersonnel').textContent = personnelTotal.toLocaleString();
    document.getElementById('daStatPersonnelSub').textContent = personnelTotal > 0
        ? `~${Math.round(caseTotal / personnelTotal)} cases each`
        : 'none assigned yet';

    const sections = state.categoriesScoped.sections;
    const counts = state.categoriesScoped.counts;
    const sardoId = findCategoryIdByName(sections, 'SARDO');
    let sardoTotal = 0;
    if (sardoId && counts[sardoId]) {
        Object.entries(counts[sardoId]).forEach(([grade, bucket]) => {
            if (gradeMatchesLevel(grade, state.level)) sardoTotal += sumBucket(bucket);
        });
    }
    document.getElementById('daStatSardo').textContent = sardoTotal.toLocaleString();

    const referrals = scopedReferrals();
    const resolved = referrals.filter(r => Number(r.stage) === 7).length;
    const pct = referrals.length > 0 ? Math.round((resolved / referrals.length) * 100) : 0;
    document.getElementById('daStatResolution').textContent = `${pct}%`;
}

function caseloadStatus(caseTotal, personnel) {
    if (caseTotal === 0) return 'good';
    if (personnel === 0) return 'critical';
    const ratio = caseTotal / personnel;
    if (ratio <= 5) return 'good';
    if (ratio <= 10) return 'warning';
    return 'critical';
}

// Same status colors the rest of the system uses (--success-color/
// --warning-color/--danger-color in css/style.css), not a separate palette.
const STATUS_COLOR = { good: '#1b7f5a', warning: '#a15c00', critical: '#b3261e' };

function renderCaseloadChart() {
    const staff = scopedStaff();
    const rows = staff.map(s => {
        const caseTotal = state.schoolCases[s.schoolName]?.total || 0;
        return { name: s.schoolName, caseTotal, personnel: s.totalAssigned || 0 };
    }).sort((a, b) => b.caseTotal - a.caseTotal).slice(0, 12);

    const empty = document.getElementById('daCaseloadEmpty');
    const canvas = document.getElementById('daCaseloadChart');
    const hasData = rows.some(r => r.caseTotal > 0);
    empty.hidden = hasData;
    canvas.style.display = hasData ? '' : 'none';

    destroyChart('caseload');
    if (!hasData) return;

    charts.caseload = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: rows.map(r => r.name),
            datasets: [{
                data: rows.map(r => r.caseTotal),
                backgroundColor: rows.map(r => STATUS_COLOR[caseloadStatus(r.caseTotal, r.personnel)]),
                borderRadius: 4,
                maxBarThickness: 18
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const row = rows[ctx.dataIndex];
                            const perStaff = row.personnel > 0 ? (row.caseTotal / row.personnel).toFixed(1) : 'n/a';
                            return `${row.caseTotal} case${row.caseTotal === 1 ? '' : 's'} · ${row.personnel} staff · ${perStaff}/staff`;
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, suggestedMax: Math.max(5, ...rows.map(r => r.caseTotal)), ticks: { color: '#5a6b80', precision: 0 }, grid: { color: '#eaeef3' } },
                y: { ticks: { color: '#16233a', font: { size: 11 } }, grid: { display: false } }
            }
        }
    });
}

function renderResolutionDonut() {
    const referrals = scopedReferrals();
    const resolved = referrals.filter(r => Number(r.stage) === 7).length;
    const pending = referrals.filter(r => Number(r.stage) === 1).length;
    const inProgress = referrals.length - resolved - pending;

    const empty = document.getElementById('daResolutionEmpty');
    const canvas = document.getElementById('daResolutionChart');
    const hasData = referrals.length > 0;
    empty.hidden = hasData;
    canvas.style.display = hasData ? '' : 'none';

    destroyChart('resolution');
    if (!hasData) return;

    charts.resolution = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Resolved', 'In progress', 'Pending'],
            datasets: [{
                data: [resolved, inProgress, pending],
                backgroundColor: ['#1b7f5a', '#1d5aa8', '#a15c00'],
                borderColor: '#fff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: { legend: { display: false } }
        }
    });
}

function truncateLabel(label, max = 20) {
    return label.length > max ? label.slice(0, max - 1) + '…' : label;
}

function renderCaseTypesChart() {
    const { sections, counts } = state.categoriesScoped;
    const eyebrow = document.getElementById('daCaseTypesEyebrow');
    const showElementary = state.level === 'all' || state.level === 'elementary';
    const showSecondary = state.level === 'all' || state.level === 'secondary';
    eyebrow.textContent = showElementary && showSecondary ? 'elementary vs. secondary' : (showElementary ? 'elementary' : 'secondary');

    document.getElementById('daCaseTypesLegend').style.display = (showElementary && showSecondary) ? '' : 'none';

    const rows = sections.map(section => {
        let elementary = 0, secondary = 0;
        section.categories.forEach(cat => {
            const bucket = counts[cat.categoryId];
            if (!bucket) return;
            Object.entries(bucket).forEach(([grade, val]) => {
                const g = Number(grade);
                const count = sumBucket(val);
                if (g >= 1 && g <= 6) elementary += count;
                else if (g >= 7 && g <= 12) secondary += count;
            });
        });
        return { name: section.sectionName, elementary, secondary };
    });

    const empty = document.getElementById('daCaseTypesEmpty');
    const canvas = document.getElementById('daCaseTypesChart');
    const hasData = rows.some(r => r.elementary > 0 || r.secondary > 0);
    empty.hidden = hasData;
    canvas.style.display = hasData ? '' : 'none';

    destroyChart('caseTypes');
    if (!hasData) return;

    const datasets = [];
    if (showElementary) datasets.push({ label: 'Elementary', data: rows.map(r => r.elementary), backgroundColor: '#1d5aa8', borderRadius: 4, maxBarThickness: 26 });
    if (showSecondary) datasets.push({ label: 'Secondary', data: rows.map(r => r.secondary), backgroundColor: '#1baf7a', borderRadius: 4, maxBarThickness: 26 });

    charts.caseTypes = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: rows.map(r => r.name), datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { title: (items) => rows[items[0].dataIndex].name } }
            },
            scales: {
                x: { ticks: { color: '#5a6b80', callback: (val, idx) => truncateLabel(rows[idx].name, 14), maxRotation: 0, autoSkip: false, font: { size: 10 } }, grid: { display: false } },
                y: { beginAtZero: true, suggestedMax: Math.max(5, ...rows.map(r => Math.max(r.elementary, r.secondary))), ticks: { color: '#5a6b80', precision: 0 }, grid: { color: '#eaeef3' } }
            }
        }
    });
}

function renderSardoGradeChart() {
    const { sections, counts, grades } = state.categoriesScoped;
    const sardoId = findCategoryIdByName(sections, 'SARDO');
    const gradeKeys = (grades.length ? grades : [1,2,3,4,5,6,7,8,9,10,11,12])
        .filter(g => gradeMatchesLevel(g, state.level))
        .sort((a, b) => a - b);

    const values = gradeKeys.map(g => sardoId ? sumBucket(counts[sardoId]?.[String(g)]) : 0);
    const max = Math.max(0, ...values);

    const empty = document.getElementById('daSardoGradeEmpty');
    const canvas = document.getElementById('daSardoGradeChart');
    const hasData = max > 0;
    empty.hidden = hasData;
    canvas.style.display = hasData ? '' : 'none';

    destroyChart('sardoGrade');
    if (!hasData) return;

    const colors = values.map(v => {
        if (v === 0) return '#1baf7a';
        if (v >= max * 0.66) return STATUS_COLOR.critical;
        if (v >= max * 0.33) return STATUS_COLOR.warning;
        return STATUS_COLOR.good;
    });

    charts.sardoGrade = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: gradeKeys.map(g => `G${g}`),
            datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, maxBarThickness: 34 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#5a6b80' }, grid: { display: false } },
                y: { beginAtZero: true, suggestedMax: Math.max(5, ...values), ticks: { color: '#5a6b80', precision: 0 }, grid: { color: '#eaeef3' } }
            }
        }
    });
}

function render() {
    renderStatTiles();
    renderCaseloadChart();
    renderResolutionDonut();
    renderCaseTypesChart();
    renderSardoGradeChart();
}

function stampUpdatedTime() {
    document.getElementById('daUpdatedAt').textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function refresh(showSpinner) {
    const btn = document.getElementById('daRefreshBtn');
    if (showSpinner) { btn.disabled = true; btn.classList.add('is-spinning'); }
    try {
        await loadAll();
        await loadScopedCategories();
        populateSchoolDropdown();
        render();
        stampUpdatedTime();
    } catch (error) {
        console.error('Error loading district analytics:', error);
        if (typeof showAlert === 'function') {
            showAlert('Unable to load some analytics data. Showing the last known figures.', 'warning');
        }
    } finally {
        if (showSpinner) { btn.disabled = false; btn.classList.remove('is-spinning'); }
    }
}

function wireControls() {
    document.getElementById('daLevelTabs').addEventListener('click', async (e) => {
        const btn = e.target.closest('.da-tab');
        if (!btn) return;
        document.querySelectorAll('.da-tab').forEach(t => {
            const active = t === btn;
            t.classList.toggle('is-active', active);
            t.classList.toggle('btn-primary', active);
            t.classList.toggle('btn-outline', !active);
        });
        state.level = btn.dataset.level;
        populateSchoolDropdown();
        await loadScopedCategories();
        render();
    });

    document.getElementById('daSchoolSelect').addEventListener('change', async (e) => {
        state.school = e.target.value;
        await loadScopedCategories();
        render();
    });

    document.getElementById('daRefreshBtn').addEventListener('click', () => refresh(true));
}

document.addEventListener('DOMContentLoaded', () => {
    wireControls();
    refresh(false);
});
