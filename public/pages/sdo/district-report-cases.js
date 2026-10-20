// District Report Cases — real case-category x grade counts per district,
// sourced from api/case-report (same real data source as the
// coordinator's Report Cases page). Districts are whatever the SDO has
// assigned to each school in School Management (Edit mode) — until that's done, every school
// falls into a single real "Unassigned" bucket instead of fake per-district
// numbers.

// Mutable: reassigned to [1..6] whenever the selected district/school
// resolves to elementary schools only (school_level East/West/South) — see
// api/case-report's schools_are_elementary(). Defaults to the usual
// secondary range until the first fetch comes back.
let ALL_REPORT_GRADES = [7, 8, 9, 10, 11, 12];

// Sentinel for the "All Districts" selection — every active school, with no
// need to pick a district or school individually. Kept distinct from any
// real district name (sent to the API as district=all).
const ALL_DISTRICTS = '__ALL_DISTRICTS__';
function districtLabel(district) {
    return district === ALL_DISTRICTS ? 'All Districts' : district;
}
function districtParam(district) {
    return district === ALL_DISTRICTS ? 'all' : district;
}

let districtList = ['Unassigned'];
let currentDistrict = ALL_DISTRICTS;

// "All Districts" is pinned and always shown regardless of search/page; the
// rest of districtList is filtered by districtSearchQuery and paginated at
// DISTRICT_PAGE_SIZE per page once the filtered result grows past it.
const DISTRICT_PAGE_SIZE = 16;
let districtSearchQuery = '';
let districtPage = 1;
let sections = [];
let counts = {};
let displayRows = [];
let schoolBreakdown = [];
let currentPeriod = 'all';
let customStart = '';
let customEnd = '';

// Bumped on every district/period/range change so a slower, now-stale
// fetch (e.g. clicking two districts in quick succession) can detect it's
// no longer current and skip overwriting sections/counts/schoolBreakdown
// with the wrong district's data after a newer selection already rendered.
let reportRequestId = 0;

const PERIOD_LABELS = { all: 'All Time', weekly: 'Weekly', monthly: 'Monthly', annually: 'Annually', custom: 'Custom Range' };

async function loadDistrictList() {
    try {
        const response = await fetch('../../api/case-report?action=districts');
        const data = await response.json();
        const real = (data.success && Array.isArray(data.districts)) ? data.districts : [];
        districtList = data.success && data.hasUnassigned ? [...real, 'Unassigned'] : real;
    } catch (error) {
        console.error('Error loading district list:', error);
        districtList = [];
    }
    // Default to "All Districts" — every school is visible without having
    // to pick a district first.
    currentDistrict = ALL_DISTRICTS;
}

// Wires the search input once (its own element persists across re-renders;
// only the button grid and pagination controls get rebuilt).
function initDistrictSearch() {
    const input = document.getElementById('districtSearchInput');
    if (!input) return;

    input.addEventListener('input', () => {
        districtSearchQuery = input.value.trim().toLowerCase();
        districtPage = 1;
        renderDistrictButtons();
    });
}

function renderDistrictButtons() {
    const container = document.getElementById('districtButtons');
    if (!container) return;

    if (districtList.length === 0) {
        container.innerHTML = `
            <p class="text-muted" style="margin: 0;">
                No active schools found.
            </p>
        `;
        renderDistrictPagination(1);
        return;
    }

    const filtered = districtSearchQuery
        ? districtList.filter(d => districtLabel(d).toLowerCase().includes(districtSearchQuery))
        : districtList;

    const totalPages = Math.max(1, Math.ceil(filtered.length / DISTRICT_PAGE_SIZE));
    if (districtPage > totalPages) districtPage = totalPages;
    if (districtPage < 1) districtPage = 1;

    const startIndex = (districtPage - 1) * DISTRICT_PAGE_SIZE;
    const pageItems = filtered.slice(startIndex, startIndex + DISTRICT_PAGE_SIZE);

    if (pageItems.length === 0) {
        container.innerHTML = `
            <p class="text-muted" style="margin: 0;">
                No schools match "${escapeHtml(districtSearchQuery)}".
            </p>
        `;
    } else {
        // "All Districts" is pinned first — always visible, never filtered
        // or paginated away, so there's always a quick way back to it.
        const buttons = [ALL_DISTRICTS, ...pageItems];

        container.innerHTML = buttons.map((district, i) => `
            <button class="district-btn ${district === currentDistrict ? 'active' : ''}" style="--i:${i}" data-district="${escapeHtml(district)}">${escapeHtml(districtLabel(district))}</button>
        `).join('');

        container.querySelectorAll('.district-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                container.querySelectorAll('.district-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentDistrict = this.getAttribute('data-district');
                await refreshReports();
            });
        });
    }

    renderDistrictPagination(totalPages);
}

// Prev/Next controls, only shown once the filtered school list actually
// spans more than one page (16 schools) — a short list never shows this.
function renderDistrictPagination(totalPages) {
    const paginationEl = document.getElementById('districtPagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
        paginationEl.hidden = true;
        paginationEl.innerHTML = '';
        return;
    }

    paginationEl.hidden = false;
    paginationEl.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" id="districtPrevPage" ${districtPage <= 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> Prev</button>
        <span class="district-pagination-label">Page ${districtPage} of ${totalPages}</span>
        <button type="button" class="btn btn-secondary btn-sm" id="districtNextPage" ${districtPage >= totalPages ? 'disabled' : ''}>Next <i class="bi bi-chevron-right"></i></button>
    `;

    document.getElementById('districtPrevPage')?.addEventListener('click', () => {
        if (districtPage > 1) {
            districtPage--;
            renderDistrictButtons();
        }
    });
    document.getElementById('districtNextPage')?.addEventListener('click', () => {
        districtPage++;
        renderDistrictButtons();
    });
}

// Re-fetches both reports for whatever district/period/range is currently
// selected and re-renders them. Bumps reportRequestId first so that if the
// user changes the selection again before this fetch finishes, this older
// request's response gets dropped instead of overwriting the newer one's
// (and thus correct) data — see loadReportData()/loadSchoolBreakdown().
async function refreshReports() {
    reportRequestId++;
    await Promise.all([loadReportData(), loadSchoolBreakdown()]);
    renderCasesTable();
    renderSchoolBreakdown();
}

async function loadReportData() {
    const requestId = reportRequestId;
    try {
        const params = new URLSearchParams({ action: 'categories', district: districtParam(currentDistrict), period: currentPeriod });
        if (currentPeriod === 'custom' && customStart && customEnd) {
            params.set('start', customStart);
            params.set('end', customEnd);
        }
        const url = `../../api/case-report?${params.toString()}`;
        const response = await fetch(url);
        const data = await response.json();
        if (requestId !== reportRequestId) return; // superseded by a newer selection

        if (!data.success) {
            throw new Error(data.message || 'Failed to load district case report');
        }

        sections = data.sections || [];
        counts = data.counts || {};
        if (Array.isArray(data.grades) && data.grades.length) {
            ALL_REPORT_GRADES = data.grades;
        }
    } catch (error) {
        if (requestId !== reportRequestId) return;
        console.error('Error loading district case report:', error);
        sections = [];
        counts = {};
    }
}

// One row per school (name, total cases, Male/Female split) — only
// fetched for "All Districts"; a single district's category/grade table
// below already covers that one district on its own.
async function loadSchoolBreakdown() {
    if (currentDistrict !== ALL_DISTRICTS) {
        schoolBreakdown = [];
        return;
    }
    const requestId = reportRequestId;
    try {
        const params = new URLSearchParams({ action: 'school_breakdown', district: districtParam(currentDistrict), period: currentPeriod });
        if (currentPeriod === 'custom' && customStart && customEnd) {
            params.set('start', customStart);
            params.set('end', customEnd);
        }
        const url = `../../api/case-report?${params.toString()}`;
        const response = await fetch(url);
        const data = await response.json();
        if (requestId !== reportRequestId) return; // superseded by a newer selection

        if (!data.success) {
            throw new Error(data.message || 'Failed to load per-school case report');
        }

        schoolBreakdown = data.schools || [];
    } catch (error) {
        if (requestId !== reportRequestId) return;
        console.error('Error loading per-school case report:', error);
        schoolBreakdown = [];
    }
}

// Param-driven counterparts of loadReportData/loadSchoolBreakdown above —
// fetch and return data without touching the on-screen globals (sections/
// counts/schoolBreakdown) or re-rendering anything. Used by the export
// panel so generating a report for an arbitrary month/year never changes
// what's currently shown on the page behind the modal.
async function fetchCategoryReport(district, period, start, end) {
    try {
        const params = new URLSearchParams({ action: 'categories', district: districtParam(district), period });
        if (period === 'custom' && start && end) {
            params.set('start', start);
            params.set('end', end);
        }
        const response = await fetch(`../../api/case-report?${params.toString()}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Failed to load district case report');
        return {
            sections: data.sections || [],
            counts: data.counts || {},
            grades: (Array.isArray(data.grades) && data.grades.length) ? data.grades : ALL_REPORT_GRADES
        };
    } catch (error) {
        console.error('Error loading district case report:', error);
        return { sections: [], counts: {}, grades: ALL_REPORT_GRADES };
    }
}

