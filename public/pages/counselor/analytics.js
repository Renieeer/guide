// Reports Dashboard — real data for the 4 checklist reports that belong
// on a per-school staff account: 7.1 Counseling Appointments, 7.2 Online
// Appointments, 7.3 Referral Distribution, 7.5 Child Summary Case.
// 7.4 (division-wide) is intentionally not here — that's SDO-only data,
// out of scope for a school-scoped account.
// Built entirely from this app's existing shared classes (css/style.css:
// .tabs/.tab-button, .dashboard-grid/.stat-card, .table-container,
// createBadge() from js/utils.js) — no separate design system.
// Same JS runs unmodified on the counselor, coordinator, and other-school
// portals — only the sidebar include in each .php differs; the API role
// param is derived at runtime from the logged-in account's own role.

const REPORTS = [
    { key: 'counseling', code: '7.1', name: 'Counseling Appointments', desc: 'Staff-scheduled, in-person' },
    { key: 'online', code: '7.2', name: 'Online Appointments', desc: 'Student self-booked' },
    { key: 'referrals', code: '7.3', name: 'Referral Distribution', desc: 'Breakdown by reason' },
    { key: 'child', code: '7.5', name: 'Child Summary Case', desc: 'Full per-student record' },
];

// Maps a logged-in account's own role to the `role=` value api/referral
// expects for its school-scoping branch — lets this one file work
// unmodified across all three portals.
const REFERRAL_API_ROLE = {
    counselor: 'counselor',
    coordinator: 'coordinator',
    'counselor-and-coordinator': 'other-school'
};

// Drawn from this app's own design tokens (css/style.css :root), not a
// separate palette — --secondary-color, --accent-emerald, --warning-color,
// --info, --danger-color, --role-coordinator, --role-teacher, --primary-color.
const CHART_COLORS = { navy: '#123a6b', green: '#1b7f5a', amber: '#a15c00', blue: '#1d5aa8', red: '#b3261e', purple: '#6a4fa3', teal: '#0e6e6e', darknavy: '#0b1f3a' };
const CHART_CAT = [CHART_COLORS.navy, CHART_COLORS.green, CHART_COLORS.amber, CHART_COLORS.blue, CHART_COLORS.red, CHART_COLORS.purple, CHART_COLORS.teal, CHART_COLORS.darknavy];
const STATUS_CHART_COLOR = { approved: CHART_COLORS.green, closed: CHART_COLORS.green, completed: CHART_COLORS.green, pending: CHART_COLORS.amber, rejected: CHART_COLORS.red, cancelled: CHART_COLORS.red };
// Maps this dashboard's real status values onto the 4 categories
// js/utils.js's createBadge() already knows how to color.
const BADGE_STATUS = { approved: 'completed', closed: 'completed', completed: 'completed', pending: 'pending', rejected: 'rejected', cancelled: 'rejected' };

let state = { report: 'counseling', student: null };
let lastAnimatedReport = null;
let charts = [];
let appointments = [];
let referrals = [];
let studentsList = [];
let studentDetailCache = {};
// Whether this account's school is elementary (school_level East/West/South,
// grades 1-6) or secondary (7-12) — decides the range gradeLabel() accepts
// when formatting a raw Grade value. Detected once in init(); defaults to
// secondary until that lookup resolves.
let isElementarySchool = false;

function esc(v) { const d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function countBy(rows, fn) { return rows.reduce((m, r) => { const k = fn(r) || 'Unspecified'; m[k] = (m[k] || 0) + 1; return m; }, {}); }
// referral_reason can hold several "; "-separated reasons (multi-select on the
// teacher's referral form) — tally each one on its own so the distribution
// report reflects real counts per reason instead of one bucket per combination.
function countByReason(rows, fn) {
    return rows.reduce((m, r) => {
        const raw = fn(r) || '';
        const parts = String(raw).split(';').map(s => s.trim()).filter(Boolean);
        if (parts.length === 0) { m['Unspecified'] = (m['Unspecified'] || 0) + 1; return m; }
        parts.forEach(part => { m[part] = (m[part] || 0) + 1; });
        return m;
    }, {});
}
// Same "; "-separated multi-reason splitting as countByReason, but also
// tallies Male/Female per reason — referral.gender is captured directly on
// the teacher's referral form (see other-school/referrals's Male/
// Female <select>), so no join is needed to get an accurate per-referral sex.
function reasonGenderBreakdown(rows) {
    return rows.reduce((m, r) => {
        const raw = r.referral_reason || '';
        const parts = String(raw).split(';').map(s => s.trim()).filter(Boolean);
        const reasonsHit = parts.length ? parts : ['Unspecified'];
        const g = String(r.gender || '').trim().toLowerCase();
        reasonsHit.forEach(reason => {
            if (!m[reason]) m[reason] = { male: 0, female: 0 };
            if (g === 'male') m[reason].male++;
            else if (g === 'female') m[reason].female++;
        });
        return m;
    }, {});
}
function meta(key) { return REPORTS.find(r => r.key === key); }
function gradeLabel(rawGrade, isElementary = isElementarySchool) { const n = normalizeGradeNumber(rawGrade, isElementary); return n ? `Grade ${n}` : (rawGrade || 'N/A'); }
function badge(status) { return createBadge(BADGE_STATUS[String(status || '').toLowerCase()] || 'pending'); }

function getUserSchool() {
    const user = getCurrentUser();
    return (user && (user.school_attended || user.school)) || '';
}

function getReferralApiRole() {
    const user = getCurrentUser();
    return REFERRAL_API_ROLE[user && user.role] || 'counselor';
}

function mkChart(canvas, config) {
    // Phones: a right-hand legend leaves a doughnut ~100px wide, so put it underneath.
    const legend = config.options && config.options.plugins && config.options.plugins.legend;
    if (legend && legend.position === 'right' && window.innerWidth < 768) {
        config = { ...config, options: { ...config.options, plugins: { ...config.options.plugins, legend: { ...legend, position: 'bottom' } } } };
    }
    const c = new Chart(canvas.getContext('2d'), config); charts.push(c); return c;
}
const legendRight = { plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 12, font: { size: 12 } } } } };
const noLegend = { plugins: { legend: { display: false } } };

