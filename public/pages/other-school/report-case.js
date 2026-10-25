// Report Cases — real case-category x grade x gender counts, sourced from
// api/case-report (which aggregates the counselor's actual logged cases
// in counselor_case_scenarios). Categories/sections match the real
// case_category/section tables used by the counselor's case workflow.

// Mutable: reassigned to [1..6] whenever this account's school is
// elementary (school_level East/West/South) — see loadReportData() and
// api/case-report's schools_are_elementary(). Defaults to the usual
// secondary range until the first fetch comes back.
let ALL_REPORT_GRADES = [7, 8, 9, 10, 11, 12];
let isElementarySchool = false;

let currentSchool = '';
let sections = [];
let counts = {};
let displayRows = [];

// This same report-case.js is shared verbatim by the coordinator, counselor,
// and combined ("other-school") login pages — the exported filename still
// reads the logged-in account's own role (below) so files from different
// roles don't collide, even though the report title itself no longer names
// a role ("Learners Personal-Social Concern", not "Coordinator Report
// Cases"/"Counselor Report Cases").
function reportRoleSlug() {
    const role = (getCurrentUser() && getCurrentUser().role) || '';
    if (role === 'counselor') return 'counselor';
    if (role === 'counselor-and-coordinator') return 'combined';
    return 'coordinator';
}

// Grades this account is allowed to see (e.g. a coordinator scoped to
// Grades 7-10, or all six if unassigned/no restriction).
let visibleGrades = ALL_REPORT_GRADES;

function computeVisibleGrades() {
    const scoped = gradeScopeToList(getCurrentGradeScope(), isElementarySchool);
    return scoped.length ? scoped : ALL_REPORT_GRADES;
}

// Rebuilds the two-row grouped header (Grade N spanning Male/Female/Total)
// from visibleGrades. Built fresh every time rather than trimming the
// static 7-12 markup, since an elementary school's 1-6 columns don't exist
// in that markup at all.
function renderGradeHeader() {
    const theadRows = document.querySelectorAll('#reportCasesTable thead tr');
    if (theadRows.length < 2) return;

    theadRows[0].innerHTML = `<th>Category of Cases</th>${visibleGrades.map(g =>
        `<th colspan="3" class="grade-col" data-grade="${g}" style="text-align: center;">Grade ${g}</th>`
    ).join('')}`;

    theadRows[1].innerHTML = `<th></th>${visibleGrades.map(g =>
        `<th class="grade-col" data-grade="${g}">Male</th><th class="grade-col" data-grade="${g}">Female</th><th class="grade-col" data-grade="${g}">Total</th>`
    ).join('')}`;
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    initPage();
    await refreshGradeScope();

    const user = getCurrentUser();
    currentSchool = (user && user.school_attended) || '';

    // Awaited so Export PDF never races this — reportLetterheadContentTop()
    // etc. all no-op back to today's plain layout if it hasn't resolved.
    // Same per-school letterhead the coordinator manages under Report
    // Settings — this page only ever reads it, no CRUD UI here.
    await loadReportLetterhead(currentSchool);

    await loadReportData();
    visibleGrades = computeVisibleGrades();
    renderGradeHeader();

    buildCasesTable();
    populateFilterOptions();
    setupEventListeners();
});

function esc(value) {
    const div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
}