async function fetchSchoolBreakdownData(district, period, start, end, level = 'all', section = 'all', category = 'all') {
    try {
        const params = new URLSearchParams({ action: 'school_breakdown', district: districtParam(district), period });
        if (level && level !== 'all') params.set('level', level);
        if (section && section !== 'all') params.set('section', section);
        if (category && category !== 'all') params.set('category', category);
        if (period === 'custom' && start && end) {
            params.set('start', start);
            params.set('end', end);
        }
        const response = await fetch(`../../api/case-report?${params.toString()}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Failed to load per-school case report');
        return data.schools || [];
    } catch (error) {
        console.error('Error loading per-school case report:', error);
        return [];
    }
}

// Backs the Division Monthly Monitoring Report export — always every
// school_level group at once (Secondary/East/West/South), never scoped to
// whatever district button is currently selected on screen.
async function fetchPersonalSocialConcerns(period, start, end) {
    try {
        const params = new URLSearchParams({ action: 'personal_social_concerns', period });
        if (period === 'custom' && start && end) {
            params.set('start', start);
            params.set('end', end);
        }
        const response = await fetch(`../../api/case-report?${params.toString()}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Failed to load personal-social concerns report');
        return { districts: data.districts || [], sections: data.sections || [], counts: data.counts || {} };
    } catch (error) {
        console.error('Error loading personal-social concerns report:', error);
        return { districts: [], sections: [], counts: {} };
    }
}

function renderSchoolBreakdown() {
    const section = document.getElementById('schoolBreakdownSection');
    if (section) section.hidden = currentDistrict !== ALL_DISTRICTS;

    const tbody = document.getElementById('schoolBreakdownBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (currentDistrict !== ALL_DISTRICTS) return;

    if (schoolBreakdown.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 24px;">No schools found.</td></tr>`;
        return;
    }

    const totals = schoolBreakdown.reduce((acc, s) => {
        acc.total += s.total; acc.male += s.male; acc.female += s.female;
        return acc;
    }, { total: 0, male: 0, female: 0 });

    tbody.innerHTML = schoolBreakdown.map((s, i) => `
        <tr style="--i:${i}">
            <td><strong>${escapeHtml(s.school)}</strong></td>
            <td class="text-center">${s.total > 0 ? `<span class="badge badge-in-progress">${s.total}</span>` : '0'}</td>
            <td class="text-center">${s.male}</td>
            <td class="text-center">${s.female}</td>
        </tr>
    `).join('') + `
        <tr style="font-weight: 700; background: #f1f5f9;">
            <td>Overall Total</td>
            <td class="text-center"><strong style="color: #3b82f6; font-size: 16px;">${totals.total}</strong></td>
            <td class="text-center">${totals.male}</td>
            <td class="text-center">${totals.female}</td>
        </tr>
    `;
}

// countsMap defaults to the on-screen global so every existing call site
// (renderCasesTable etc.) is unaffected; the export panel passes its own
// freshly-fetched counts instead, for whatever period it was asked for,
// without touching what's currently rendered on screen.
function gradeCell(bucketKey, grade, countsMap = counts) {
    const bucket = countsMap[bucketKey];
    return (bucket && bucket[String(grade)]) || { m: 0, f: 0 };
}

// Same flattening as coordinator/report-case.js, keeping the M/F
// split per grade (rowTotals below sums it into m+f wherever a single
// number is all that's needed) — see that file for the full explanation of
// the section/category/uncategorized/subtotal shape.
// gradesList defaults to the on-screen global (every existing call site is
// unaffected); the export panel passes its own freshly-fetched grade range
// instead, so a "Division-Wide" export spanning both elementary (1-6) and
// secondary (7-12) schools shows all 12 columns even when the on-screen
// table (a single-level selection) is only showing 6.
function buildDisplayRows(sectionsList = sections, countsMap = counts, gradesList = ALL_REPORT_GRADES) {
    const rows = [];
    const grandTotal = {};
    gradesList.forEach(g => { grandTotal[g] = { m: 0, f: 0 }; });

    sectionsList.forEach(section => {
        rows.push({ type: 'header', label: `${section.sectionCode}. ${section.sectionName}` });

        const sectionTotal = {};
        gradesList.forEach(g => { sectionTotal[g] = { m: 0, f: 0 }; });

        const addToTotals = (bucketKey) => {
            gradesList.forEach(g => {
                const cell = gradeCell(bucketKey, g, countsMap);
                sectionTotal[g].m += cell.m;
                sectionTotal[g].f += cell.f;
                grandTotal[g].m += cell.m;
                grandTotal[g].f += cell.f;
            });
        };

        section.categories.forEach(cat => {
            rows.push({ type: 'category', label: cat.categoryName, bucketKey: cat.categoryId });
            addToTotals(cat.categoryId);
        });

        // Uncategorized cases (no category chosen yet) still count toward
        // the section/grand totals below — they just don't get their own
        // listed row, since "Uncategorized" isn't a real case category.
        addToTotals(`section-${section.sectionId}-uncategorized`);

        rows.push({ type: 'subtotal', label: `Total ${section.sectionCode}: ${section.sectionName}`, totals: sectionTotal });
    });

    rows.push({ type: 'subtotal', label: 'Overall Total', totals: grandTotal });
    return rows;
}

// Returns { grade: { m, f } } — callers that just need one number per grade
// add m+f themselves (see rowTotal below).
function rowTotals(row, countsMap = counts, gradesList = ALL_REPORT_GRADES) {
    if (row.type === 'subtotal') {
        return row.totals;
    }
    const totals = {};
    gradesList.forEach(g => {
        totals[g] = gradeCell(row.bucketKey, g, countsMap);
    });
    return totals;
}

// Single m+f number for one grade cell, tolerant of a missing grade key.
function rowTotal(totals, grade) {
    const cell = totals[grade];
    return cell ? cell.m + cell.f : 0;
}

// Rebuilds the "Grade N" column headers to match ALL_REPORT_GRADES (1-6 for
// an elementary selection, 7-12 otherwise) — the static markup only covers
// the secondary default, so this keeps the header row in sync with
// whatever range the last fetch resolved to. Two stacked <tr>s: grade name
// (colspan 3) on top, Male/Female/Total underneath each one.
function renderCasesTableHeader() {
    const headerRow = document.getElementById('reportCasesHeaderRow');
    const subHeaderRow = document.getElementById('reportCasesSubHeaderRow');
    if (!headerRow || !subHeaderRow) return;
    headerRow.innerHTML = `<th rowspan="2">Category of Cases</th>${ALL_REPORT_GRADES.map(g => `<th colspan="3">Grade ${g}</th>`).join('')}<th rowspan="2">Overall Total</th>`;
    subHeaderRow.innerHTML = ALL_REPORT_GRADES.map(() => `<th title="Male">M</th><th title="Female">F</th><th title="Total">T</th>`).join('');
}

// Render cases table for the selected district
function renderCasesTable() {
    renderCasesTableHeader();

    const tableBody = document.getElementById('casesTableBody');
    tableBody.innerHTML = '';

    displayRows = buildDisplayRows();
    const colCount = 1 + ALL_REPORT_GRADES.length * 3 + 1;

    displayRows.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.style.setProperty('--i', index);

        if (row.type === 'header') {
            tr.innerHTML = `<td colspan="${colCount}" style="font-weight: 700; background: #e2e8f0;">${row.label}</td>`;
            tableBody.appendChild(tr);
            return;
        }

        if (row.type === 'subtotal') {
            tr.style.fontWeight = '700';
            tr.style.backgroundColor = '#f1f5f9';
        }

        const totals = rowTotals(row);
        let grandTotal = 0;
        const gradeCellsHtml = ALL_REPORT_GRADES.map(g => {
            const cell = totals[g] || { m: 0, f: 0 };
            const t = cell.m + cell.f;
            grandTotal += t;
            return `<td class="text-center">${cell.m}</td><td class="text-center">${cell.f}</td><td class="text-center">${t > 0 ? `<span class="badge badge-in-progress">${t}</span>` : '0'}</td>`;
        }).join('');

        tr.innerHTML = `
            <td><strong>${row.label}</strong></td>
            ${gradeCellsHtml}
            <td class="text-center"><strong style="color: #3b82f6; font-size: 16px;">${grandTotal}</strong></td>
        `;

        if (row.type === 'category') {
            tr.classList.add('row-clickable');
            tr.addEventListener('click', () => showCaseDetails(index));
        }

        tableBody.appendChild(tr);
    });
}

// Show case details modal
function showCaseDetails(rowIndex) {
    const row = displayRows[rowIndex];
    if (!row) return;

    const totals = rowTotals(row);

    document.getElementById('caseId').value = `DIST-${districtLabel(currentDistrict).toUpperCase().replace(/\s+/g, '-')}-${row.bucketKey || 'ROW'}`;
    document.getElementById('caseCategory').value = row.label;
    document.getElementById('caseGrade').value = `All Grades (${ALL_REPORT_GRADES[0]}-${ALL_REPORT_GRADES[ALL_REPORT_GRADES.length - 1]})`;
    document.getElementById('caseStatus').value = 'Active';
    document.getElementById('caseDate').value = new Date().toLocaleDateString();
    document.getElementById('caseNotes').value = ALL_REPORT_GRADES.map(g => {
        const cell = totals[g] || { m: 0, f: 0 };
        return `Grade ${g}: ${cell.m + cell.f} (M:${cell.m} F:${cell.f})`;
    }).join(' | ');

    document.getElementById('caseModal').classList.add('show');
}