function panelHeader(key, subtitle, onExportPdf) {
    const m = meta(key);
    const h = el(`<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:22px;">
        <div>
            <h2 class="card-title" style="margin-bottom:6px;">${esc(m.name)}</h2>
            <p class="text-muted" style="margin:0; max-width:64ch;">${esc(subtitle)}</p>
        </div>
        <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-primary" id="btnExportPdf"><i class="bi bi-file-earmark-pdf"></i> Export PDF</button>
        </div>
    </div>`);
    $('#btnExportPdf', h).addEventListener('click', onExportPdf);
    return h;
}
// c.color picks a stat-icon-* variant (info/amber/green/red/purple/teal,
// see css/style.css) so each metric in a row reads as its own thing at a
// glance instead of four identical blue circles.
const statCards = cards => `<div class="dashboard-grid" style="margin-bottom:24px;">${cards.map(c => `
    <div class="stat-card"><div class="stat-icon${c.color ? ' stat-icon-' + c.color : ''}"><i class="bi ${c.icon}"></i></div><div><h3>${c.num}</h3><p>${esc(c.lbl)}</p></div></div>`).join('')}</div>`;
const chartTile = (id, title, tall) => `<div class="table-container" style="padding:20px;">
    <h4 class="text-primary" style="margin-top:0;">${esc(title)}</h4>
    <div class="chart-box${tall ? ' chart-box-tall' : ''}" style="position:relative; height:${tall ? 320 : 260}px;"><canvas id="${id}"></canvas></div></div>`;
// Same card/title framing as chartTile, but for when there's no data to
// plot yet — an empty Chart.js canvas draws nothing at all (no axes, no
// "no data" message), which just looks broken rather than "zero".
const chartTileEmpty = (title, text, tall, icon) => `<div class="table-container" style="padding:20px;">
    <h4 class="text-primary" style="margin-top:0;">${esc(title)}</h4>
    <div style="height:${tall ? 320 : 260}px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:14px; color:var(--text-light);">
        <div class="empty-state-icon"><i class="bi ${icon || 'bi-bar-chart'}"></i></div>${esc(text)}</div></div>`;
const emptyNote = (text, icon) => `<div class="text-center text-muted" style="background:white; border:1px dashed var(--border-color); border-radius:12px; padding:48px 20px; display:flex; flex-direction:column; align-items:center; gap:14px;">
    <div class="empty-state-icon${icon === 'bi-arrow-repeat' ? ' spin' : ''}"><i class="bi ${icon || 'bi-inbox'}"></i></div><span>${esc(text)}</span></div>`;

/* ---- PDF preview: build with jsPDF + autoTable, show in-page before print/download ---- */
let pdfPreviewUrl = null;

function chartImage(id) {
    const canvas = document.getElementById(id);
    const chart = canvas && typeof Chart !== 'undefined' && Chart.getChart(canvas);
    return chart ? chart.toBase64Image('image/png', 1) : null;
}

function newPdf() {
    return new window.jspdf.jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
}

// Per-school PDF header/footer set up by the Coordinator under Report Case
// → Report Settings (pages/*/report-letterhead.js, keyed by school_code) —
// this page only ever reads it, no CRUD UI here, so a Counselor/Coordinator/
// other-school account at the same school automatically sees whatever the
// Coordinator configured. Point-unit equivalents of report-letterhead.js's
// own mm-based constants/functions, since this file's jsPDF docs use 'pt'.
const ANALYTICS_LETTERHEAD_MARGIN = 40; // matches the page's existing left/right text margin
const ANALYTICS_LETTERHEAD_IMAGE_TOP = 24; // pt from the page edge to the header image / up from the bottom edge to the footer image
const ANALYTICS_LETTERHEAD_GAP = 22; // pt breathing room between an image band and the report's own title/table

function analyticsLetterheadImageWidth(doc) {
    return doc.internal.pageSize.getWidth() - ANALYTICS_LETTERHEAD_MARGIN * 2;
}

function analyticsLetterheadHeaderHeight(doc) {
    const lh = getCurrentReportLetterhead();
    return lh ? analyticsLetterheadImageWidth(doc) / lh.headerRatio : 0;
}

function analyticsLetterheadFooterHeight(doc) {
    const lh = getCurrentReportLetterhead();
    return lh ? analyticsLetterheadImageWidth(doc) / lh.footerRatio : 0;
}

// Where page content may start/end, below the letterhead header band and
// above the footer band — 40pt from the page edge when no letterhead is
// set, matching this file's original fixed margins exactly.
function analyticsContentTop(doc) {
    if (!getCurrentReportLetterhead()) return 40;
    return ANALYTICS_LETTERHEAD_IMAGE_TOP + analyticsLetterheadHeaderHeight(doc) + ANALYTICS_LETTERHEAD_GAP;
}
function analyticsContentBottom(doc) {
    if (!getCurrentReportLetterhead()) return doc.internal.pageSize.getHeight() - 40;
    return doc.internal.pageSize.getHeight() - (ANALYTICS_LETTERHEAD_IMAGE_TOP + analyticsLetterheadFooterHeight(doc) + ANALYTICS_LETTERHEAD_GAP);
}

// autoTable paginates its own rows automatically, but it needs to know how
// much room a continuation page actually has — `top` keeps a repeated
// header row clear of the letterhead header image, `bottom` (only set when
// a letterhead is configured) keeps the last row clear of the footer image.
function analyticsAutoTableMargin(doc) {
    const margin = { left: 40, right: 40, top: analyticsContentTop(doc) };
    if (getCurrentReportLetterhead()) {
        margin.bottom = ANALYTICS_LETTERHEAD_IMAGE_TOP + analyticsLetterheadFooterHeight(doc) + ANALYTICS_LETTERHEAD_GAP;
    }
    return margin;
}

// Content this file draws directly (doc.text section headings, doc.addImage
// charts) has no built-in pagination the way autoTable rows do — without
// this check, a heading or chart placed too close to the bottom of a page
// gets cut off by the footer/letterhead band, or drawn off-page entirely,
// once earlier content on that page (a previous table, a taller-than-usual
// letterhead image) pushes y further down than a single-page layout
// assumed. Call before drawing anything that isn't an autoTable, with the
// vertical space it's about to need; starts a fresh page when it won't fit.
function analyticsEnsureSpace(doc, y, neededHeight) {
    if (y + neededHeight > analyticsContentBottom(doc)) {
        doc.addPage();
        return analyticsContentTop(doc);
    }
    return y;
}