async function loadReportData() {
    try {
        const gradeScope = getCurrentGradeScope();
        const url = `../../api/case-report?action=categories&school=${encodeURIComponent(currentSchool)}&grade_scope=${encodeURIComponent(gradeScope)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Failed to load case report');
        }

        sections = data.sections || [];
        counts = data.counts || {};
        if (Array.isArray(data.grades) && data.grades.length) {
            ALL_REPORT_GRADES = data.grades;
        }
        isElementarySchool = !!data.isElementary;
    } catch (error) {
        console.error('Error loading case report:', error);
        sections = [];
        counts = {};
    }
}

function gradeCell(bucketKey, grade) {
    const bucket = counts[bucketKey];
    return (bucket && bucket[String(grade)]) || { m: 0, f: 0 };
}

// Flattens sections/categories/counts into one render-and-export-ready list:
// a header row per section, a row per real category, a subtotal row per
// section, and a final grand-total row. Uncategorized cases (no category
// chosen yet) aren't broken out as their own row, but still count toward
// the section/grand totals via addToTotals() below.
function buildDisplayRows() {
    const rows = [];
    const grandTotal = {};
    visibleGrades.forEach(g => { grandTotal[g] = { m: 0, f: 0 }; });

    sections.forEach(section => {
        rows.push({ type: 'header', label: `${section.sectionCode}. ${section.sectionName}` });

        const sectionTotal = {};
        visibleGrades.forEach(g => { sectionTotal[g] = { m: 0, f: 0 }; });

        const addToTotals = (bucketKey) => {
            visibleGrades.forEach(g => {
                const cell = gradeCell(bucketKey, g);
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

function rowTotals(row) {
    if (row.type === 'subtotal') {
        return row.totals;
    }
    const totals = {};
    visibleGrades.forEach(g => { totals[g] = gradeCell(row.bucketKey, g); });
    return totals;
}

function buildCasesTable() {
    const tbody = document.getElementById('casesTableBody');
    tbody.innerHTML = '';

    displayRows = buildDisplayRows();

    displayRows.forEach((row, index) => {
        const tr = document.createElement('tr');

        if (row.type === 'header') {
            const colCount = 1 + visibleGrades.length * 3;
            tr.innerHTML = `<td colspan="${colCount}" style="font-weight: 700; background: #e2e8f0;">${row.label}</td>`;
            tbody.appendChild(tr);
            return;
        }

        if (row.type === 'subtotal') {
            tr.style.fontWeight = '700';
            tr.style.backgroundColor = '#f1f5f9';
        }

        const totals = rowTotals(row);
        let html = `<td style="font-weight: 500;">${row.label}</td>`;

        visibleGrades.forEach(g => {
            const cell = totals[g] || { m: 0, f: 0 };
            const total = cell.m + cell.f;
            html += `<td class="text-center" style="font-size: 0.9em;">${cell.m}</td><td class="text-center" style="font-size: 0.9em;">${cell.f}</td><td class="text-center">${total > 0 ? `<span class="badge badge-in-progress">${total}</span>` : '0'}</td>`;
        });

        tr.innerHTML = html;

        if (row.type === 'category') {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => showCaseDetails(index));
        }

        tbody.appendChild(tr);
    });
}

function showCaseDetails(rowIndex) {
    const row = displayRows[rowIndex];
    if (!row) return;

    const totals = rowTotals(row);
    let total = 0;
    visibleGrades.forEach(g => {
        total += (totals[g]?.m || 0) + (totals[g]?.f || 0);
    });

    document.getElementById('caseId').value = `CASE-${(currentSchool || 'SCHOOL').toUpperCase().replace(/\s+/g, '-')}-${row.bucketKey || 'ROW'}`;
    document.getElementById('caseCategory').value = row.label;
    document.getElementById('caseGrade').value = `Grades ${visibleGrades[0]}-${visibleGrades[visibleGrades.length - 1]}`;
    document.getElementById('caseStatus').value = 'Active';
    document.getElementById('caseDate').value = new Date().toLocaleDateString();

    let notes = `Total Cases: ${total}\n\n`;
    visibleGrades.forEach(grade => {
        const m = totals[grade]?.m || 0;
        const f = totals[grade]?.f || 0;
        notes += `Grade ${grade}: ${m + f} (M: ${m} / F: ${f})\n`;
    });
    document.getElementById('caseNotes').value = notes;

    openModal('caseModal');
}

// ---- Filter panel + searchable case list ----
// Every filter (period, category, grade, gender, status, free-text search)
// is applied server-side by api/case-report?action=list, which returns
// one row per real logged case — unlike the pivot table above, which only
// ever shows aggregated counts and can't answer "which cases".
let filteredCases = [];

function populateFilterOptions() {
    const categorySelect = document.getElementById('filterCategory');
    sections.forEach(section => {
        const group = document.createElement('optgroup');
        group.label = `${section.sectionCode}. ${section.sectionName}`;
        section.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.categoryId;
            opt.textContent = cat.categoryName;
            group.appendChild(opt);
        });
        const uncategorized = document.createElement('option');
        uncategorized.value = `section-${section.sectionId}-uncategorized`;
        uncategorized.textContent = 'Uncategorized';
        group.appendChild(uncategorized);
        categorySelect.appendChild(group);
    });

    const gradeSelect = document.getElementById('filterGrade');
    visibleGrades.forEach(g => {
        const opt = document.createElement('option');
        opt.value = String(g);
        opt.textContent = `Grade ${g}`;
        gradeSelect.appendChild(opt);
    });
}

function toggleFilterPanel() {
    const panel = document.getElementById('filterPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function updateCustomRangeVisibility() {
    const isCustom = document.getElementById('filterPeriod').value === 'custom';
    document.getElementById('filterStartGroup').style.display = isCustom ? 'block' : 'none';
    document.getElementById('filterEndGroup').style.display = isCustom ? 'block' : 'none';
}

async function applyFilters() {
    const params = new URLSearchParams({
        action: 'list',
        school: currentSchool,
        grade_scope: getCurrentGradeScope(),
        period: document.getElementById('filterPeriod').value,
        start: document.getElementById('filterStart').value,
        end: document.getElementById('filterEnd').value,
        category: document.getElementById('filterCategory').value,
        grade: document.getElementById('filterGrade').value,
        status: document.getElementById('filterStatus').value,
        search: document.getElementById('filterSearch').value.trim()
    });

    const resultsView = document.getElementById('filterResultsView');
    const titleEl = document.getElementById('filterResultsTitle');

    document.getElementById('reportTableView').style.display = 'none';
    resultsView.style.display = 'block';
    titleEl.textContent = 'Searching...';
    document.getElementById('filterResultsEmpty').style.display = 'none';
    document.getElementById('filterResultsTableContainer').style.display = 'none';
    document.getElementById('filterResultsTableBody').innerHTML = '';

    try {
        const response = await fetch(`../../api/case-report?${params.toString()}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Failed to load cases');

        filteredCases = data.data || [];
        renderFilterResults();
    } catch (error) {
        console.error('Error loading filtered cases:', error);
        titleEl.textContent = filterResultsReportTitle();
        const emptyMsg = document.getElementById('filterResultsEmpty');
        emptyMsg.textContent = 'Could not load cases.';
        emptyMsg.style.display = '';
    }
}