// Set up event listeners
function setupEventListeners() {
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('caseModal').classList.remove('show');
    });

    document.getElementById('closeCaseModal').addEventListener('click', () => {
        document.getElementById('caseModal').classList.remove('show');
    });

    document.getElementById('exportPdfBtn').addEventListener('click', () => handleExportClick('pdf'));
    document.getElementById('exportExcelBtn').addEventListener('click', () => handleExportClick('excel'));
    document.getElementById('closeExportOptionsModal').addEventListener('click', () => closeModal('exportOptionsModal'));
    document.getElementById('cancelExportOptionsBtn').addEventListener('click', () => closeModal('exportOptionsModal'));
    document.getElementById('generateExportBtn').addEventListener('click', handleGenerateExport);
    document.getElementById('exportReportType').addEventListener('change', updateExportPeriodVisibility);
    document.getElementById('exportSectionFilter').addEventListener('change', (e) => populateExportCategoryOptions(e.target.value));
    document.querySelectorAll('#exportCasesPeriodButtons .period-btn').forEach(btn => {
        btn.addEventListener('click', () => setCasesPeriodMode(btn.getAttribute('data-cases-period')));
    });

    setupPeriodFilter();

    document.getElementById('logoutBtn')?.addEventListener('click', requestLogout);
}

// Weekly / Monthly / Annually / Custom range period filter for the cases table
function setupPeriodFilter() {
    // Scoped to #periodButtons specifically, not just .period-btn — other
    // .period-btn groups can exist elsewhere on the page (e.g. modals) and
    // an unscoped selector here would wire this on-screen filter's click
    // handler onto those too.
    const periodButtons = document.querySelectorAll('#periodButtons .period-btn');
    const customRangeGroup = document.getElementById('customRangeGroup');

    periodButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            periodButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.getAttribute('data-period');
            customRangeGroup.hidden = currentPeriod !== 'custom';

            if (currentPeriod === 'custom') {
                if (!customStart || !customEnd) return;
            }

            await refreshReports();
        });
    });

    document.getElementById('applyRangeBtn').addEventListener('click', async () => {
        const start = document.getElementById('rangeStart').value;
        const end = document.getElementById('rangeEnd').value;

        if (!start || !end) {
            showAlert('error', 'Select both a start and end date.');
            return;
        }
        if (start > end) {
            showAlert('error', 'Start date must be before the end date.');
            return;
        }

        customStart = start;
        customEnd = end;
        await refreshReports();
    });
}

// Shared table shape used by both the PDF and Excel exporters. rows/
// countsMap/gradesList default to the on-screen globals; the export panel
// passes its own freshly-fetched rows/counts/grades for an arbitrary period
// (and, for the Division-Wide export, a wider combined grade range) instead.
// Each grade gets its own M(ale)/F(emale)/T(otal) triplet — abbreviated so
// 6 grades' worth of columns fit a landscape page/sheet without wrapping
// every header cell into a tall stack. Same grouped-header shape as
// buildDmmrTable's [No. of Cases, Intervention Provider] columns, just
// 3-wide per grade instead of 2-wide per region, plus a single (non-split)
// Overall Total column on the end. Abbreviating the label doesn't touch the
// underlying m/f counts below — only the header text is shorter.
function buildExportTable(rows = displayRows, countsMap = counts, gradesList = ALL_REPORT_GRADES) {
    const pdfHead = [
        [
            { content: 'Category of Cases', rowSpan: 2, styles: { valign: 'middle' } },
            ...gradesList.map(g => ({ content: `Grade ${g}`, colSpan: 3, styles: { halign: 'center' } })),
            { content: 'Overall Total', rowSpan: 2, styles: { valign: 'middle' } }
        ],
        gradesList.flatMap(() => ['M', 'F', 'T'])
    ];
    const excelRow1 = ['Category of Cases', ...gradesList.flatMap(g => [`Grade ${g}`, '', '']), 'Overall Total'];
    const excelRow2 = ['', ...gradesList.flatMap(() => ['M', 'F', 'T']), ''];

    const body = [];
    const sectionHeaderRows = [];
    const subtotalRows = [];

    rows.forEach(row => {
        if (row.type === 'header') {
            sectionHeaderRows.push(body.length);
            body.push([row.label, ...gradesList.flatMap(() => ['', '', '']), '']);
            return;
        }
        if (row.type === 'subtotal') {
            subtotalRows.push(body.length);
        }
        const totals = rowTotals(row, countsMap, gradesList);
        let grandTotal = 0;
        const gradeCells = gradesList.flatMap(g => {
            const cell = totals[g] || { m: 0, f: 0 };
            const t = cell.m + cell.f;
            grandTotal += t;
            return [cell.m, cell.f, t];
        });
        body.push([row.label, ...gradeCells, grandTotal]);
    });

    return { pdfHead, excelRow1, excelRow2, body, sectionHeaderRows, subtotalRows, gradesList };
}

/* ---- Export preview modals — same "view before you download" flow as
   the analytics.js report exports. ---- */
let pdfPreviewUrl = null;

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
    document.getElementById('pdfPreviewCloseX').addEventListener('click', closePdfPreview);
    document.getElementById('pdfPreviewCloseBtn').addEventListener('click', closePdfPreview);
}

function closePdfPreview() {
    closeModal('pdfPreviewModal');
    document.getElementById('pdfPreviewFrame').src = 'about:blank';
    if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); pdfPreviewUrl = null; }
}

function showPdfPreview(doc, filename) {
    ensurePdfModal();
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    pdfPreviewUrl = doc.output('bloburl');
    document.getElementById('pdfPreviewFrame').src = pdfPreviewUrl;
    document.getElementById('pdfDownloadBtn').onclick = () => doc.save(filename);
    document.getElementById('pdfPrintBtn').onclick = () => {
        const frame = document.getElementById('pdfPreviewFrame');
        frame.contentWindow.focus();
        frame.contentWindow.print();
    };
    openModal('pdfPreviewModal');
}