// Stamps the header/footer image onto every page of a finished jsPDF
// document — called from showPdfPreview(), after autoTable has finished
// paginating, so it covers every export in this file from one place.
function stampAnalyticsReportLetterhead(doc) {
    const lh = getCurrentReportLetterhead();
    if (!lh) return;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgWidth = analyticsLetterheadImageWidth(doc);
    const headerHeight = analyticsLetterheadHeaderHeight(doc);
    const footerHeight = analyticsLetterheadFooterHeight(doc);
    const pageCount = doc.internal.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.addImage(lh.headerImage, 'PNG', ANALYTICS_LETTERHEAD_MARGIN, ANALYTICS_LETTERHEAD_IMAGE_TOP, imgWidth, headerHeight);
        doc.addImage(lh.footerImage, 'PNG', ANALYTICS_LETTERHEAD_MARGIN, pageHeight - ANALYTICS_LETTERHEAD_IMAGE_TOP - footerHeight, imgWidth, footerHeight);
    }
    doc.setPage(pageCount);
}

function pdfHeader(doc, title, subtitle) {
    const hasLetterhead = !!getCurrentReportLetterhead();

    if (!hasLetterhead) {
        // Unchanged from before the letterhead feature existed — a school
        // that's never touched Report Settings sees zero layout change.
        const school = getUserSchool();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(18, 58, 107);
        doc.text(title, 40, 44);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 110, 130);
        doc.text(school || '', 40, 60);
        doc.text(subtitle || '', 40, 74);
        doc.text(`Generated ${new Date().toLocaleString()}`, 40, 88);
        doc.setDrawColor(220, 224, 232);
        doc.line(40, 98, doc.internal.pageSize.getWidth() - 40, 98);
        return 120;
    }

    // With a letterhead, its header image already carries the school's own
    // name/seal (centered) — the title block is centered to match it and
    // given real breathing room below the image, instead of a left-aligned
    // block crammed right under the letterhead's own last text line.
    const pageCenterX = doc.internal.pageSize.getWidth() / 2;
    let y = ANALYTICS_LETTERHEAD_IMAGE_TOP + analyticsLetterheadHeaderHeight(doc) + ANALYTICS_LETTERHEAD_GAP;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(18, 58, 107);
    doc.text(title, pageCenterX, y, { align: 'center' });
    y += 18;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(100, 110, 130);
    if (subtitle) {
        doc.text(subtitle, pageCenterX, y, { align: 'center' });
        y += 13;
    }
    doc.text(`Generated ${new Date().toLocaleString()}`, pageCenterX, y, { align: 'center' });
    y += 14;

    doc.setDrawColor(220, 224, 232);
    doc.line(40, y, doc.internal.pageSize.getWidth() - 40, y);
    return y + 22;
}