// Groups the server-filtered case rows (filteredCases — already matches
// every selected Period/Category/Grade/Gender/Status filter server-side,
// one row per real logged case) by Category + Grade into one summary row
// each, counting Male/Female straight from that same one-row-per-case
// source so a case is never counted twice.
function buildGroupedSummary() {
    const groups = new Map();

    filteredCases.forEach(row => {
        const category = row.categoryName || 'Uncategorized';
        const gradeLabel = row.grade ? `Grade ${row.grade}` : 'N/A';
        const key = `${category}|||${gradeLabel}`;

        if (!groups.has(key)) {
            groups.set(key, { category, grade: gradeLabel, male: 0, female: 0 });
        }
        const g = groups.get(key);
        if (row.gender === 'Male') g.male++;
        else if (row.gender === 'Female') g.female++;
    });

    const rows = Array.from(groups.values())
        .map(g => ({ ...g, total: g.male + g.female }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.grade.localeCompare(b.grade));

    const grandTotal = rows.reduce((acc, r) => {
        acc.male += r.male;
        acc.female += r.female;
        acc.total += r.total;
        return acc;
    }, { male: 0, female: 0, total: 0 });

    return { rows, grandTotal };
}

// "Learners Personal-Social Concern – <Category> – <School>" — the currently
// selected filter category's display name (or "All Categories" when none is
// picked) plus the account's own school, so the title always matches what's
// actually shown/exported below.
function filterResultsReportTitle() {
    const categorySelect = document.getElementById('filterCategory');
    const categoryLabel = categorySelect.value === ''
        ? 'All Categories'
        : (categorySelect.selectedOptions[0]?.textContent || 'All Categories');
    return `Learners Personal-Social Concern – ${categoryLabel} – ${currentSchool || 'School'}`;
}

function renderFilterResults() {
    const titleEl = document.getElementById('filterResultsTitle');
    const emptyMsg = document.getElementById('filterResultsEmpty');
    const tableContainer = document.getElementById('filterResultsTableContainer');
    const tbody = document.getElementById('filterResultsTableBody');

    titleEl.textContent = filterResultsReportTitle();

    const { rows, grandTotal } = buildGroupedSummary();

    if (rows.length === 0) {
        emptyMsg.textContent = 'No records found';
        emptyMsg.style.display = '';
        tableContainer.style.display = 'none';
        tbody.innerHTML = '';
        return;
    }

    emptyMsg.style.display = 'none';
    tableContainer.style.display = '';

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>${esc(r.category)}</td>
            <td class="text-center">${esc(r.grade)}</td>
            <td class="text-center">${r.male}</td>
            <td class="text-center">${r.female}</td>
            <td class="text-center">${r.total}</td>
        </tr>
    `).join('') + `
        <tr style="font-weight: 700; background: #f1f5f9;">
            <td colspan="2">TOTAL</td>
            <td class="text-center">${grandTotal.male}</td>
            <td class="text-center">${grandTotal.female}</td>
            <td class="text-center">${grandTotal.total}</td>
        </tr>
    `;
}

function isFilterResultsActive() {
    return document.getElementById('filterResultsView').style.display !== 'none';
}

// Category/Grade/Male/Female/Total Cases summary rows built from the same
// grouped data rendered on screen (buildGroupedSummary()) — one row per
// Category+Grade combination actually present in the current filter
// results, plus a trailing TOTAL row, so the export always matches what's
// on the page exactly.
function buildFilteredCasesExportRows() {
    const header = ['Category', 'Grade', 'Male', 'Female', 'Total Cases'];
    const { rows, grandTotal } = buildGroupedSummary();
    const body = rows.map(r => [r.category, r.grade, r.male, r.female, r.total]);
    body.push(['TOTAL', '', grandTotal.male, grandTotal.female, grandTotal.total]);
    return { header, body };
}

function filteredCasesExportTitle() {
    return filterResultsReportTitle();
}

// Real cell colors/borders on the downloaded .xlsx need actual
// style-writing — same ExcelJS reasoning as buildReportCasesWorkbook()
// above, just a single flat header row instead of a merged grade pivot.
function buildFilteredCasesWorkbook(header, body, title) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Filtered Cases');
    const totalCols = header.length;

    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells(2, 1, 2, totalCols);
    const periodCell = sheet.getCell(2, 1);
    periodCell.value = `Generated: ${new Date().toLocaleDateString()}`;
    periodCell.font = { size: 10, color: { argb: 'FF666666' } };
    periodCell.alignment = { horizontal: 'center' };

    const headRow = 4;
    header.forEach((label, i) => {
        const cell = sheet.getCell(headRow, i + 1);
        cell.value = label;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5AA8' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = THIN_BORDER;
    });

    const lastRowIndex = body.length - 1;
    body.forEach((row, i) => {
        const rowIndex = headRow + 1 + i;
        const isTotalRow = i === lastRowIndex;
        row.forEach((value, c) => {
            const cell = sheet.getCell(rowIndex, c + 1);
            cell.value = value;
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle', horizontal: header[c] === 'Category' ? 'left' : 'center', wrapText: true };
            if (isTotalRow) {
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            }
        });
        if (isTotalRow) sheet.mergeCells(rowIndex, 1, rowIndex, 2);
    });

    const COLUMN_WIDTHS = { Category: 40, Grade: 14, Male: 10, Female: 10, 'Total Cases': 14 };
    header.forEach((label, i) => {
        sheet.getColumn(i + 1).width = COLUMN_WIDTHS[label] || 14;
    });

    return workbook;
}

function exportFilteredCasesToExcel() {
    if (filteredCases.length === 0) {
        showNotification('No cases to export — adjust the filters first.');
        return;
    }
    if (typeof ExcelJS === 'undefined') {
        showNotification('Excel export library failed to load.');
        return;
    }

    const filename = `filtered-${exportFileBaseName()}.xlsx`;
    const previewTable = document.getElementById('filterResultsTable').cloneNode(true);
    previewTable.removeAttribute('id');

    showExcelPreview(filename, previewTable, async () => {
        const { header, body } = buildFilteredCasesExportRows();
        const workbook = buildFilteredCasesWorkbook(header, body, filteredCasesExportTitle());
        await downloadExcelJSWorkbook(workbook, filename);
        showNotification('Excel report exported successfully!');
    });
}

function exportFilteredCasesToPDF() {
    if (filteredCases.length === 0) {
        showNotification('No cases to export — adjust the filters first.');
        return;
    }
    if (typeof window.jspdf === 'undefined') {
        showNotification('PDF export library failed to load.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const { header, body } = buildFilteredCasesExportRows();
    const totalRowIndex = body.length - 1;

    const contentTop = reportLetterheadContentTop(doc);
    doc.setFontSize(14);
    doc.text(filteredCasesExportTitle(), doc.internal.pageSize.getWidth() / 2, contentTop, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
        `Generated: ${new Date().toLocaleDateString()}`,
        doc.internal.pageSize.getWidth() / 2, contentTop + 6, { align: 'center' }
    );

    const letterheadMargin = reportLetterheadTableMargin(doc);
    doc.autoTable({
        head: [header],
        body,
        startY: contentTop + 11,
        ...(letterheadMargin ? { margin: letterheadMargin } : {}),
        theme: 'grid',
        headStyles: { fillColor: [29, 90, 168], textColor: 255, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
        // Category is always column 0 (Grade/Male/Female/Total Cases don't need extra room).
        columnStyles: { 0: { cellWidth: 120, halign: 'left' } },
        didParseCell: (data) => {
            if (data.section === 'body' && data.row.index === totalRowIndex) {
                data.cell.styles.fillColor = [241, 245, 249];
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    stampReportLetterhead(doc);
    showPdfPreview(doc, `filtered-${exportFileBaseName()}.pdf`);
}

function clearFilters() {
    document.getElementById('filterPeriod').value = 'all';
    document.getElementById('filterStart').value = '';
    document.getElementById('filterEnd').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterGrade').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterSearch').value = '';
    updateCustomRangeVisibility();

    document.getElementById('filterResultsView').style.display = 'none';
    document.getElementById('reportTableView').style.display = '';
    filteredCases = [];
}

function setupEventListeners() {
    // Modal controls
    document.getElementById('closeModal').addEventListener('click', () => closeModal('caseModal'));

    document.getElementById('closeCaseModal').addEventListener('click', () => closeModal('caseModal'));

    document.getElementById('closeNewCaseModal').addEventListener('click', () => {
        document.getElementById('newCaseModal').style.display = 'none';
    });

    document.getElementById('cancelNewCase').addEventListener('click', () => {
        document.getElementById('newCaseModal').style.display = 'none';
    });

    // Form submission
    document.getElementById('caseReportForm').addEventListener('submit', (e) => {
        e.preventDefault();
        submitNewCase();
    });

    // Export buttons
    document.getElementById('exportPdfBtn').addEventListener('click', () => {
        if (isFilterResultsActive()) exportFilteredCasesToPDF();
        else exportToPDF();
    });
    document.getElementById('exportExcelBtn').addEventListener('click', () => {
        if (isFilterResultsActive()) exportFilteredCasesToExcel();
        else exportToExcel();
    });

    // Filter panel
    document.getElementById('filterBtn').addEventListener('click', toggleFilterPanel);
    document.getElementById('filterPeriod').addEventListener('change', updateCustomRangeVisibility);
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
    document.getElementById('filterSearch').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyFilters();
        }
    });

    // Add Case Category — opens a section/category-name form, which on
    // submit hands off to a "Are you sure?" panel rather than saving right
    // away; only the Yes button there actually calls the API.
    document.getElementById('openAddCaseCategoryBtn').addEventListener('click', openAddCaseCategoryModal);

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
    document.getElementById('closeAddCaseCategoryModal').addEventListener('click', closeAddCaseCategoryModal);
    document.getElementById('cancelAddCaseCategory').addEventListener('click', closeAddCaseCategoryModal);
    document.getElementById('addCaseCategoryForm').addEventListener('submit', handleAddCaseCategorySubmit);

    document.getElementById('closeConfirmAddCaseCategoryModal').addEventListener('click', cancelConfirmAddCaseCategory);
    document.getElementById('cancelConfirmAddCaseCategory').addEventListener('click', cancelConfirmAddCaseCategory);
    document.getElementById('confirmAddCaseCategoryYesBtn').addEventListener('click', confirmAddCaseCategory);

    // Close modals on outside click
    window.addEventListener('click', (e) => {
        const caseModal = document.getElementById('caseModal');
        const newCaseModal = document.getElementById('newCaseModal');
        const addCaseCategoryModal = document.getElementById('addCaseCategoryModal');
        const confirmAddCaseCategoryModal = document.getElementById('confirmAddCaseCategoryModal');
        if (e.target === caseModal) closeModal('caseModal');
        if (e.target === newCaseModal) newCaseModal.style.display = 'none';
        if (e.target === addCaseCategoryModal) closeAddCaseCategoryModal();
        if (e.target === confirmAddCaseCategoryModal) closeConfirmAddCaseCategoryModal();
    });
}

// sections is already loaded (loadReportData(), on page init) with the
// exact section list this report table itself is built from — reused here
// instead of a second fetch just to fill this dropdown.
function populateCaseCategorySectionOptions() {
    const select = document.getElementById('newCategorySection');
    select.innerHTML = '<option value="">Select a section</option>' +
        sections.map(s => `<option value="${s.sectionId}">${esc(s.sectionName)}</option>`).join('');
}

function openAddCaseCategoryModal() {
    document.getElementById('addCaseCategoryForm').reset();
    populateCaseCategorySectionOptions();
    openModal('addCaseCategoryModal');
}

function closeAddCaseCategoryModal() {
    closeModal('addCaseCategoryModal');
}

function closeConfirmAddCaseCategoryModal() {
    closeModal('confirmAddCaseCategoryModal');
}

// Just validates and swaps to the confirmation panel — the actual add
// happens in confirmAddCaseCategory() once the user picks "Yes" there.
function handleAddCaseCategorySubmit(e) {
    e.preventDefault();

    const sectionId = document.getElementById('newCategorySection').value;
    const categoryName = document.getElementById('newCategoryName').value.trim();
    if (!sectionId || !categoryName) return;

    closeAddCaseCategoryModal();
    openModal('confirmAddCaseCategoryModal');
}

// "No" backs out to the add form (values still filled in) rather than
// dropping the whole thing.
function cancelConfirmAddCaseCategory() {
    closeConfirmAddCaseCategoryModal();
    openModal('addCaseCategoryModal');
}

// Shares the same add_case_category endpoint the SDO Case Management pages
// use (api/get-case-section) — one source of truth for section/category
// creation instead of a second copy of that insert logic here.
async function confirmAddCaseCategory() {
    closeConfirmAddCaseCategoryModal();

    const sectionId = document.getElementById('newCategorySection').value;
    const categoryName = document.getElementById('newCategoryName').value.trim();
    if (!sectionId || !categoryName) return;

    const yesBtn = document.getElementById('confirmAddCaseCategoryYesBtn');
    yesBtn.disabled = true;

    try {
        const response = await fetch('../../api/get-case-section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_case_category', sectionId, categoryName })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message || 'Failed to add case category');

        showAlert('Case category added successfully!', 'success');
        document.getElementById('addCaseCategoryForm').reset();

        // Refresh the report table/filters so the new category shows up
        // immediately instead of only after a manual page reload.
        await loadReportData();
        visibleGrades = computeVisibleGrades();
        renderGradeHeader();
        buildCasesTable();
        populateFilterOptions();
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    } finally {
        yesBtn.disabled = false;
    }
}

/* ── Report Settings (per-school PDF header/footer) ── */

// Holds the full-resolution rendered PDF page between file-select and Save
// — the visible <canvas> is drawn at this same resolution (scaled down only
// via CSS), so cropping straight from it needs no re-render.
let reportLetterheadSourceCanvas = null;
let reportLetterheadOriginalFilename = '';

function openReportSettingsModal() {
    resetReportLetterheadEditor();
    renderReportLetterheadCurrentState();
    openModal('reportSettingsModal');
}

function closeReportSettingsModal() {
    closeModal('reportSettingsModal');
}

function renderReportLetterheadCurrentState() {
    const letterhead = getCurrentReportLetterhead();
    const currentBlock = document.getElementById('reportLetterheadCurrent');

    if (!letterhead) {
        currentBlock.style.display = 'none';
        return;
    }

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
    currentBlock.style.display = 'block';
}

function handleEditReportLetterheadCrop() {
    const letterhead = getCurrentReportLetterhead();
    if (!letterhead || !letterhead.sourceImage) {
        showNotification('This letterhead was saved before Edit Crop existed — upload the PDF again to re-adjust it.', 'error');
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
    img.onerror = () => showNotification('Could not load the saved letterhead image.', 'error');
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

// Choosing another PDF while the previous one is still rendering would draw
// both onto the same canvas, which pdf.js refuses ("Cannot use the same
// canvas during multiple render() operations") — the earlier render is
// cancelled and only the latest pick updates the editor.
let reportLetterheadSelection = 0;
let reportLetterheadRenderTask = null;

async function handleReportLetterheadFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const selection = ++reportLetterheadSelection;
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

        if (selection !== reportLetterheadSelection) return;
        if (reportLetterheadRenderTask) reportLetterheadRenderTask.cancel();

        const canvas = document.getElementById('reportLetterheadCanvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        reportLetterheadRenderTask = renderTask;
        await renderTask.promise;
        if (reportLetterheadRenderTask === renderTask) reportLetterheadRenderTask = null;
        if (selection !== reportLetterheadSelection) return;

        reportLetterheadSourceCanvas = canvas;
        document.getElementById('reportLetterheadEditor').style.display = 'block';
        updateReportLetterheadOverlays();
    } catch (err) {
        if (selection !== reportLetterheadSelection) return; // cancelled by a newer pick
        console.error('Error rendering PDF letterhead:', err);
        showNotification('Could not read that PDF — try a different file.', 'error');
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
        showNotification('Choose a PDF first.', 'error');
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
        // Also saves the full source render + exact slider percentages used
        // (not just the two final crops) so Edit Crop can re-slice this
        // same page later without asking for the PDF again.
        const [headerBlob, footerBlob, sourceBlob] = await Promise.all([
            canvasToPngBlob(headerCanvas),
            canvasToPngBlob(footerCanvas),
            canvasToPngBlob(reportLetterheadSourceCanvas)
        ]);
        await saveReportLetterhead(
            headerBlob, footerBlob,
            headerCanvas.width / headerCanvas.height,
            footerCanvas.width / footerCanvas.height,
            reportLetterheadOriginalFilename,
            sourceBlob, headerPctValue, footerPctValue
        );
        showNotification('Report header/footer saved!', 'success');
        resetReportLetterheadEditor();
        renderReportLetterheadCurrentState();
    } catch (err) {
        showNotification(err.message || 'Failed to save the report header/footer.', 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

async function handleDeleteReportLetterhead() {
    if (!confirm("Remove this school's report header & footer? Future exports go back to a plain title.")) return;

    try {
        await deleteReportLetterhead();
        showNotification('Report header/footer removed.', 'success');
        renderReportLetterheadCurrentState();
    } catch (err) {
        showNotification(err.message || 'Failed to delete the report header/footer.', 'error');
    }
}

// This quick-add form is a local note only — it doesn't have a real
// section/category selection (see the actual case workflow in
// counselor/counseling for that), so it can't safely bump the
// real per-category counts above without corrupting them with a fake type.
function submitNewCase() {
    const title = document.getElementById('caseTitle').value;
    const type = document.getElementById('caseType').value;
    const description = document.getElementById('caseDescription').value;
    const severity = document.getElementById('severity').value;

    if (!title || !type || !description || !severity) {
        alert('Please fill in all required fields');
        return;
    }

    const newNote = {
        id: `NOTE-${(currentSchool || 'SCHOOL').toUpperCase().replace(/\s+/g, '-')}-${Date.now()}`,
        title,
        type,
        description,
        severity,
        date: new Date().toLocaleDateString(),
        status: 'Active'
    };

    const storageKey = `coordinator_quick_notes_${currentSchool}`;
    const notes = JSON.parse(localStorage.getItem(storageKey) || '[]');
    notes.push(newNote);
    localStorage.setItem(storageKey, JSON.stringify(notes));

    document.getElementById('caseReportForm').reset();
    document.getElementById('newCaseModal').style.display = 'none';

    showNotification('Note saved. To log a real case with a category, use Case Management.');
}

// Two-row grade header (Grade N spanning Male/Female/Total), mirroring the
// on-page table instead of a single row like "Grade 7 - M" — those truncate
// to identical-looking "Grade 7 -" labels once column width is narrower
// than the full text. Feeds the PDF's autotable head directly; the Excel
// workbook builds its own equivalent header via real merged cells (see
// buildReportCasesWorkbook()).
function buildGradeHeaderRows() {
    const pdfHead = [
        [
            { content: 'Category of Cases', rowSpan: 2, styles: { valign: 'middle' } },
            ...visibleGrades.map(g => ({ content: `Grade ${g}`, colSpan: 3, styles: { halign: 'center' } })),
            { content: 'Overall Total', rowSpan: 2, styles: { valign: 'middle' } }
        ],
        visibleGrades.flatMap(() => ['Male', 'Female', 'Total'])
    ];
    return { pdfHead };
}

// Shared table shape used by both the PDF and Excel exporters
function buildExportTable() {
    const body = [];
    const sectionHeaderRows = [];
    const subtotalRows = [];

    displayRows.forEach(row => {
        if (row.type === 'header') {
            sectionHeaderRows.push(body.length);
            body.push([row.label, ...visibleGrades.flatMap(() => ['', '', '']), '']);
            return;
        }

        const totals = rowTotals(row);
        const rowCells = [row.label];
        let overallTotal = 0;
        visibleGrades.forEach(g => {
            const cell = totals[g] || { m: 0, f: 0 };
            const total = cell.m + cell.f;
            overallTotal += total;
            rowCells.push(cell.m, cell.f, total);
        });
        rowCells.push(overallTotal);

        if (row.type === 'subtotal') {
            subtotalRows.push(body.length);
        }
        body.push(rowCells);
    });

    return { body, sectionHeaderRows, subtotalRows };
}

function exportFileBaseName() {
    return `${reportRoleSlug()}-cases-${(currentSchool || 'school').replace(/\s+/g, '-')}-${localDateString()}`;
}

/* ---- Export preview modals — same "view before you download" flow as
   the analytics.js report exports, adapted here since the grade header
   uses merged cells (Excel) / rowSpan+colSpan (PDF) that a flat
   array-of-arrays preview can't represent faithfully. The live
   #reportCasesTable already renders that exact structure (only the
   visibleGrades columns, same header grouping), so it's cloned straight
   into the Excel preview instead of re-deriving it. ---- */
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
        <div class="modal-content" style="max-width:1100px; width:95%; height:82vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2><i class="bi bi-file-earmark-excel"></i> Excel Preview</h2>
                <button type="button" class="modal-close" id="excelPreviewCloseX">&times;</button>
            </div>
            <div class="modal-body" style="flex:1; overflow:auto;" id="excelPreviewBody"></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="excelPreviewCloseBtn">Close</button>
                <button type="button" class="btn btn-success" id="excelDownloadBtn"><i class="bi bi-download"></i> Download</button>
            </div>
        </div>
    </div>`);
    document.getElementById('excelPreviewCloseX').addEventListener('click', () => closeModal('excelPreviewModal'));
    document.getElementById('excelPreviewCloseBtn').addEventListener('click', () => closeModal('excelPreviewModal'));
}