function ensureExcelModal() {
    if (document.getElementById('excelPreviewModal')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="excelPreviewModal" class="modal">
        <div class="modal-content" style="max-width:900px; width:95%; height:82vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2><i class="bi bi-file-earmark-excel"></i> <span id="excelPreviewTitle">Excel Preview</span></h2>
                <button type="button" class="modal-close" id="excelPreviewCloseX">&times;</button>
            </div>
            <div class="modal-body" style="flex:1; overflow:auto;">
                <div class="table-container"><table><tbody id="excelPreviewTbody"></tbody></table></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="excelPreviewCloseBtn">Close</button>
                <button type="button" class="btn btn-success" id="excelDownloadBtn"><i class="bi bi-download"></i> Download</button>
            </div>
        </div>
    </div>`);
    document.getElementById('excelPreviewCloseX').addEventListener('click', () => closeModal('excelPreviewModal'));
    document.getElementById('excelPreviewCloseBtn').addEventListener('click', () => closeModal('excelPreviewModal'));
}

// Each sheet's aoa (array-of-arrays) is the exact same shape that gets
// written to its worksheet, so what's previewed is what's downloaded. Row 0
// of an aoa is that sheet's title (shown as a section heading, not a table
// row); a blank row (`[]`) anywhere after that marks the row right after it
// as a column-header row (rendered as <th>) — matches the title / period /
// blank / head / body shape every aoa here is built in. Multiple sheets are
// stacked in one scrollable preview, each under its own heading.
function showExcelPreview(filename, sheets, onDownload) {
    ensureExcelModal();
    document.getElementById('excelPreviewTitle').textContent = sheets.length === 1
        ? String((sheets[0].aoa[0] && sheets[0].aoa[0][0]) || 'Excel Preview')
        : 'Excel Preview';

    document.getElementById('excelPreviewTbody').innerHTML = sheets.map((sheet, sheetIndex) => {
        const title = String((sheet.aoa[0] && sheet.aoa[0][0]) || sheet.name);
        const heading = `<tr><td colspan="20" style="border:none; padding:${sheetIndex === 0 ? '0' : '24px'} 0 8px; font-weight:700; font-size:15px;">${escapeHtml(title)}</td></tr>`;

        let afterBlank = false;
        const body = sheet.aoa.slice(1).map(row => {
            if (row.length === 0) { afterBlank = true; return '<tr><td style="height:10px; border:none; padding:0;"></td></tr>'; }
            const cellTag = afterBlank ? 'th' : 'td';
            afterBlank = false;
            return `<tr>${row.map(cell => `<${cellTag}>${escapeHtml(cell == null ? '' : cell)}</${cellTag}>`).join('')}</tr>`;
        }).join('');

        return heading + body;
    }).join('');

    document.getElementById('excelDownloadBtn').onclick = onDownload;
    openModal('excelPreviewModal');
}

// Cases-by-school aoa shared by the Excel and PDF exporters' first table.
// list defaults to the on-screen global; the export panel passes its own
// freshly-fetched school list for an arbitrary period instead.
function buildSchoolBreakdownExportRows(list = schoolBreakdown) {
    const totals = list.reduce((acc, s) => {
        acc.total += s.total; acc.male += s.male; acc.female += s.female;
        return acc;
    }, { total: 0, male: 0, female: 0 });

    const body = list.map(s => [s.school, s.total, s.male, s.female]);
    return { body, totals };
}

/* ==================================================================
   EXPORT OPTIONS PANEL (All Districts only) — clicking Export PDF/Excel
   opens a modal to pick the report (Cases by School vs. the Division
   Monthly Monitoring Report) and an explicit month+year, independent of
   whatever period is currently shown on screen. Generating always fetches
   fresh data for that period (see fetchCategoryReport/
   fetchSchoolBreakdownData/fetchPersonalSocialConcerns above) rather than
   reusing the on-screen globals, so it never changes what's rendered
   behind the modal. A single school/district instead skips this panel
   entirely — see handleExportClick below.
   ================================================================== */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let pendingExportFormat = 'pdf';
let casesPeriodMode = 'weekly';

function populateExportPeriodSelects() {
    const monthSelect = document.getElementById('exportMonthSelect');
    const yearSelect = document.getElementById('exportYearSelect');
    if (!monthSelect || !yearSelect || monthSelect.options.length) return; // already populated

    monthSelect.innerHTML = MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
    monthSelect.value = String(new Date().getMonth() + 1);

    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear; y >= currentYear - 4; y--) years.push(y);
    yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSelect.value = String(currentYear);
}

function setCasesPeriodMode(mode) {
    casesPeriodMode = mode;
    document.querySelectorAll('#exportCasesPeriodButtons .period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-cases-period') === mode);
    });
    const rangeGroup = document.getElementById('exportCasesRangeGroup');
    if (rangeGroup) rangeGroup.hidden = mode !== 'custom';
}

// "Cases by School" and "Division-Wide Summary Case" both use Weekly/
// Monthly/Annually keywords (same "current week/month/year" meaning as the
// on-screen filter — no specific date to pick). The Division Monthly
// Monitoring Report instead needs one specific month+year, since that's
// what the official form is dated by. Only one of the two period controls
// is relevant at a time, so show whichever matches the selected report.
function updateExportPeriodVisibility() {
    const reportType = document.getElementById('exportReportType').value;
    const casesGroup = document.getElementById('exportCasesPeriodGroup');
    const dmmrGroup = document.getElementById('exportDmmrPeriodGroup');
    const levelGroup = document.getElementById('exportSchoolLevelGroup');
    const sectionGroup = document.getElementById('exportSectionFilterGroup');
    const categoryGroup = document.getElementById('exportCategoryFilterGroup');
    if (casesGroup) casesGroup.style.display = reportType === 'dmmr' ? 'none' : '';
    if (dmmrGroup) dmmrGroup.style.display = reportType === 'dmmr' ? '' : 'none';
    // School Level/Section/Case Category only narrow "Cases by School" —
    // Division-Wide Summary and DMMR always cover every school_level group
    // and every section/category at once.
    const isCasesBySchool = reportType === 'cases_by_school';
    if (levelGroup) levelGroup.style.display = isCasesBySchool ? '' : 'none';
    if (sectionGroup) sectionGroup.style.display = isCasesBySchool ? '' : 'none';
    if (categoryGroup) categoryGroup.style.display = isCasesBySchool ? '' : 'none';
}

// Section select options come straight from the on-screen global `sections`
// (already fetched by loadReportData() — same 6-section/27-category
// taxonomy fetch_sections() returns on the PHP side, independent of
// district/school level), so no extra request is needed just to fill this
// dropdown.
function populateExportSectionOptions() {
    const select = document.getElementById('exportSectionFilter');
    if (!select) return;
    const previous = select.value || 'all';
    select.innerHTML = `<option value="all">All Sections</option>` +
        sections.map(s => `<option value="${s.sectionId}">${escapeHtml(s.sectionCode)}. ${escapeHtml(s.sectionName)}</option>`).join('');
    select.value = sections.some(s => s.sectionId === previous) ? previous : 'all';
    populateExportCategoryOptions(select.value);
}

// Case Category cascades off the currently selected Section — with "All
// Sections" picked there's no single category list to narrow by, so the
// select is disabled and pinned to "All Categories" until one real section
// is chosen.
function populateExportCategoryOptions(sectionId) {
    const select = document.getElementById('exportCategoryFilter');
    if (!select) return;
    const section = sections.find(s => s.sectionId === sectionId);
    if (!section) {
        select.innerHTML = `<option value="all">All Categories</option>`;
        select.value = 'all';
        select.disabled = true;
        return;
    }
    select.disabled = false;
    select.innerHTML = `<option value="all">All Categories</option>` +
        section.categories.map(c => `<option value="${c.categoryId}">${escapeHtml(c.categoryName)}</option>`).join('');
    select.value = 'all';
}

// The Report/Period panel only makes sense for "All Districts" — that's
// the only place "Cases by School" and the Division Monthly Monitoring
// Report are meaningful choices. With one specific school/district
// selected there's only one applicable export (the Category of Cases table
// already on screen), so skip the panel and preview it straight away using
// whatever period is currently shown on screen — no extra picking required.
function handleExportClick(format) {
    if (currentDistrict !== ALL_DISTRICTS) {
        if (format === 'pdf') generateCategoryOfCasesPdf();
        else generateCategoryOfCasesExcel();
        return;
    }
    openExportOptionsModal(format);
}

function openExportOptionsModal(format) {
    pendingExportFormat = format;
    populateExportPeriodSelects();
    populateExportSectionOptions();
    updateExportPeriodVisibility();
    openModal('exportOptionsModal');
}

// Category of Cases export for one selected school/district — same content
// as the on-screen table (buildExportTable()/PERIOD_LABELS[currentPeriod]
// with no args default to the live globals), previewed before download.
function generateCategoryOfCasesPdf() {
    if (typeof window.jspdf === 'undefined') {
        showAlert('error', 'PDF export library failed to load.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const districtTitle = districtLabel(currentDistrict);
    const { pdfHead, body, sectionHeaderRows } = buildExportTable();

    const contentTop = sdoDrawReportTitle(
        doc,
        `Learners Personal-Social Concern - ${districtTitle}`,
        `Period: ${PERIOD_LABELS[currentPeriod]}  |  Generated: ${new Date().toLocaleDateString()}`
    );

    doc.autoTable({
        head: pdfHead,
        body,
        startY: contentTop,
        margin: { top: sdoPdfContentTop(doc), bottom: sdoPdfFooterReserve(doc) },
        theme: 'grid',
        headStyles: { fillColor: [29, 90, 168], textColor: 255, fontStyle: 'bold', valign: 'middle', halign: 'center' },
        styles: { fontSize: 9, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 55, halign: 'left' } },
        didParseCell: (data) => {
            if (data.section === 'body' && sectionHeaderRows.includes(data.row.index)) {
                data.cell.styles.fillColor = [226, 232, 240];
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    drawSdoPdfLetterhead(doc);

    const filename = `${districtTitle.replace(/\s+/g, '-')}_${PERIOD_LABELS[currentPeriod].replace(/\s+/g, '-')}_CategoryOfCases_${new Date().toISOString().split('T')[0]}.pdf`;
    showPdfPreview(doc, filename);
}

// Real cell colors/borders/wrap-text need actual style-writing on the
// downloaded .xlsx — see buildDmmrWorkbook's comment for why that's
// ExcelJS and not the SheetJS build also loaded on this page. Header is two
// stacked rows, same grouped shape as buildDmmrWorkbook: Grade N merged
// across its Male/Female/Total triplet, Category of Cases and Overall Total
// each merged down both header rows.
function buildCategoryOfCasesWorkbook(body, sectionHeaderRows, subtotalRows, title, periodLabel, gradesList) {
    const totalCols = 1 + gradesList.length * 3 + 1;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report Cases');

    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells(2, 1, 2, totalCols);
    const periodCell = sheet.getCell(2, 1);
    periodCell.value = `Period: ${periodLabel}`;
    periodCell.font = { size: 10, color: { argb: 'FF666666' } };
    periodCell.alignment = { horizontal: 'center' };

    const headRow1 = 4;
    const headRow2 = 5;

    sheet.mergeCells(headRow1, 1, headRow2, 1);
    sheet.getCell(headRow1, 1).value = 'Category of Cases';

    sheet.mergeCells(headRow1, totalCols, headRow2, totalCols);
    sheet.getCell(headRow1, totalCols).value = 'Overall Total';

    let col = 2;
    gradesList.forEach(g => {
        sheet.mergeCells(headRow1, col, headRow1, col + 2);
        sheet.getCell(headRow1, col).value = `Grade ${g}`;
        sheet.getCell(headRow2, col).value = 'M';
        sheet.getCell(headRow2, col + 1).value = 'F';
        sheet.getCell(headRow2, col + 2).value = 'T';
        col += 3;
    });

    for (let r = headRow1; r <= headRow2; r++) {
        for (let c = 1; c <= totalCols; c++) {
            const cell = sheet.getCell(r, c);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5AA8' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = THIN_BORDER;
        }
    }

    body.forEach((row, i) => {
        const rowIndex = headRow2 + 1 + i;
        const isHeader = sectionHeaderRows.includes(i);
        const isSubtotal = subtotalRows.includes(i);

        if (isHeader) sheet.mergeCells(rowIndex, 1, rowIndex, totalCols);

        row.forEach((value, c) => {
            if (isHeader && c > 0) return; // merged into the label cell above
            const cell = sheet.getCell(rowIndex, c + 1);
            cell.value = value;
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center', wrapText: true };
            if (isHeader) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
                cell.font = { bold: true };
            } else if (isSubtotal) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                cell.font = { bold: true };
            }
        });
    });

    sheet.getColumn(1).width = 34;
    for (let c = 2; c <= totalCols; c++) sheet.getColumn(c).width = 10;

    return workbook;
}

function generateCategoryOfCasesExcel() {
    if (typeof ExcelJS === 'undefined') {
        showAlert('error', 'Excel export library failed to load.');
        return;
    }

    const districtTitle = districtLabel(currentDistrict);
    const periodLabel = PERIOD_LABELS[currentPeriod];
    const title = `Learners Personal-Social Concern - ${districtTitle}`;
    const { excelRow1, excelRow2, body, sectionHeaderRows, subtotalRows, gradesList } = buildExportTable();
    const categoryAoa = [
        [title],
        [`Period: ${periodLabel}`],
        [],
        excelRow1,
        excelRow2,
        ...body
    ];
    const sheets = [
        { name: 'Report Cases', aoa: categoryAoa, colWidths: [{ wch: 34 }, ...gradesList.flatMap(() => [{ wch: 8 }, { wch: 8 }, { wch: 8 }]), { wch: 12 }] }
    ];
    const filename = `${districtTitle.replace(/\s+/g, '-')}_${periodLabel.replace(/\s+/g, '-')}_CategoryOfCases_${new Date().toISOString().split('T')[0]}.xlsx`;

    showExcelPreview(filename, sheets, async () => {
        const workbook = buildCategoryOfCasesWorkbook(body, sectionHeaderRows, subtotalRows, title, periodLabel, gradesList);
        await downloadExcelJSWorkbook(workbook, filename);
        showAlert('success', 'Excel report exported successfully!');
    });
}

// Turns the panel's Month+Year (or just Year) selection into an explicit
// start/end date range for case_date_condition's 'custom' branch, plus a
// human label used in report titles/filenames.
function exportPeriodRange() {
    const year = parseInt(document.getElementById('exportYearSelect').value, 10);
    const month = parseInt(document.getElementById('exportMonthSelect').value, 10);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end, label: `${MONTH_NAMES[month - 1]} ${year}` };
}

async function handleGenerateExport() {
    const reportType = document.getElementById('exportReportType').value;
    const format = pendingExportFormat;

    if (reportType === 'dmmr') {
        closeModal('exportOptionsModal');
        const { start, end, label } = exportPeriodRange();
        if (format === 'pdf') await generateDmmrPdf(start, end, label);
        else await generateDmmrExcel(start, end, label);
        return;
    }

    // Cases by School / Division-Wide Summary Case — Weekly/Monthly/Annually
    // mean "current", same as the on-screen filter, so case_date_condition
    // needs just the keyword. Custom needs an explicit range, validated
    // before the modal closes.
    const period = casesPeriodMode;
    let start = '', end = '', label = PERIOD_LABELS[period];

    if (period === 'custom') {
        start = document.getElementById('exportCasesRangeStart').value;
        end = document.getElementById('exportCasesRangeEnd').value;
        if (!start || !end) {
            showAlert('error', 'Select both a start and end date.');
            return;
        }
        if (start > end) {
            showAlert('error', 'Start date must be before the end date.');
            return;
        }
        label = `${start} to ${end}`;
    }

    closeModal('exportOptionsModal');

    if (reportType === 'division_summary') {
        if (format === 'pdf') await generateDivisionSummaryPdf(period, start, end, label);
        else await generateDivisionSummaryExcel(period, start, end, label);
        return;
    }

    if (format === 'pdf') await generateCasesBySchoolPdf(period, start, end, label);
    else await generateCasesBySchoolExcel(period, start, end, label);
}

// Collapses the grade-by-grade breakdown into one number per category — a
// whole-division rollup combining every grade (1-12: elementary + secondary
// together) and every school into a single total, rather than a 14-column
// pivot that doesn't read as a "summary." Section header/subtotal rows keep
// their place, just narrowed to the same two columns.
function buildDivisionSummaryTable(rows, countsMap, gradesList) {
    const header = ['Category of Cases', 'Total Cases'];
    const body = [];
    const sectionHeaderRows = [];
    const subtotalRows = [];

    rows.forEach(row => {
        if (row.type === 'header') {
            sectionHeaderRows.push(body.length);
            body.push([row.label, '']);
            return;
        }
        if (row.type === 'subtotal') {
            subtotalRows.push(body.length);
        }
        const totals = rowTotals(row, countsMap, gradesList);
        const total = gradesList.reduce((sum, g) => sum + rowTotal(totals, g), 0);
        body.push([row.label, total]);
    });

    return { header, body, sectionHeaderRows, subtotalRows };
}

// Division-Wide Summary Case — one Total Cases number per category, summed
// across every active school in the division (both elementary and
// secondary) at once, fetched fresh for whatever period this panel was
// asked for (see fetchCategoryReport above) instead of reusing the
// on-screen globals — mirrors generateCasesBySchoolPdf/Excel.
async function generateDivisionSummaryPdf(period, start, end, label) {
    if (typeof window.jspdf === 'undefined') {
        showAlert('error', 'PDF export library failed to load.');
        return;
    }

    const { sections: divisionSections, counts: divisionCounts, grades: divisionGrades } = await fetchCategoryReport(ALL_DISTRICTS, period, start, end);
    const rows = buildDisplayRows(divisionSections, divisionCounts, divisionGrades);
    const { header, body, sectionHeaderRows } = buildDivisionSummaryTable(rows, divisionCounts, divisionGrades);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const contentTop = sdoDrawReportTitle(
        doc,
        'Division-Wide Summary Case',
        `Period: ${label}  |  Generated: ${new Date().toLocaleDateString()}`
    );

    doc.autoTable({
        head: [header],
        body,
        startY: contentTop,
        margin: { top: sdoPdfContentTop(doc), bottom: sdoPdfFooterReserve(doc) },
        theme: 'grid',
        headStyles: { fillColor: [29, 90, 168], textColor: 255, fontStyle: 'bold', valign: 'middle' },
        styles: { fontSize: 10, cellPadding: 4, valign: 'middle', overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 40, halign: 'center' } },
        didParseCell: (data) => {
            if (data.section === 'body' && sectionHeaderRows.includes(data.row.index)) {
                data.cell.styles.fillColor = [226, 232, 240];
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    drawSdoPdfLetterhead(doc);

    const filename = `Division-Wide-Summary_${label.replace(/\s+/g, '-')}_${new Date().toISOString().split('T')[0]}.pdf`;
    showPdfPreview(doc, filename);
}

// Division-Wide Summary's table is a plain 2-column (Category of Cases,
// Total Cases) rollup, not the grade-grouped Male/Female/Total triplets
// buildCategoryOfCasesWorkbook() builds — that one needs a gradesList this
// report doesn't have. Its own builder instead, same styling approach as
// buildCasesBySchoolWorkbook() above. Only sectionHeaderRows gets styled
// (subtotal rows aren't a thing in this collapsed table — buildDivisionSummaryTable
// still tracks them, but generateDivisionSummaryPdf's own table doesn't use
// them either, only sectionHeaderRows).
function buildDivisionSummaryWorkbook(body, sectionHeaderRows, title, periodLabel) {
    const totalCols = 2;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Division Summary');

    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells(2, 1, 2, totalCols);
    const periodCell = sheet.getCell(2, 1);
    periodCell.value = `Period: ${periodLabel}`;
    periodCell.font = { size: 10, color: { argb: 'FF666666' } };
    periodCell.alignment = { horizontal: 'center' };

    const headRow = 4;
    ['Category of Cases', 'Total Cases'].forEach((label, i) => {
        const cell = sheet.getCell(headRow, i + 1);
        cell.value = label;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5AA8' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = THIN_BORDER;
    });

    let rowIndex = headRow + 1;
    body.forEach((row, i) => {
        const isSectionHeader = sectionHeaderRows.includes(i);
        row.forEach((value, c) => {
            const cell = sheet.getCell(rowIndex, c + 1);
            cell.value = value;
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center', wrapText: true };
            if (isSectionHeader) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
                cell.font = { bold: true };
            }
        });
        rowIndex++;
    });

    sheet.getColumn(1).width = 40;
    sheet.getColumn(2).width = 14;

    return workbook;
}

async function generateDivisionSummaryExcel(period, start, end, label) {
    if (typeof ExcelJS === 'undefined') {
        showAlert('error', 'Excel export library failed to load.');
        return;
    }

    const { sections: divisionSections, counts: divisionCounts, grades: divisionGrades } = await fetchCategoryReport(ALL_DISTRICTS, period, start, end);
    const rows = buildDisplayRows(divisionSections, divisionCounts, divisionGrades);
    const { header, body, sectionHeaderRows } = buildDivisionSummaryTable(rows, divisionCounts, divisionGrades);

    const title = 'Division-Wide Summary Case';
    const filename = `Division-Wide-Summary_${label.replace(/\s+/g, '-')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const categoryAoa = [
        [title],
        [`Period: ${label}`],
        [],
        header,
        ...body
    ];
    const sheets = [
        { name: 'Division Summary', aoa: categoryAoa, colWidths: [{ wch: 40 }, { wch: 14 }] }
    ];

    showExcelPreview(filename, sheets, async () => {
        const workbook = buildDivisionSummaryWorkbook(body, sectionHeaderRows, title, label);
        await downloadExcelJSWorkbook(workbook, filename);
        showAlert('success', 'Excel report exported successfully!');
    });
}

// School Level select value ('all'/'Secondary'/'East'/'West'/'South') read
// fresh at export time, same pattern as casesPeriodMode — East/West/South
// are the elementary school_level buckets set per-school in School
// Management, Secondary is everyone else.
function selectedSchoolLevel() {
    return document.getElementById('exportSchoolLevel')?.value || 'all';
}

function selectedSectionFilter() {
    return document.getElementById('exportSectionFilter')?.value || 'all';
}

function selectedCategoryFilter() {
    return document.getElementById('exportCategoryFilter')?.value || 'all';
}

// Human-readable "(East, A. Behavioral or Conduct Problem, Alcohol)" suffix
// for the export title, built from whichever School Level/Section/Case
// Category are currently picked — reads each <select>'s own selected
// <option> text rather than its value, since Section/Category values are
// bare sectionId/categoryId strings.
function exportCasesByFilterSuffix() {
    const level = selectedSchoolLevel();
    const sectionSelect = document.getElementById('exportSectionFilter');
    const categorySelect = document.getElementById('exportCategoryFilter');
    const parts = [
        level !== 'all' ? level : '',
        (sectionSelect && sectionSelect.value !== 'all') ? sectionSelect.options[sectionSelect.selectedIndex].textContent : '',
        (categorySelect && categorySelect.value !== 'all' && !categorySelect.disabled) ? categorySelect.options[categorySelect.selectedIndex].textContent : ''
    ].filter(Boolean);
    return parts.length ? ` (${parts.join(', ')})` : '';
}

// "Cases by School" export — only reachable for "All Districts" (a
// specific school/district instead goes straight to generateCategoryOf-
// CasesPdf/Excel above, no panel), fetched fresh for the panel's chosen
// Weekly/Monthly/Annually/Custom period, School Level, Section, and Case
// Category.
async function generateCasesBySchoolPdf(period, start, end, label) {
    if (typeof window.jspdf === 'undefined') {
        showAlert('error', 'PDF export library failed to load.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const districtTitle = districtLabel(currentDistrict);
    const level = selectedSchoolLevel();
    const section = selectedSectionFilter();
    const category = selectedCategoryFilter();
    const titleSuffix = exportCasesByFilterSuffix();
    const filename = `${districtTitle.replace(/\s+/g, '-')}_${level !== 'all' ? level + '_' : ''}${label.replace(/\s+/g, '-')}_ReportCases_${new Date().toISOString().split('T')[0]}.pdf`;

    const schools = await fetchSchoolBreakdownData(currentDistrict, period, start, end, level, section, category);
    const { body: schoolBody, totals: schoolTotals } = buildSchoolBreakdownExportRows(schools);

    const contentTop = sdoDrawReportTitle(
        doc,
        `Cases by School - ${districtTitle}${titleSuffix}`,
        `Period: ${label}  |  Generated: ${new Date().toLocaleDateString()}`
    );

    doc.autoTable({
        head: [['School', 'Total Cases', 'Male', 'Female']],
        body: [
            ...schoolBody,
            [
                { content: 'Overall Total', styles: { fontStyle: 'bold' } },
                { content: String(schoolTotals.total), styles: { fontStyle: 'bold' } },
                { content: String(schoolTotals.male), styles: { fontStyle: 'bold' } },
                { content: String(schoolTotals.female), styles: { fontStyle: 'bold' } }
            ]
        ],
        startY: contentTop,
        margin: { top: sdoPdfContentTop(doc), bottom: sdoPdfFooterReserve(doc) },
        theme: 'grid',
        headStyles: { fillColor: [29, 90, 168], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 }
    });

    drawSdoPdfLetterhead(doc);

    showPdfPreview(doc, filename);
}

// Real cell colors/borders on the downloaded .xlsx need actual
// style-writing, which the plain SheetJS build (also loaded on this page,
// used only for the preview modal's aoa-based rendering) can't do on write
// — CE dropped that years ago, which is why this export used to come out
// as an unstyled flat grid. ExcelJS still writes real styles, so the
// downloaded file is built with that instead, matching
// buildCategoryOfCasesWorkbook()/buildDmmrWorkbook() above.
function buildCasesBySchoolWorkbook(schoolBody, schoolTotals, title, periodLabel) {
    const totalCols = 4; // School, Total Cases, Male, Female
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cases by School');

    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells(2, 1, 2, totalCols);
    const periodCell = sheet.getCell(2, 1);
    periodCell.value = periodLabel;
    periodCell.font = { size: 10, color: { argb: 'FF666666' } };
    periodCell.alignment = { horizontal: 'center' };

    const headRow = 4;
    ['School', 'Total Cases', 'Male', 'Female'].forEach((label, i) => {
        const cell = sheet.getCell(headRow, i + 1);
        cell.value = label;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5AA8' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = THIN_BORDER;
    });

    let rowIndex = headRow + 1;
    schoolBody.forEach(row => {
        row.forEach((value, c) => {
            const cell = sheet.getCell(rowIndex, c + 1);
            cell.value = value;
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center', wrapText: true };
        });
        rowIndex++;
    });

    const totalsRow = ['Overall Total', schoolTotals.total, schoolTotals.male, schoolTotals.female];
    totalsRow.forEach((value, c) => {
        const cell = sheet.getCell(rowIndex, c + 1);
        cell.value = value;
        cell.border = THIN_BORDER;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center' };
    });

    sheet.getColumn(1).width = 34;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 10;

    return workbook;
}

async function generateCasesBySchoolExcel(period, start, end, label) {
    if (typeof ExcelJS === 'undefined') {
        showAlert('error', 'Excel export library failed to load.');
        return;
    }

    const districtTitle = districtLabel(currentDistrict);
    const level = selectedSchoolLevel();
    const section = selectedSectionFilter();
    const category = selectedCategoryFilter();
    const titleSuffix = exportCasesByFilterSuffix();
    const filename = `${districtTitle.replace(/\s+/g, '-')}_${level !== 'all' ? level + '_' : ''}${label.replace(/\s+/g, '-')}_ReportCases_${new Date().toISOString().split('T')[0]}.xlsx`;

    const schools = await fetchSchoolBreakdownData(currentDistrict, period, start, end, level, section, category);
    const { body: schoolBody, totals: schoolTotals } = buildSchoolBreakdownExportRows(schools);
    const schoolAoa = [
        [`Cases by School - ${districtTitle}${titleSuffix}`],
        [`Period: ${label}`],
        [],
        ['School', 'Total Cases', 'Male', 'Female'],
        ...schoolBody,
        ['Overall Total', schoolTotals.total, schoolTotals.male, schoolTotals.female]
    ];
    const sheets = [
        { name: 'Cases by School', aoa: schoolAoa, colWidths: [{ wch: 34 }, { wch: 12 }, { wch: 10 }, { wch: 10 }] }
    ];

    showExcelPreview(filename, sheets, async () => {
        const workbook = buildCasesBySchoolWorkbook(schoolBody, schoolTotals, `Cases by School - ${districtTitle}${titleSuffix}`, `Period: ${label}`);
        await downloadExcelJSWorkbook(workbook, filename);
        showAlert('success', 'Excel report exported successfully!');
    });
}

/* ---- Division Monthly Monitoring Report of Learners' Personal-Social
   Concerns — rows are built live from every real section and case_category,
   the same complete set 'categories'/fetch_sections() already uses for the
   on-screen Category of Cases table. No hardcoded issue list: whatever
   sections/categories exist in the database is exactly what shows up here,
   so it always covers every real category, and one added or renamed later
   (e.g. via referral setup) appears automatically. Cases with no category
   chosen yet aren't broken out as their own row (matches the official
   form, which has no "Uncategorized" line), but still count toward
   whichever totals fold in their section's counts elsewhere on this page. ---- */

// Intervention Provider starts blank on every row — nothing in the schema
// tracks who actually intervened, so instead of guessing a default per
// category, the column header spells out who it could be and the
// guidance counselor fills each cell in by hand (still a normal editable
// Excel cell, just empty by default).
const DMMR_PROVIDER_HEADER = 'Intervention Provider (Adviser, Guidance Designate, School Head, RGC)';

// Colors matching the official form's look (cyan column-group headers,
// green section rows) — shared between the PDF (RGB triplets, jspdf-
// autotable) and Excel (ARGB hex, ExcelJS) builders so both exports and
// the reference template stay visually consistent.
const DMMR_HEADER_COLOR = [0, 255, 255];   // cyan
const DMMR_SECTION_COLOR = [0, 204, 0];    // green
const DMMR_HEADER_ARGB = 'FF00FFFF';
const DMMR_SECTION_ARGB = 'FF00CC00';
// Generic thin border, reused by every ExcelJS-built report on this page
// (DMMR and Category of Cases), not just DMMR.
const THIN_BORDER = {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
};

// Fixed 4 columns, matching the official form exactly: one column per
// schools.school_level (Secondary/East/West/South — set per-school in
// School Management's Add School modal), mutually exclusive rather than a
// division-wide total plus subsets, so each school's cases land in exactly
// the one column matching its own level.
const DMMR_GROUPS = [
    { key: 'Secondary', label: 'Secondary' },
    { key: 'East', label: 'East' },
    { key: 'West', label: 'West' },
    { key: 'South', label: 'South' }
];

// Builds the [No. of Cases, Intervention Provider] grouped header for each
// of DMMR_GROUPS — same grouped-header shape as the coordinator
// report-case.js's Grade columns (rowSpan/colSpan for PDF, two stacked
// header rows + !merges for Excel), just grouped by region instead of grade
// — and one row per real section/category instead of a fixed issue list.
function buildDmmrTable(sections, countsByGroup) {
    const groups = DMMR_GROUPS;

    const pdfHead = [
        [
            { content: 'Name of School', rowSpan: 2, styles: { valign: 'middle' } },
            ...groups.map(g => ({ content: g.label, colSpan: 2, styles: { halign: 'center' } }))
        ],
        groups.flatMap(() => ['No. of Cases', DMMR_PROVIDER_HEADER])
    ];
    const excelRow1 = ['Name of School', ...groups.flatMap(g => [g.label, ''])];
    const excelRow2 = ['', ...groups.flatMap(() => ['No. of Cases', DMMR_PROVIDER_HEADER])];

    const body = [];
    const sectionHeaderRows = [];

    const pushRow = (label, bucketKey) => {
        const row = [label];
        groups.forEach(g => {
            const count = (countsByGroup[g.key] && countsByGroup[g.key][bucketKey]) || 0;
            row.push(count, ''); // Intervention Provider starts blank — filled in by hand
        });
        body.push(row);
    };

    sections.forEach(section => {
        sectionHeaderRows.push(body.length);
        body.push([`${section.sectionCode}. ${section.sectionName}`, ...groups.flatMap(() => ['', ''])]);

        section.categories.forEach(cat => pushRow(cat.categoryName, cat.categoryId));
    });

    return { pdfHead, excelRow1, excelRow2, body, sectionHeaderRows, groups };
}

async function generateDmmrPdf(start, end, label) {
    if (typeof window.jspdf === 'undefined') {
        showAlert('error', 'PDF export library failed to load.');
        return;
    }

    const { sections: dmmrSections, counts: dmmrCounts } = await fetchPersonalSocialConcerns('custom', start, end);
    const { pdfHead, body, sectionHeaderRows } = buildDmmrTable(dmmrSections, dmmrCounts);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    const contentTop = sdoDrawReportTitle(
        doc,
        `Division Monthly Monitoring Report of Learners' Personal-Social Concerns`,
        `Period: ${label}  |  Generated: ${new Date().toLocaleDateString()}`
    );

    doc.autoTable({
        head: pdfHead,
        body,
        startY: contentTop,
        margin: { top: sdoPdfContentTop(doc), bottom: sdoPdfFooterReserve(doc) },
        theme: 'grid',
        headStyles: { fillColor: DMMR_HEADER_COLOR, textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7, halign: 'center', valign: 'middle' },
        styles: { fontSize: 7, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 45, halign: 'left' } },
        didParseCell: (data) => {
            if (data.section === 'body' && sectionHeaderRows.includes(data.row.index)) {
                data.cell.styles.fillColor = DMMR_SECTION_COLOR;
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    drawSdoPdfLetterhead(doc);

    const filename = `DMMR_${label.replace(/\s+/g, '-')}_${new Date().toISOString().split('T')[0]}.pdf`;
    showPdfPreview(doc, filename);
}

// Real cell colors/borders/wrap-text on a genuinely editable .xlsx need
// actual style-writing, which the SheetJS build loaded on this page (the
// free "Community Edition") can't do on write — CE dropped that years ago.
// ExcelJS still does, so the downloaded file (built here) uses that
// instead; the preview modal (showExcelPreview, shared with the other
// exports on this page) stays SheetJS/aoa-based — it's an unstyled
// approximation of the content, not a pixel match, same tradeoff already
// accepted for the merged grade/district headers on this page.
function buildDmmrWorkbook(sections, countsByGroup, label) {
    const groups = DMMR_GROUPS;
    const totalCols = 1 + groups.length * 2;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('DMMR');

    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `Division Monthly Monitoring Report of Learners' Personal-Social Concerns`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells(2, 1, 2, totalCols);
    const periodCell = sheet.getCell(2, 1);
    periodCell.value = `Period: ${label}`;
    periodCell.font = { size: 10, color: { argb: 'FF666666' } };
    periodCell.alignment = { horizontal: 'center' };

    const headRow1 = 4;
    const headRow2 = 5;

    sheet.mergeCells(headRow1, 1, headRow2, 1);
    sheet.getCell(headRow1, 1).value = 'Name of School';

    let col = 2;
    groups.forEach(g => {
        sheet.mergeCells(headRow1, col, headRow1, col + 1);
        sheet.getCell(headRow1, col).value = g.label;
        sheet.getCell(headRow2, col).value = 'No. of Cases';
        sheet.getCell(headRow2, col + 1).value = DMMR_PROVIDER_HEADER;
        col += 2;
    });

    for (let r = headRow1; r <= headRow2; r++) {
        for (let c = 1; c <= totalCols; c++) {
            const cell = sheet.getCell(r, c);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DMMR_HEADER_ARGB } };
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = THIN_BORDER;
        }
    }

    let rowIndex = headRow2 + 1;

    const pushDataRow = (label, bucketKey) => {
        sheet.getCell(rowIndex, 1).value = label;
        let c = 2;
        groups.forEach(g => {
            const count = (countsByGroup[g.key] && countsByGroup[g.key][bucketKey]) || 0;
            sheet.getCell(rowIndex, c).value = count;
            sheet.getCell(rowIndex, c + 1).value = ''; // Intervention Provider starts blank — filled in by hand
            c += 2;
        });
        for (let cc = 1; cc <= totalCols; cc++) {
            const cell = sheet.getCell(rowIndex, cc);
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle', wrapText: true, horizontal: cc === 1 ? 'left' : (cc % 2 === 0 ? 'center' : 'left') };
        }
        rowIndex++;
    };

    sections.forEach(section => {
        sheet.mergeCells(rowIndex, 1, rowIndex, totalCols);
        const sectionCell = sheet.getCell(rowIndex, 1);
        sectionCell.value = `${section.sectionCode}. ${section.sectionName}`;
        sectionCell.font = { bold: true };
        sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DMMR_SECTION_ARGB } };
        sectionCell.alignment = { vertical: 'middle', wrapText: true };
        for (let c = 1; c <= totalCols; c++) sheet.getCell(rowIndex, c).border = THIN_BORDER;
        rowIndex++;

        section.categories.forEach(cat => pushDataRow(cat.categoryName, cat.categoryId));
    });

    sheet.getColumn(1).width = 32;
    for (let c = 2; c <= totalCols; c += 2) {
        sheet.getColumn(c).width = 11;
        sheet.getColumn(c + 1).width = 30;
    }

    return workbook;
}

async function downloadExcelJSWorkbook(workbook, filename) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function generateDmmrExcel(start, end, label) {
    if (typeof ExcelJS === 'undefined') {
        showAlert('error', 'Excel export library failed to load.');
        return;
    }

    const { sections: dmmrSections, counts: dmmrCounts } = await fetchPersonalSocialConcerns('custom', start, end);
    const { excelRow1, excelRow2, body } = buildDmmrTable(dmmrSections, dmmrCounts);

    const titleRows = [
        [`Division Monthly Monitoring Report of Learners' Personal-Social Concerns`],
        [`Period: ${label}`],
        []
    ];
    const fullAoa = [...titleRows, excelRow1, excelRow2, ...body];
    const filename = `DMMR_${label.replace(/\s+/g, '-')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    const sheets = [{ name: `Division Monthly Monitoring Report`, aoa: fullAoa }];

    showExcelPreview(filename, sheets, async () => {
        const workbook = buildDmmrWorkbook(dmmrSections, dmmrCounts, label);
        await downloadExcelJSWorkbook(workbook, filename);
        showAlert('success', 'Excel report exported successfully!');
    });
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    setUserInfo();

    // Awaited so Export PDF never races this — sdoPdfContentTop()/
    // sdoPdfFooterReserve() fall back to the built-in DepEd sizing if it
    // hasn't resolved yet.
    await loadSdoReportLetterheadOverride();
    setupReportSettingsModal();

    await loadDistrictList();
    renderDistrictButtons();
    initDistrictSearch();
    await refreshReports();
    setupEventListeners();
});

/* ── Report Settings (division-wide PDF header/footer) ── */

// Holds the full-resolution rendered PDF page between file-select and Save
// — the visible <canvas> is drawn at this same resolution (scaled down only
// via CSS), so cropping straight from it needs no re-render. Same pattern
// as the coordinator's report-case.js.
let reportLetterheadSourceCanvas = null;
let reportLetterheadOriginalFilename = '';

function setupReportSettingsModal() {
    document.getElementById('reportSettingsBtn').addEventListener('click', openReportSettingsModal);
    document.getElementById('closeReportSettingsModal').addEventListener('click', closeReportSettingsModal);
    document.getElementById('reportSettingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'reportSettingsModal') closeReportSettingsModal();
    });
    document.getElementById('reportLetterheadFileInput').addEventListener('change', handleReportLetterheadFileSelected);
    document.getElementById('editReportLetterheadCropBtn').addEventListener('click', handleEditReportLetterheadCrop);
    document.getElementById('reportLetterheadHeaderSlider').addEventListener('input', updateReportLetterheadOverlays);
    document.getElementById('reportLetterheadFooterSlider').addEventListener('input', updateReportLetterheadOverlays);
    document.getElementById('saveReportLetterheadBtn').addEventListener('click', handleSaveReportLetterhead);
    document.getElementById('deleteReportLetterheadBtn').addEventListener('click', handleDeleteReportLetterhead);
}

function openReportSettingsModal() {
    resetReportLetterheadEditor();
    renderReportLetterheadCurrentState();
    openModal('reportSettingsModal');
}

function closeReportSettingsModal() {
    closeModal('reportSettingsModal');
}

// Two states: a custom override already saved (same layout as the
// coordinator's settings modal), or still on the built-in DepEd design
// (shows the real seal/footer-logo assets already loaded from
// sdo-report-assets.js, since there's nothing stored in the DB yet to show).
function renderReportLetterheadCurrentState() {
    const letterhead = getCurrentSdoReportLetterhead();
    const currentBlock = document.getElementById('reportLetterheadCurrent');
    const builtinBlock = document.getElementById('reportLetterheadBuiltinNotice');
    const fileLabel = document.getElementById('reportLetterheadFileLabel');

    if (!letterhead) {
        currentBlock.style.display = 'none';
        builtinBlock.style.display = 'block';
        document.getElementById('reportLetterheadBuiltinHeaderPreview').src = SDO_LOGO_DEPED_SEAL;
        document.getElementById('reportLetterheadBuiltinFooterPreview').src = SDO_LOGO_FOOTER_COMBINED;
        fileLabel.textContent = 'Upload New PDF';
        return;
    }

    builtinBlock.style.display = 'none';
    document.getElementById('reportLetterheadHeaderPreview').src = letterhead.headerImage;
    document.getElementById('reportLetterheadFooterPreview').src = letterhead.footerImage;
    document.getElementById('reportLetterheadMeta').textContent =
        (letterhead.originalFilename ? `Uploaded from "${letterhead.originalFilename}"` : 'Uploaded') +
        (letterhead.updatedAt ? ` — last updated ${new Date(letterhead.updatedAt.replace(' ', 'T')).toLocaleString()}` : '');
    // Older rows saved before Edit Crop existed have no stored source
    // image to re-slice — Replace with a Different PDF is their only path,
    // called out explicitly instead of just silently hiding the button.
    document.getElementById('editReportLetterheadCropBtn').style.display = letterhead.sourceImage ? '' : 'none';
    document.getElementById('reportLetterheadNoEditNotice').style.display = letterhead.sourceImage ? 'none' : 'block';
    fileLabel.textContent = 'Replace with a Different PDF';
    currentBlock.style.display = 'block';
}

function handleEditReportLetterheadCrop() {
    const letterhead = getCurrentSdoReportLetterhead();
    if (!letterhead || !letterhead.sourceImage) {
        showAlert('error', 'This letterhead was saved before Edit Crop existed — upload the PDF again to re-adjust it.');
        return;
    }

    const img = new Image();
    img.onload = () => {
        const canvas = document.getElementById('reportLetterheadCanvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);

        reportLetterheadSourceCanvas = canvas;
        reportLetterheadOriginalFilename = letterhead.originalFilename || '';

        document.getElementById('reportLetterheadHeaderSlider').value = letterhead.headerPct || 20;
        document.getElementById('reportLetterheadFooterSlider').value = letterhead.footerPct || 15;
        document.getElementById('reportLetterheadEditor').style.display = 'block';
        updateReportLetterheadOverlays();
    };
    img.onerror = () => showAlert('error', 'Could not load the saved letterhead image.');
    img.src = letterhead.sourceImage;
}

function resetReportLetterheadEditor() {
    document.getElementById('reportLetterheadFileInput').value = '';
    document.getElementById('reportLetterheadEditor').style.display = 'none';
    reportLetterheadSourceCanvas = null;
    reportLetterheadOriginalFilename = '';
}

// pdf.js is only ever needed on this settings modal — every PDF export path
// stays on plain jsPDF/autoTable, so this stays out of the page's default
// script tags and is fetched once, lazily, the first time it's actually used.
let reportLetterheadPdfJsPromise = null;
function loadPdfJsIfNeeded() {
    if (window.pdfjsLib) return Promise.resolve();
    if (reportLetterheadPdfJsPromise) return reportLetterheadPdfJsPromise;

    reportLetterheadPdfJsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load the PDF renderer'));
        document.head.appendChild(script);
    }).then(() => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    });

    return reportLetterheadPdfJsPromise;
}

async function handleReportLetterheadFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    reportLetterheadOriginalFilename = file.name;

    try {
        await loadPdfJsIfNeeded();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        // 2x scale for print-quality crops — the visible canvas is shown
        // shrunk via CSS (max-width: 100%), the full pixel data is kept for
        // the actual header/footer crops at Save time.
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.getElementById('reportLetterheadCanvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        reportLetterheadSourceCanvas = canvas;
        document.getElementById('reportLetterheadEditor').style.display = 'block';
        updateReportLetterheadOverlays();
    } catch (err) {
        console.error('Error rendering PDF letterhead:', err);
        showAlert('error', 'Could not read that PDF — try a different file.');
    }
}

// Redraws the two highlight bands over the canvas preview as the sliders
// move — pure percentage-of-container sizing, so it tracks the canvas's
// displayed (CSS-scaled) size regardless of its actual pixel resolution.
function updateReportLetterheadOverlays() {
    const headerPct = Number(document.getElementById('reportLetterheadHeaderSlider').value);
    const footerPct = Number(document.getElementById('reportLetterheadFooterSlider').value);
    document.getElementById('reportLetterheadHeaderPct').textContent = headerPct;
    document.getElementById('reportLetterheadFooterPct').textContent = footerPct;
    document.getElementById('reportLetterheadHeaderOverlay').style.height = `${headerPct}%`;
    document.getElementById('reportLetterheadFooterOverlay').style.height = `${footerPct}%`;
}

function cropCanvasRegion(sourceCanvas, yStart, height) {
    const cropped = document.createElement('canvas');
    cropped.width = sourceCanvas.width;
    cropped.height = height;
    cropped.getContext('2d').drawImage(sourceCanvas, 0, yStart, sourceCanvas.width, height, 0, 0, sourceCanvas.width, height);
    return cropped;
}

function canvasToPngBlob(canvas) {
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function handleSaveReportLetterhead() {
    if (!reportLetterheadSourceCanvas) {
        showAlert('error', 'Choose a PDF first.');
        return;
    }

    const headerPctValue = Number(document.getElementById('reportLetterheadHeaderSlider').value);
    const footerPctValue = Number(document.getElementById('reportLetterheadFooterSlider').value);
    const fullHeight = reportLetterheadSourceCanvas.height;
    const headerHeightPx = Math.round(fullHeight * (headerPctValue / 100));
    const footerHeightPx = Math.round(fullHeight * (footerPctValue / 100));

    const headerCanvas = cropCanvasRegion(reportLetterheadSourceCanvas, 0, headerHeightPx);
    const footerCanvas = cropCanvasRegion(reportLetterheadSourceCanvas, fullHeight - footerHeightPx, footerHeightPx);

    const saveBtn = document.getElementById('saveReportLetterheadBtn');
    saveBtn.disabled = true;

    try {
        const [headerBlob, footerBlob, sourceBlob] = await Promise.all([
            canvasToPngBlob(headerCanvas),
            canvasToPngBlob(footerCanvas),
            canvasToPngBlob(reportLetterheadSourceCanvas)
        ]);
        await saveSdoReportLetterhead(
            headerBlob, footerBlob,
            headerCanvas.width / headerCanvas.height,
            footerCanvas.width / footerCanvas.height,
            reportLetterheadOriginalFilename,
            sourceBlob, headerPctValue, footerPctValue
        );
        showAlert('success', 'Report header/footer saved! This also updates School Reports exports.');
        resetReportLetterheadEditor();
        renderReportLetterheadCurrentState();
    } catch (err) {
        showAlert('error', err.message || 'Failed to save the report header/footer.');
    } finally {
        saveBtn.disabled = false;
    }
}

async function handleDeleteReportLetterhead() {
    if (!confirm('Revert to the built-in DepEd letterhead? Future exports go back to the seal/text design.')) return;

    try {
        await deleteSdoReportLetterhead();
        showAlert('success', 'Reverted to the built-in letterhead.');
        renderReportLetterheadCurrentState();
    } catch (err) {
        showAlert('error', err.message || 'Failed to delete the report letterhead.');
    }
}

// Show alert
function showAlert(type, message) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;
    alert.style.position = 'fixed';
    alert.style.top = '20px';
    alert.style.right = '20px';
    alert.style.zIndex = '10000';
    alert.style.minWidth = '300px';
    document.body.appendChild(alert);

    setTimeout(() => {
        alert.remove();
    }, 3000);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Logout is provided by js/auth.js (calls api/logout to clear the
// server-side session token) — do not redeclare it here.