function ensurePdfModal() {
    if (document.getElementById('pdfPreviewModal')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="pdfPreviewModal" class="modal">
        <div class="modal-content" style="max-width:980px; width:95%; height:88vh;">
            <div class="modal-header">
                <h2><i class="bi bi-file-earmark-pdf"></i> PDF Preview</h2>
                <button type="button" class="modal-close" id="pdfPreviewCloseX">&times;</button>
            </div>
            <div class="modal-body" style="padding:0; flex:1; display:flex;">
                <iframe id="pdfPreviewFrame" title="PDF preview" style="width:100%; height:100%; border:0;"></iframe>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="pdfPreviewCloseBtn">Close</button>
                <button type="button" class="btn btn-secondary" id="pdfPrintBtn"><i class="bi bi-printer"></i> Print</button>
                <button type="button" class="btn btn-primary" id="pdfDownloadBtn"><i class="bi bi-download"></i> Download</button>
            </div>
        </div>
    </div>`);
    $('#pdfPreviewCloseX').addEventListener('click', closePdfPreview);
    $('#pdfPreviewCloseBtn').addEventListener('click', closePdfPreview);
}

function closePdfPreview() {
    closeModal('pdfPreviewModal');
    $('#pdfPreviewFrame').src = 'about:blank';
    if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); pdfPreviewUrl = null; }
}

function showPdfPreview(doc, filename) {
    stampAnalyticsReportLetterhead(doc);
    ensurePdfModal();
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    pdfPreviewUrl = doc.output('bloburl');
    $('#pdfPreviewFrame').src = pdfPreviewUrl;
    $('#pdfDownloadBtn').onclick = () => doc.save(filename);
    $('#pdfPrintBtn').onclick = () => {
        const frame = $('#pdfPreviewFrame');
        frame.contentWindow.focus();
        frame.contentWindow.print();
    };
    openModal('pdfPreviewModal');
}

/* ---- 7.1 / 7.2 appointments ---- */
function renderAppointments(key) {
    const isOnline = key === 'online';
    const rows = appointments.filter(a => a.booking_type === key);
    const frag = document.createDocumentFragment();
    frag.append(panelHeader(key,
        isOnline ? 'Appointments students booked themselves through the online scheduling system.' : 'Appointments scheduled directly by staff for a student (e.g. a walk-in, or "Appoint Students" on a case).',
        () => {
            const doc = newPdf();
            const st2 = countBy(rows, r => r.status);
            const externalCount2 = new Set(referrals.filter(r => r.has_external_referral).map(r => r.student_id)).size;
            let y = pdfHeader(doc, meta(key).name,
                isOnline ? 'Student self-booked appointments' : 'Staff-scheduled appointments');

            doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30, 40, 60);
            doc.text(`Total: ${rows.length}   Pending: ${st2['pending'] || 0}   Approved: ${st2['approved'] || 0}   External: ${externalCount2}`, 40, y);
            y += 20;

            if (rows.length > 0) {
                const pageW = doc.internal.pageSize.getWidth();
                const half = (pageW - 80 - 16) / 2;
                const imgStatus = chartImage('chStatus');
                const imgReason = chartImage('chReason');
                if (imgStatus || imgReason) {
                    y = analyticsEnsureSpace(doc, y, 150);
                    if (imgStatus) doc.addImage(imgStatus, 'PNG', 40, y, half, 150);
                    if (imgReason) doc.addImage(imgReason, 'PNG', 40 + half + 16, y, half, 150);
                    y += 166;
                }
                const imgTrend = chartImage('chTrend');
                if (imgTrend) {
                    y = analyticsEnsureSpace(doc, y, 140);
                    doc.addImage(imgTrend, 'PNG', 40, y, pageW - 80, 140);
                    y += 156;
                }

                const sortedRows = rows.slice()
                    .sort((a, b) => `${a.preferred_date} ${a.preferred_time}`.localeCompare(`${b.preferred_date} ${b.preferred_time}`));

                if (isOnline) {
                    // Mirrors the on-screen Appointment List table (Student
                    // Name included) — unlike the counseling-appointment
                    // export below, which uses its own column set.
                    doc.autoTable({
                        startY: y,
                        head: [['#', 'Student Name', 'Grade', 'Appointment Date', 'Time', 'Reason']],
                        body: sortedRows.map((r, i) => [
                            i + 1,
                            r.student_name || 'N/A',
                            gradeLabel(r.grade),
                            r.preferred_date || 'N/A',
                            r.preferred_time || 'N/A',
                            r.case_section || r.reason || 'N/A'
                        ]),
                        styles: { fontSize: 9 },
                        headStyles: { fillColor: [18, 58, 107] },
                        margin: analyticsAutoTableMargin(doc),
                    });
                } else {
                    // Scheduled By = scheduled_by_name (api/appointment-request's
                    // created_by_id, resolved to a name) — captured once when the
                    // appointment was first created by staff, unlike counselor_id,
                    // which gets overwritten on every later status change and so
                    // can't reliably answer "who scheduled this".
                    doc.autoTable({
                        startY: y,
                        head: [['#', 'Student Name', 'Grade', 'Appointment Date', 'Time', 'Reason', 'Scheduled By']],
                        body: sortedRows.map((r, i) => [
                            i + 1,
                            r.student_name || 'N/A',
                            gradeLabel(r.grade),
                            r.preferred_date || 'N/A',
                            r.preferred_time || 'N/A',
                            r.case_section || r.reason || 'N/A',
                            r.scheduled_by_name || 'N/A'
                        ]),
                        styles: { fontSize: 9 },
                        headStyles: { fillColor: [18, 58, 107] },
                        margin: analyticsAutoTableMargin(doc),
                    });
                }
            } else {
                doc.setTextColor(120, 130, 150);
                doc.text(`No ${isOnline ? 'online' : 'counseling'} appointments recorded for your school yet.`, 40, y + 16);
            }

            showPdfPreview(doc, `gms_${key}_appointments.pdf`);
        }));

    const st = countBy(rows, r => r.status);
    // Schoolwide count, independent of this tab's appointment rows — how many
    // distinct students have a completed External Referral (DepEd Appendix C)
    // form on file (api/referral's has_external_referral, sourced from
    // referral_external_referral). Replaces the old "Rejected" appointment-
    // status card, which wasn't a very useful headline number here.
    const externalStudentIds = new Set(referrals.filter(r => r.has_external_referral).map(r => r.student_id));
    frag.append(el(statCards([
        { num: rows.length, lbl: 'Total', icon: 'bi-calendar3', color: 'info' },
        { num: st['pending'] || 0, lbl: 'Pending', icon: 'bi-hourglass-split', color: 'amber' },
        { num: st['approved'] || 0, lbl: 'Approved', icon: 'bi-check-circle', color: 'green' },
        { num: externalStudentIds.size, lbl: 'External', icon: 'bi-send-check', color: 'red' },
    ])));

    frag.append(el(`<div class="an-pair" style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px;">
        ${chartTile('chStatus', 'Status Breakdown')}${chartTile('chReason', 'By Reason')}</div>`));
    frag.append(el(`<div style="margin-bottom:28px;">${chartTile('chTrend', 'Daily Trend')}</div>`));

    // Per-appointment list — named columns for both tabs. Grade formatting
    // already adapts to the logged-in account's school level (elementary
    // East/West/South vs. secondary) via gradeLabel()/isElementarySchool,
    // and `rows` is already scoped to this account's own school, so this
    // works unmodified across the coordinator, counselor, and combined
    // (counselor-and-coordinator/other-school) portals.
    {
        const sortedRows = rows.slice()
            .sort((a, b) => `${a.preferred_date} ${a.preferred_time}`.localeCompare(`${b.preferred_date} ${b.preferred_time}`));
        // Counseling Appointments adds a Scheduled By column — the account
        // that created the appointment (api/appointment-request's
        // created_by_id, resolved server-side to scheduled_by_name), captured
        // once at creation. Deliberately NOT the same as counselor_id, which
        // gets overwritten on every later approve/reject/reschedule and so
        // can't reliably answer "who scheduled this". N/A for rows that
        // predate this column.
        const listRows = sortedRows
            .map((r, i) => `<tr>
                <td>${i + 1}</td>
                <td>${esc(r.student_name || 'N/A')}</td>
                <td>${esc(gradeLabel(r.grade))}</td>
                <td>${esc(r.preferred_date || 'N/A')}</td>
                <td>${esc(r.preferred_time || 'N/A')}</td>
                <td>${esc(r.case_section || r.reason || 'N/A')}</td>
                ${isOnline ? '' : `<td>${esc(r.scheduled_by_name || 'N/A')}</td>`}
            </tr>`).join('');
        const colCount = isOnline ? 6 : 7;
        frag.append(el(`<div style="margin-bottom:28px;">
            <h3 class="text-primary">Appointment List</h3>
            <div class="table-container"><table>
                <thead><tr><th>#</th><th>Student Name</th><th>Grade</th><th>Appointment Date</th><th>Time</th><th>Reason</th>${isOnline ? '' : '<th>Scheduled By</th>'}</tr></thead>
                <tbody>${listRows || `<tr><td colspan="${colCount}" class="text-center text-muted" style="padding:30px;">No ${isOnline ? 'online' : 'counseling'} appointments recorded for your school yet.</td></tr>`}</tbody>
            </table></div>
        </div>`));
    }

    queueMicrotask(() => {
        const sl = Object.keys(st);
        mkChart($('#chStatus'), { type: 'doughnut', data: { labels: sl, datasets: [{ data: sl.map(k => st[k]), backgroundColor: sl.map(k => STATUS_CHART_COLOR[k] || CHART_COLORS.navy), borderColor: '#fff', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '58%', ...legendRight } });

        // Grouped by the linked counseling case's Case Section
        // (api/appointment-request's case_section, from
        // counselor_case_scenarios.section_name) rather than the appointment's
        // own free-text reason, which for staff-scheduled follow-ups is just
        // an auto-filled "Follow-up for case CS-..." string — not a real
        // reason category. Falls back to the raw reason for appointments
        // never linked to a case (e.g. a student's own online booking).
        const rb = countBy(rows, r => r.case_section || r.reason); const rl = Object.keys(rb);
        mkChart($('#chReason'), { type: 'bar', data: { labels: rl, datasets: [{ data: rl.map(k => rb[k]), backgroundColor: CHART_COLORS.navy, borderRadius: 5, maxBarThickness: 46 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, ...noLegend, scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eaeef3' } }, y: { grid: { display: false } } } } });

        const db = countBy(rows, r => r.preferred_date); const dl = Object.keys(db).sort();
        mkChart($('#chTrend'), { type: 'line', data: { labels: dl.map(d => d.slice(5)), datasets: [{ data: dl.map(k => db[k]), borderColor: CHART_COLORS.navy, backgroundColor: 'rgba(18,58,107,.10)', fill: true, tension: .35, pointBackgroundColor: CHART_COLORS.navy, pointRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, ...noLegend, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eaeef3' } }, x: { grid: { display: false } } } } });
    });

    return frag;
}

/* ---- 7.3 referral distribution ---- */
function renderReferrals() {
    const frag = document.createDocumentFragment();
    const agg = countByReason(referrals, r => r.referral_reason);
    const reasons = Object.entries(agg).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
    const total = referrals.length;
    const genderMap = reasonGenderBreakdown(referrals);
    // These are column sums over the per-reason rows below, not distinct
    // referral counts — a referral with several ";"-separated reasons (see
    // countByReason) is tallied once per reason it lists, same as every
    // other number in this table, so the total row foots exactly what's
    // displayed above it.
    const totalMale = reasons.reduce((sum, r) => sum + (genderMap[r.reason]?.male || 0), 0);
    const totalFemale = reasons.reduce((sum, r) => sum + (genderMap[r.reason]?.female || 0), 0);
    const totalReasonCount = reasons.reduce((sum, r) => sum + r.count, 0);

    frag.append(panelHeader('referrals',
        'Every referral reason on record for your school — the full breakdown, not just the top few.',
        () => {
            const doc = newPdf();
            let y = pdfHeader(doc, 'Referral Distribution', 'Every referral reason on record for your school');

            doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30, 40, 60);
            doc.text(`Total referrals: ${total}   Distinct reasons: ${reasons.length}`, 40, y);
            y += 20;

            if (total > 0) {
                const pageW = doc.internal.pageSize.getWidth();
                const imgReasons = chartImage('chReasons');
                if (imgReasons) {
                    y = analyticsEnsureSpace(doc, y, 170);
                    doc.addImage(imgReasons, 'PNG', 40, y, pageW - 80, 170);
                    y += 186;
                }
                const imgUrgency = chartImage('chUrgency');
                if (imgUrgency) {
                    y = analyticsEnsureSpace(doc, y, 140);
                    doc.addImage(imgUrgency, 'PNG', 40, y, (pageW - 80) / 2, 140);
                    y += 156;
                }

                doc.autoTable({
                    startY: y,
                    head: [['Referral Reason', 'Number of Referrals', 'Male', 'Female']],
                    body: [
                        ...reasons.map(r => {
                            const g = genderMap[r.reason] || { male: 0, female: 0 };
                            return [r.reason, r.count, g.male, g.female];
                        }),
                        ['Overall Total', totalReasonCount, totalMale, totalFemale]
                    ],
                    styles: { fontSize: 9 },
                    headStyles: { fillColor: [18, 58, 107] },
                    didParseCell: (data) => {
                        if (data.row.index === reasons.length) {
                            data.cell.styles.fontStyle = 'bold';
                        }
                    },
                    margin: analyticsAutoTableMargin(doc),
                });
            } else {
                doc.setTextColor(120, 130, 150);
                doc.text('No referrals recorded for your school yet.', 40, y + 16);
            }

            showPdfPreview(doc, 'gms_referral_distribution.pdf');
        }));

    frag.append(el(statCards([
        { num: total, lbl: 'Total referrals', icon: 'bi-clipboard-data', color: 'info' },
        { num: reasons.length, lbl: 'Distinct reasons', icon: 'bi-tags', color: 'purple' },
        { num: reasons[0] ? reasons[0].count : 0, lbl: 'Top reason count', icon: 'bi-graph-up-arrow', color: 'teal' },
        { num: new Set(referrals.map(r => r.student_name)).size, lbl: 'Students referred', icon: 'bi-people', color: 'green' },
    ])));

    frag.append(el(`<div style="margin-bottom:20px;">${chartTile('chReasons', 'Referrals by Reason (All)', true)}</div>`));
    frag.append(el(`<div style="max-width:480px; margin-bottom:28px;">${chartTile('chUrgency', 'By Urgency')}</div>`));

    if (total === 0) {
        frag.append(el(emptyNote('No referrals recorded for your school yet.', 'bi-clipboard-x')));
    } else {
        const tr = reasons.map(r => {
            const g = genderMap[r.reason] || { male: 0, female: 0 };
            return `<tr><td>${esc(r.reason)}</td><td style="text-align:right;">${r.count}</td><td style="text-align:right;">${g.male}</td><td style="text-align:right;">${g.female}</td></tr>`;
        }).join('');
        frag.append(el(`<div><h3 class="text-primary">Reason Breakdown</h3><div class="table-container"><table>
            <thead><tr><th>Referral Reason</th><th style="text-align:right;">Number of Referrals</th><th style="text-align:right;">Male</th><th style="text-align:right;">Female</th></tr></thead>
            <tbody>${tr}<tr style="font-weight:700;"><td>Overall Total</td><td style="text-align:right;">${totalReasonCount}</td><td style="text-align:right;">${totalMale}</td><td style="text-align:right;">${totalFemale}</td></tr></tbody>
        </table></div></div>`));
    }

    queueMicrotask(() => {
        mkChart($('#chReasons'), { type: 'bar', data: { labels: reasons.map(r => r.reason), datasets: [{ data: reasons.map(r => r.count), backgroundColor: reasons.map((_, i) => CHART_CAT[i % CHART_CAT.length]), borderRadius: 5 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, ...noLegend, scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eaeef3' } }, y: { grid: { display: false } } } } });
        const ub = countBy(referrals, r => r.urgency || 'normal'); const ul = Object.keys(ub);
        mkChart($('#chUrgency'), { type: 'doughnut', data: { labels: ul, datasets: [{ data: ul.map(k => ub[k]), backgroundColor: ul.map((_, i) => CHART_CAT[i % CHART_CAT.length]), borderColor: '#fff', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '55%', ...legendRight } });
    });

    return frag;
}

/* ---- 7.5 child summary case ---- */
function renderChild() {
    const frag = document.createDocumentFragment();
    frag.append(panelHeader('child', 'The complete guidance record for one student — profile, case history, and follow-ups.', exportChildPdf));

    if (studentsList.length === 0) {
        frag.append(el(emptyNote('No students on file for your school yet.', 'bi-people')));
        return frag;
    }

    const currentPick = studentsList.find(s => String(s.id) === String(state.student));
    const currentPickName = currentPick ? `${currentPick.first_name || ''} ${currentPick.last_name || ''}`.trim() : '';

    const picker = el(`<div class="table-container" style="max-width:460px; padding:20px 22px; margin-bottom:24px; overflow:visible; position:relative; z-index:5;">
        <label for="rdStudentSearch" style="display:block; font-weight:600; font-size:13.5px; margin-bottom:8px;">Select a student</label>
        <div style="position:relative; display:flex; align-items:center;">
            <i class="bi bi-search" style="position:absolute; left:14px; color:var(--text-light); font-size:14px; pointer-events:none;"></i>
            <input type="text" id="rdStudentSearch" placeholder="Search by student name…" autocomplete="off"
                style="width:100%; padding:11px 62px 11px 38px; background:var(--light-gray); border:1px solid transparent; border-radius:10px; font-size:14px;"
                value="${esc(currentPickName)}">
            <button type="button" id="rdSearchClear" title="Clear selection"
                style="position:absolute; right:34px; display:${currentPickName ? 'inline-flex' : 'none'}; align-items:center; border:none; background:none; color:var(--text-light); cursor:pointer; padding:4px;">
                <i class="bi bi-x-lg"></i>
            </button>
            <i class="bi bi-chevron-down" style="position:absolute; right:14px; color:var(--text-light); font-size:12px; pointer-events:none;"></i>
        </div>
        <div class="person-search-status" id="rdSearchStatus"></div>
        <div class="person-suggestion-box">
            <div class="person-suggestion-list" id="rdSuggestionList"></div>
        </div>
    </div>`);

    const searchInput = $('#rdStudentSearch', picker);
    const suggestionList = $('#rdSuggestionList', picker);
    const statusEl = $('#rdSearchStatus', picker);
    const clearBtn = $('#rdSearchClear', picker);

    function renderSuggestions(term) {
        const q = term.trim().toLowerCase();
        if (!q) { suggestionList.innerHTML = ''; statusEl.textContent = ''; return; }

        const matches = studentsList.filter(s => `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase().includes(q)).slice(0, 8);

        if (matches.length === 0) {
            suggestionList.innerHTML = '';
            statusEl.textContent = 'No matching student found.';
            return;
        }
        statusEl.textContent = `${matches.length} match${matches.length > 1 ? 'es' : ''}`;
        suggestionList.innerHTML = matches.map(s => `<div class="suggestion-item" data-id="${esc(s.id)}">
            <div class="suggestion-item-name">${esc(`${s.first_name || ''} ${s.last_name || ''}`.trim())}</div>
            <div class="suggestion-item-grade">${esc(s.grade_name || 'N/A')}</div>
        </div>`).join('');
    }

    searchInput.addEventListener('input', () => {
        renderSuggestions(searchInput.value);
        clearBtn.style.display = searchInput.value.trim() ? 'inline-flex' : 'none';
    });
    searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) renderSuggestions(searchInput.value); });
    // mousedown (not click) so it fires before the input's blur clears the list.
    suggestionList.addEventListener('mousedown', e => {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        e.preventDefault();
        state.student = item.getAttribute('data-id');
        render();
    });
    searchInput.addEventListener('blur', () => {
        setTimeout(() => { suggestionList.innerHTML = ''; statusEl.textContent = ''; }, 200);
    });
    // mousedown (not click) so it fires before the input's blur.
    clearBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        state.student = null;
        render();
    });

    frag.append(picker);

    if (!state.student) {
        frag.append(el(emptyNote('Select a student above to view their full record.', 'bi-person-lines-fill')));
        return frag;
    }

    const cached = studentDetailCache[state.student];
    if (!cached) {
        frag.append(el(emptyNote('Loading student record…', 'bi-arrow-repeat')));
        loadStudentDetail(state.student).then(() => render());
        return frag;
    }

    const s = cached.student;
    const cases = cached.data.counseling || [];
    const studentReferrals = cached.data.referrals || [];
    const followUps = cached.data.follow_ups || [];

    const initials = (s.name || '').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'S';
    const isActive = s.is_active !== 0;
    const statusPill = `<span class="pill" style="margin-left:auto; background:${isActive ? 'var(--ok-bg)' : 'var(--danger-bg)'}; color:${isActive ? 'var(--ok)' : 'var(--danger)'};">
        <span style="margin-right:6px;">&#9679;</span>${isActive ? 'Active learner' : 'Inactive'}
    </span>`;
    frag.append(el(`<div class="table-container" style="margin-top:16px; margin-bottom:24px; padding:22px 24px; display:flex; align-items:center; gap:18px; flex-wrap:wrap;">
        <div class="stat-icon" style="width:56px; height:56px; font-size:17px; font-weight:700;">${esc(initials)}</div>
        <div>
            <h3 style="margin:0 0 4px; color:var(--primary-color); font-size:19px;">${esc(s.name)}</h3>
            <p class="text-muted" style="margin:0; font-size:13.5px;">LRN: ${esc(s.lrn || 'N/A')} &middot; ${esc(gradeLabel(s.grade))} &middot; ${esc(s.section || 'N/A')}</p>
        </div>
        ${statusPill}
    </div>`));

    frag.append(el(statCards([
        { num: cases.length, lbl: 'Counseling Sessions', icon: 'bi-chat-square-text', color: 'info' },
        { num: studentReferrals.length, lbl: 'Referrals', icon: 'bi-clipboard-data', color: 'amber' },
        { num: followUps.length, lbl: 'Follow-ups', icon: 'bi-calendar-check', color: 'green' },
    ])));

    const hasCases = cases.length > 0;
    frag.append(el(`<div class="an-pair" style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px;">${hasCases
        ? `${chartTile('chCaseStatus', 'Case Status')}${chartTile('chCaseCategory', 'Cases by Category')}`
        : `${chartTileEmpty('Case Status', 'No counseling case data yet.', false, 'bi-pie-chart')}${chartTileEmpty('Cases by Category', 'No counseling case data yet.', false, 'bi-bar-chart')}`
    }</div>`));

    const followUpsByCase = {};
    followUps.forEach(f => { (followUpsByCase[f.case_uid] = followUpsByCase[f.case_uid] || []).push(f); });

    const caseRows = cases.map(c => {
        const cidStyle = 'font-family:monospace; color:var(--secondary-color); font-weight:600;';
        const fus = (followUpsByCase[c.case_uid] || []).map(f => `<tr><td></td><td><span style="${cidStyle}">${esc(f.follow_up_id)}</span></td><td>${esc(f.follow_up_date || 'N/A')}</td><td colspan="2">${esc(f.note || '')}</td></tr>`).join('');
        return `<tr><td><span style="${cidStyle}">${esc(c.case_uid)}</span></td><td>${esc(c.case_date || 'N/A')}</td><td>${esc(c.category_name || c.case_title || 'N/A')}</td><td>${esc(c.counselor_name || 'N/A')}</td><td>${badge(c.status)}</td></tr>${fus}`;
    }).join('');

    const caseHistoryHtml = `<h3 class="text-primary">Case History &amp; Follow-ups</h3><div class="table-container"><table><thead><tr><th>Case / Follow-up ID</th><th>Opened / Date</th><th>Category / Note</th><th>Counselor</th><th>Status</th></tr></thead><tbody>${caseRows || '<tr><td colspan="5" class="text-center text-muted" style="padding:30px;">No counseling cases on record.</td></tr>'}</tbody></table></div>`;

    const refRows = studentReferrals.map(r => `<tr><td>${esc(r.referral_code || r.id)}</td><td>${esc(r.date_submitted)}</td><td>${esc(r.referral_reason)}</td><td>${badge(r.status)}</td></tr>`).join('');
    const referralHistoryHtml = `<h3 class="text-primary">Referral History</h3><div class="table-container"><table><thead><tr><th>Referral ID</th><th>Submitted</th><th>Reason</th><th>Status</th></tr></thead><tbody>${refRows || '<tr><td colspan="4" class="text-center text-muted" style="padding:30px;">No referrals on record.</td></tr>'}</tbody></table></div>`;

    frag.append(el(`<div class="mb-4 an-pair" style="display:grid; grid-template-columns:1fr 1fr; gap:24px; align-items:start;">
        <div>${caseHistoryHtml}</div>
        <div style="border-left:1px solid var(--border-color); padding-left:24px;">${referralHistoryHtml}</div>
    </div>`));

    if (hasCases) {
        queueMicrotask(() => {
            const cs = countBy(cases, c => c.status); const csl = Object.keys(cs);
            mkChart($('#chCaseStatus'), { type: 'doughnut', data: { labels: csl, datasets: [{ data: csl.map(k => cs[k]), backgroundColor: csl.map(k => STATUS_CHART_COLOR[k] || CHART_COLORS.navy), borderColor: '#fff', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '58%', ...legendRight } });
            const cb = countBy(cases, c => c.category_name || c.case_title || 'Uncategorized'); const cbl = Object.keys(cb);
            mkChart($('#chCaseCategory'), { type: 'bar', data: { labels: cbl, datasets: [{ data: cbl.map(k => cb[k]), backgroundColor: cbl.map((_, i) => CHART_CAT[i % CHART_CAT.length]), borderRadius: 5, maxBarThickness: 46 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, ...noLegend, scales: { x: { beginAtZero: true, ticks: { precision: 0, stepSize: 1 }, grid: { color: '#eaeef3' } }, y: { grid: { display: false } } } } });
        });
    }

    return frag;
}

async function loadStudentDetail(studentId) {
    try {
        const gradeScope = typeof getCurrentGradeScope === 'function' ? getCurrentGradeScope() : '';
        const res = await fetch(`../../api/student-history?student_id=${encodeURIComponent(studentId)}&grade_scope=${encodeURIComponent(gradeScope)}`).then(r => r.json());
        if (res.success) {
            studentDetailCache[studentId] = res;
        } else {
            showAlert(res.message || 'Could not load student record', 'error');
        }
    } catch (e) {
        showAlert('Could not load student record: ' + e.message, 'error');
    }
}

function exportChildPdf() {
    const cached = state.student ? studentDetailCache[state.student] : null;
    if (!cached) { showAlert('Select a student first.', 'error'); return; }
    const s = cached.student;
    const cases = cached.data.counseling || [];
    const studentReferrals = cached.data.referrals || [];
    const followUps = cached.data.follow_ups || [];

    const doc = newPdf();
    let y = pdfHeader(doc, 'Child Summary Case');

    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30, 40, 60);
    doc.text(`Name: ${s.name || 'N/A'}`, 40, y); y += 16;
    doc.text(`LRN: ${s.lrn || 'N/A'}`, 40, y); y += 16;
    doc.text(`Grade & Section: ${gradeLabel(s.grade)} · ${s.section || 'N/A'}`, 40, y); y += 16;
    doc.text(`Sessions: ${cases.length}   Referrals: ${studentReferrals.length}   Follow-ups: ${followUps.length}`, 40, y); y += 20;

    if (cases.length > 0) {
        const pageW = doc.internal.pageSize.getWidth();
        const half = (pageW - 80 - 16) / 2;
        const imgStatus = chartImage('chCaseStatus');
        const imgCategory = chartImage('chCaseCategory');
        if (imgStatus || imgCategory) {
            y = analyticsEnsureSpace(doc, y, 150);
            if (imgStatus) doc.addImage(imgStatus, 'PNG', 40, y, half, 150);
            if (imgCategory) doc.addImage(imgCategory, 'PNG', 40 + half + 16, y, half, 150);
            y += 166;
        }
    }

    // Each section heading below needs enough room for itself plus at least
    // one table row (a heading with no rows under it on the same page reads
    // as a mistake) — autoTable then paginates the rows on its own from there.
    y = analyticsEnsureSpace(doc, y, 46);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(18, 58, 107);
    doc.text('Case History', 40, y);
    y += 6;
    doc.autoTable({
        startY: y,
        head: [['Case ID', 'Date', 'Category', 'Counselor', 'Status']],
        body: cases.length
            ? cases.map(c => [c.case_uid, c.case_date || 'N/A', c.category_name || c.case_title || 'N/A', c.counselor_name || 'N/A', c.status])
            : [['No counseling cases on record.', '', '', '', '']],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [18, 58, 107] },
        margin: analyticsAutoTableMargin(doc),
    });
    y = doc.lastAutoTable.finalY + 20;

    // Shown on screen nested under each case (shInit()'s followUpsByCase) —
    // here as its own table instead, since autoTable has no built-in
    // grouped/nested-row support.
    if (followUps.length > 0) {
        y = analyticsEnsureSpace(doc, y, 46);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(18, 58, 107);
        doc.text('Follow-Up Log', 40, y);
        y += 6;
        doc.autoTable({
            startY: y,
            head: [['Case ID', 'Follow-up ID', 'Date', 'Note']],
            body: followUps.map(f => [f.case_uid, f.follow_up_id, f.follow_up_date || 'N/A', f.note || '']),
            styles: { fontSize: 9 },
            headStyles: { fillColor: [18, 58, 107] },
            margin: analyticsAutoTableMargin(doc),
        });
        y = doc.lastAutoTable.finalY + 20;
    }

    y = analyticsEnsureSpace(doc, y, 46);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(18, 58, 107);
    doc.text('Referral History', 40, y);
    y += 6;
    doc.autoTable({
        startY: y,
        head: [['Referral ID', 'Submitted', 'Reason', 'Status']],
        body: studentReferrals.length
            ? studentReferrals.map(r => [r.referral_code || r.id, r.date_submitted, r.referral_reason, r.status])
            : [['No referrals on record.', '', '', '']],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [18, 58, 107] },
        margin: analyticsAutoTableMargin(doc),
    });

    showPdfPreview(doc, `gms_child_summary_${s.student_id}.pdf`);
}