function showExcelPreview(filename, tableEl, onDownload) {
    ensureExcelModal();
    const body = document.getElementById('excelPreviewBody');
    body.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'table-container';
    wrapper.appendChild(tableEl);
    body.appendChild(wrapper);
    document.getElementById('excelDownloadBtn').onclick = onDownload;
    openModal('excelPreviewModal');
}

// Generic thin border, reused by every cell in the built workbook.
const THIN_BORDER = {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
};

// Real cell colors/borders/merges on the downloaded .xlsx need actual
// style-writing, which the plain SheetJS build (the free "Community
// Edition", also loaded on this page for the Excel preview's live-table
// clone) can't do on write — CE dropped that years ago, which is why the
// old export came out as unstyled text with no visible header grouping.
// ExcelJS (ajax/libs/exceljs) still writes real styles, so the downloaded
// file is built with that instead — same pattern already used by
// sdo/district-report-cases.js's Category of Cases export.
function buildReportCasesWorkbook(body, sectionHeaderRows, subtotalRows, title, periodLabel) {
    const totalCols = 2 + visibleGrades.length * 3; // label + (Male/Female/Total per grade) + Overall Total
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report Cases');

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

    const headRow1 = 4;
    const headRow2 = 5;

    sheet.mergeCells(headRow1, 1, headRow2, 1);
    sheet.getCell(headRow1, 1).value = 'Category of Cases';

    sheet.mergeCells(headRow1, totalCols, headRow2, totalCols);
    sheet.getCell(headRow1, totalCols).value = 'Overall Total';

    let col = 2;
    visibleGrades.forEach(g => {
        sheet.mergeCells(headRow1, col, headRow1, col + 2);
        sheet.getCell(headRow1, col).value = `Grade ${g}`;
        sheet.getCell(headRow2, col).value = 'Male';
        sheet.getCell(headRow2, col + 1).value = 'Female';
        sheet.getCell(headRow2, col + 2).value = 'Total';
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

    let rowIndex = headRow2 + 1;
    body.forEach((row, i) => {
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
        rowIndex++;
    });

    sheet.getColumn(1).width = 34;
    for (let c = 2; c <= totalCols; c++) sheet.getColumn(c).width = 9;

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

// Export report as an Excel workbook (.xlsx)
function exportToExcel() {
    if (typeof ExcelJS === 'undefined') {
        showNotification('Excel export library failed to load.');
        return;
    }

    const filename = `${exportFileBaseName()}.xlsx`;
    const previewTable = document.getElementById('reportCasesTable').cloneNode(true);
    previewTable.removeAttribute('id');

    showExcelPreview(filename, previewTable, async () => {
        const { body, sectionHeaderRows, subtotalRows } = buildExportTable();
        const title = `Learners Personal-Social Concern - ${currentSchool || 'School'}`;
        const periodLabel = `Generated: ${new Date().toLocaleDateString()}`;

        const workbook = buildReportCasesWorkbook(body, sectionHeaderRows, subtotalRows, title, periodLabel);
        await downloadExcelJSWorkbook(workbook, filename);
        showNotification('Excel report exported successfully!');
    });
}

// Export report as a PDF document
function exportToPDF() {
    if (typeof window.jspdf === 'undefined') {
        showNotification('PDF export library failed to load.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const { body, sectionHeaderRows, subtotalRows } = buildExportTable();
    const { pdfHead } = buildGradeHeaderRows();

    const contentTop = reportLetterheadContentTop(doc);
    const pageCenterX = doc.internal.pageSize.getWidth() / 2;
    doc.setFontSize(14);
    doc.text(`Learners Personal-Social Concern - ${currentSchool || 'School'}`, pageCenterX, contentTop, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageCenterX, contentTop + 6, { align: 'center' });

    const letterheadMargin = reportLetterheadTableMargin(doc);
    doc.autoTable({
        head: pdfHead,
        body,
        startY: contentTop + 11,
        ...(letterheadMargin ? { margin: letterheadMargin } : {}),
        theme: 'grid',
        headStyles: { fillColor: [29, 90, 168], textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2 },
        didParseCell: (data) => {
            if (data.section !== 'body') return;
            if (sectionHeaderRows.includes(data.row.index)) {
                data.cell.styles.fillColor = [226, 232, 240];
                data.cell.styles.fontStyle = 'bold';
            } else if (subtotalRows.includes(data.row.index)) {
                data.cell.styles.fillColor = [241, 245, 249];
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    stampReportLetterhead(doc);
    showPdfPreview(doc, `${exportFileBaseName()}.pdf`);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 10px 35px rgba(59, 130, 246, 0.32);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