/* ---- dispatcher + render ---- */
function renderReport() {
    switch (state.report) {
        case 'counseling': return renderAppointments('counseling');
        case 'online': return renderAppointments('online');
        case 'referrals': return renderReferrals();
        case 'child': return renderChild();
    }
}

function render() {
    charts.forEach(c => c.destroy()); charts = [];
    const tabs = $('#reportTabs');
    tabs.innerHTML = '';
    REPORTS.forEach(r => {
        const btn = el(`<button type="button" class="tab-button ${r.key === state.report ? 'active' : ''}" title="${esc(r.desc)}">${esc(r.name)}</button>`);
        btn.addEventListener('click', () => { state.report = r.key; render(); });
        tabs.append(btn);
    });
    const panel = $('#reportPanel');
    panel.innerHTML = '';
    panel.append(renderReport());

    // Only replay the fade-in when the active report tab actually changed —
    // not on every render() (e.g. picking a student within Child Summary
    // Case also re-renders the same tab, and shouldn't re-flash it).
    if (state.report !== lastAnimatedReport) {
        lastAnimatedReport = state.report;
        panel.classList.remove('report-panel-anim');
        void panel.offsetWidth;
        panel.classList.add('report-panel-anim');
    }
}

async function init() {
    initPage();
    await refreshGradeScope();
    const school = getUserSchool();
    if (!school) {
        $('#reportPanel').innerHTML = emptyNote('No school on file for this account — cannot load reports.', 'bi-building');
        return;
    }

    try {
        // loadReportLetterhead is awaited alongside the rest so Export PDF
        // never races it — see report-letterhead.js.
        const gradeScope = typeof getCurrentGradeScope === 'function' ? getCurrentGradeScope() : '';
        const [apptRes, refRes, studentsRes, levelRes] = await Promise.all([
            fetch(`../../api/appointment-request?school=${encodeURIComponent(school)}&grade_scope=${encodeURIComponent(gradeScope)}`).then(r => r.json()),
            fetch(`../../api/referral?role=${encodeURIComponent(getReferralApiRole())}&school=${encodeURIComponent(school)}&grade_scope=${encodeURIComponent(gradeScope)}`).then(r => r.json()),
            fetch(`../../api/get-students?school=${encodeURIComponent(school)}&grade_scope=${encodeURIComponent(gradeScope)}`).then(r => r.json()),
            fetch(`../../api/school-config?action=getGrades&school=${encodeURIComponent(school)}`).then(r => r.json()).catch(() => null),
            loadReportLetterhead(school),
        ]);
        appointments = apptRes.success ? (apptRes.data || []) : [];
        referrals = refRes.success ? (refRes.data || []) : [];
        studentsList = studentsRes.success ? (studentsRes.data || []) : [];
        if (levelRes && levelRes.success) isElementarySchool = !!levelRes.isElementary;
    } catch (e) {
        showAlert('Could not load report data: ' + e.message, 'error');
    }

    render();
}

document.addEventListener('DOMContentLoaded', init);
