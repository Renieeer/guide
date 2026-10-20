// SDO School Reports — both sections run on real data from
// api/case-report.php. Export PDF/Excel produce a combined report (School
// Case & Gender Report + District Summary, mirroring both tables shown on
// screen) with a preview-before-download flow, matching the UX already
// established on the District Report Cases page.

const PERIOD_PARAM = { current: 'monthly', quarterly: 'quarterly', annual: 'annually' };
const PERIOD_LABEL = { current: 'Current Month', quarterly: 'Quarterly', annual: 'Annual' };

// Matches district-report-cases.js's table header blue, so exports from
// both SDO report pages look like one consistent system.
const REPORT_HEADER_COLOR = [29, 90, 168];

let generatedReports = [];

async function loadSchoolReports() {
    initPage();
    // Awaited so Export PDF never races this — sdoPdfContentTop()/
    // sdoPdfFooterReserve() fall back to the built-in DepEd sizing if it
    // hasn't resolved yet. Same division-wide override the "Report
    // Settings" gear on District Report Cases manages — read-only here.
    await loadSdoReportLetterheadOverride();
    loadDistrictOptions();
    loadSummaryReports();
}

function selectedDistrict() {
    return document.getElementById('districtSelect').value;
}

function selectedPeriodKey() {
    return document.getElementById('periodSelect').value;
}

// Real district list (schools.district, same source as the district report
// pages) instead of the old hardcoded "District 1".."District 11" — those
// never matched any real district value, so selecting one and generating
// always came back empty.
async function loadDistrictOptions() {
    const select = document.getElementById('districtSelect');
    let districts = [];
    try {
        const res = await fetch('../../api/case-report?action=districts').then(r => r.json());
        districts = (res.success && Array.isArray(res.districts)) ? res.districts : [];
        if (res.success && res.hasUnassigned) districts.push('Unassigned');
    } catch (error) {
        console.error('Error loading districts:', error);
    }
    select.innerHTML = '<option value="">All Districts</option>' +
        districts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
}

async function generateReport() {
    const district = selectedDistrict();
    const periodKey = selectedPeriodKey();

    try {
        const params = new URLSearchParams({ action: 'school_breakdown', district: district || 'all', period: PERIOD_PARAM[periodKey] });
        const res = await fetch(`../../api/case-report?${params.toString()}`).then(r => r.json());
        if (!res.success) {
            throw new Error(res.message || 'Failed to generate report');
        }

        generatedReports.unshift({
            id: Date.now(),
            district: district || 'All Districts',
            districtParam: district,
            periodKey,
            generatedAt: new Date()
        });
        renderGeneratedReports();
        showAlert(`Report generated for ${district || 'All Districts'} - ${PERIOD_LABEL[periodKey]}`, 'success');
    } catch (error) {
        console.error('Error generating report:', error);
        showAlert('Could not generate report: ' + error.message, 'error');
    }
}

function renderGeneratedReports() {
    const tbody = document.getElementById('reportsTableBody');

    if (generatedReports.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center p-5 text-muted">
                    <p>Generate a report to view results</p>
                    <button class="btn btn-primary mt-2" onclick="generateReport()">Generate Report</button>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = generatedReports.map(r => `
        <tr>
            <td>Case &amp; Gender Report</td>
            <td>${escapeHtml(r.district)}</td>
            <td>${escapeHtml(PERIOD_LABEL[r.periodKey])}</td>
            <td>${r.generatedAt.toLocaleString()}</td>
            <td><span class="badge badge-completed">Ready</span></td>
            <td style="white-space: nowrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="downloadGeneratedReport(${r.id}, 'pdf')"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="downloadGeneratedReport(${r.id}, 'excel')"><i class="bi bi-file-earmark-excel"></i> Excel</button>
            </td>
        </tr>
    `).join('');
}

function downloadGeneratedReport(id, format) {
    const report = generatedReports.find(r => r.id === id);
    if (!report) return;
    if (format === 'excel') previewReportExcel(report.districtParam, report.periodKey);
    else previewReportPdf(report.districtParam, report.periodKey);
}

// Top-level "Export PDF/Excel" — builds and previews a report for whatever's
// currently selected, without needing a prior "Generate" click.
function exportReport() {
    previewReportPdf(selectedDistrict(), selectedPeriodKey());
}

function exportReportExcel() {
    previewReportExcel(selectedDistrict(), selectedPeriodKey());
}

// Fetches both real data sources this report combines — the School Case &
// Gender breakdown (school_breakdown) and the District Summary rollup
// (district_summary) — scoped to whatever district/period was asked for,
// independent of whatever's currently loaded on screen.
async function fetchReportData(district, periodKey) {
    const breakdownParams = new URLSearchParams({ action: 'school_breakdown', district: district || 'all', period: PERIOD_PARAM[periodKey] });
    const summaryParams = new URLSearchParams({ action: 'district_summary', period: PERIOD_PARAM[periodKey] });

    const [breakdownRes, summaryRes] = await Promise.all([
        fetch(`../../api/case-report?${breakdownParams.toString()}`).then(r => r.json()),
        fetch(`../../api/case-report?${summaryParams.toString()}`).then(r => r.json())
    ]);

    if (!breakdownRes.success) throw new Error(breakdownRes.message || 'Failed to load case & gender data');
    if (!summaryRes.success) throw new Error(summaryRes.message || 'Failed to load district summary data');

    let districts = summaryRes.districts || [];
    if (district) {
        districts = districts.filter(d => d.district === district);
    }

    return { schools: breakdownRes.schools || [], districts };
}

/* ---- Export preview modals — same "view before you download" flow as
   district-report-cases.js's exports. ---- */
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

// Each sheet's aoa (array-of-arrays) is the exact shape written to its
// worksheet — row 0 is that sheet's title, a blank row (`[]`) marks the row
// right after it as a column-header row (rendered as <th>). Two sheets
// (Case & Gender Report, District Summary) are previewed stacked, each
// under its own heading, mirroring the actual workbook tabs.
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

/* ---- PDF build — two sections in one document: the school-level case &
   gender breakdown, then the district-level rollup, matching both tables
   already shown on this page instead of exporting only the first half. ---- */
function buildReportPdf(schools, districts, districtTitle, periodLabel) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const totals = schools.reduce((acc, s) => {
        acc.total += s.total; acc.male += s.male; acc.female += s.female;
        return acc;
    }, { total: 0, male: 0, female: 0 });

    const contentTop = sdoDrawReportTitle(doc, `School Reports - ${districtTitle}`, `Period: ${periodLabel}  |  Generated: ${new Date().toLocaleDateString()}`);
    const subheadingY = contentTop + 4;

    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text('School Case & Gender Report', doc.internal.pageSize.getWidth() / 2, subheadingY, { align: 'center' });

    doc.autoTable({
        head: [['School', 'District', 'Total Cases', 'Male', 'Female']],
        body: schools.length ? [
            ...schools.map(s => [s.school, s.district, s.total, s.male, s.female]),
            [
                { content: 'Overall Total', styles: { fontStyle: 'bold' } },
                '',
                { content: String(totals.total), styles: { fontStyle: 'bold' } },
                { content: String(totals.male), styles: { fontStyle: 'bold' } },
                { content: String(totals.female), styles: { fontStyle: 'bold' } }
            ]
        ] : [[{ content: 'No schools found.', colSpan: 5, styles: { halign: 'center', textColor: 130 } }]],
        startY: subheadingY + 4,
        margin: { top: sdoPdfContentTop(doc), bottom: sdoPdfFooterReserve(doc) },
        theme: 'grid',
        headStyles: { fillColor: REPORT_HEADER_COLOR, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        didParseCell: (data) => {
            if (data.section === 'body' && data.row.index === schools.length && schools.length > 0) {
                data.cell.styles.fillColor = [241, 245, 249];
            }
        }
    });

    const summaryStartY = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text('District Summary', 14, summaryStartY);

    doc.autoTable({
        head: [['District', 'Schools', 'Students Referred', 'Cases Resolved', 'Success Rate', 'Last Updated']],
        body: districts.length ? districts.map(d => {
            const successRate = d.studentsReferred > 0 ? Math.round((d.resolvedCount / d.studentsReferred) * 100) : 0;
            const lastDate = d.lastActivity ? new Date(d.lastActivity).toLocaleDateString() : 'No activity yet';
            return [d.district, d.schoolCount, d.studentsReferred, d.resolvedCount, `${successRate}%`, lastDate];
        }) : [[{ content: 'No districts found.', colSpan: 6, styles: { halign: 'center', textColor: 130 } }]],
        startY: summaryStartY + 4,
        margin: { top: sdoPdfContentTop(doc), bottom: sdoPdfFooterReserve(doc) },
        theme: 'grid',
        headStyles: { fillColor: REPORT_HEADER_COLOR, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 }
    });

    drawSdoPdfLetterhead(doc);

    return doc;
}

async function previewReportPdf(district, periodKey) {
    if (typeof window.jspdf === 'undefined') {
        showAlert('PDF export library failed to load.', 'error');
        return;
    }

    try {
        const { schools, districts } = await fetchReportData(district, periodKey);
        const districtTitle = district || 'All Districts';
        const periodLabel = PERIOD_LABEL[periodKey];

        const doc = buildReportPdf(schools, districts, districtTitle, periodLabel);
        const filename = `school_report_${districtTitle.replace(/\s+/g, '-')}_${periodKey}_${new Date().toISOString().split('T')[0]}.pdf`;
        showPdfPreview(doc, filename);
    } catch (error) {
        console.error('Error exporting report:', error);
        showAlert('Could not export report: ' + error.message, 'error');
    }
}

/* ---- Excel build — two sheets (workbook tabs) matching the PDF's two
   sections, instead of a single flat table. ---- */
function buildReportExcelSheets(schools, districts, districtTitle, periodLabel) {
    const totals = schools.reduce((acc, s) => {
        acc.total += s.total; acc.male += s.male; acc.female += s.female;
        return acc;
    }, { total: 0, male: 0, female: 0 });

    const caseGenderAoa = [
        [`School Case & Gender Report - ${districtTitle}`],
        [`Period: ${periodLabel}  |  Generated: ${new Date().toLocaleDateString()}`],
        [],
        ['School', 'District', 'Total Cases', 'Male', 'Female'],
        ...schools.map(s => [s.school, s.district, s.total, s.male, s.female]),
        ['Overall Total', '', totals.total, totals.male, totals.female]
    ];

    const summaryAoa = [
        [`District Summary - ${districtTitle}`],
        [`Period: ${periodLabel}  |  Generated: ${new Date().toLocaleDateString()}`],
        [],
        ['District', 'Schools', 'Students Referred', 'Cases Resolved', 'Success Rate', 'Last Updated'],
        ...districts.map(d => {
            const successRate = d.studentsReferred > 0 ? Math.round((d.resolvedCount / d.studentsReferred) * 100) : 0;
            const lastDate = d.lastActivity ? new Date(d.lastActivity).toLocaleDateString() : 'No activity yet';
            return [d.district, d.schoolCount, d.studentsReferred, d.resolvedCount, `${successRate}%`, lastDate];
        })
    ];

    return [
        { name: 'Case & Gender Report', aoa: caseGenderAoa, colWidths: [{ wch: 32 }, { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }] },
        { name: 'District Summary', aoa: summaryAoa, colWidths: [{ wch: 24 }, { wch: 10 }, { wch: 17 }, { wch: 15 }, { wch: 13 }, { wch: 16 }] }
    ];
}

// Real cell colors/borders need actual style-writing on the downloaded
// .xlsx, which the SheetJS build (used only for the aoa-based preview modal
// above) can't do on write — same tradeoff already accepted on
// district-report-cases.js's exports.
function buildReportExcelWorkbook(schools, districts, districtTitle, periodLabel) {
    const totals = schools.reduce((acc, s) => {
        acc.total += s.total; acc.male += s.male; acc.female += s.female;
        return acc;
    }, { total: 0, male: 0, female: 0 });

    const workbook = new ExcelJS.Workbook();
    const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5AA8' } };

    const addTitleRows = (sheet, totalCols, title, subtitle) => {
        sheet.mergeCells(1, 1, 1, totalCols);
        const titleCell = sheet.getCell(1, 1);
        titleCell.value = title;
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: 'center' };

        sheet.mergeCells(2, 1, 2, totalCols);
        const subCell = sheet.getCell(2, 1);
        subCell.value = subtitle;
        subCell.font = { size: 10, color: { argb: 'FF666666' } };
        subCell.alignment = { horizontal: 'center' };

        return 4;
    };

    // ---- Sheet 1: School Case & Gender Report ----
    const caseSheet = workbook.addWorksheet('Case & Gender Report');
    const caseCols = 5;
    const caseColWidths = [32, 24, 12, 10, 10];
    caseColWidths.forEach((w, i) => { caseSheet.getColumn(i + 1).width = w; });
    const caseHeadRow = addTitleRows(
        caseSheet, caseCols,
        `School Case & Gender Report - ${districtTitle}`,
        `Period: ${periodLabel}  |  Generated: ${new Date().toLocaleDateString()}`
    );

    ['School', 'District', 'Total Cases', 'Male', 'Female'].forEach((label, i) => {
        const cell = caseSheet.getCell(caseHeadRow, i + 1);
        cell.value = label;
        cell.fill = headFill;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = THIN_BORDER;
    });

    let r = caseHeadRow + 1;
    schools.forEach(s => {
        [s.school, s.district, s.total, s.male, s.female].forEach((value, c) => {
            const cell = caseSheet.getCell(r, c + 1);
            cell.value = value;
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle', horizontal: c === 0 || c === 1 ? 'left' : 'center', wrapText: true };
        });
        r++;
    });
    ['Overall Total', '', totals.total, totals.male, totals.female].forEach((value, c) => {
        const cell = caseSheet.getCell(r, c + 1);
        cell.value = value;
        cell.border = THIN_BORDER;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center' };
    });

    // ---- Sheet 2: District Summary ----
    const summarySheet = workbook.addWorksheet('District Summary');
    const summaryCols = 6;
    const summaryColWidths = [24, 10, 17, 15, 13, 16];
    summaryColWidths.forEach((w, i) => { summarySheet.getColumn(i + 1).width = w; });
    const summaryHeadRow = addTitleRows(
        summarySheet, summaryCols,
        `District Summary - ${districtTitle}`,
        `Period: ${periodLabel}  |  Generated: ${new Date().toLocaleDateString()}`
    );

    ['District', 'Schools', 'Students Referred', 'Cases Resolved', 'Success Rate', 'Last Updated'].forEach((label, i) => {
        const cell = summarySheet.getCell(summaryHeadRow, i + 1);
        cell.value = label;
        cell.fill = headFill;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = THIN_BORDER;
    });

    let sr = summaryHeadRow + 1;
    districts.forEach(d => {
        const successRate = d.studentsReferred > 0 ? Math.round((d.resolvedCount / d.studentsReferred) * 100) : 0;
        const lastDate = d.lastActivity ? new Date(d.lastActivity).toLocaleDateString() : 'No activity yet';
        [d.district, d.schoolCount, d.studentsReferred, d.resolvedCount, `${successRate}%`, lastDate].forEach((value, c) => {
            const cell = summarySheet.getCell(sr, c + 1);
            cell.value = value;
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center', wrapText: true };
        });
        sr++;
    });

    return workbook;
}

// Generic thin border, matching district-report-cases.js's own ExcelJS
// exports (this page didn't need one before it started writing real
// styled workbooks instead of a plain aoa-to-sheet grid).
const THIN_BORDER = {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
};

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

async function previewReportExcel(district, periodKey) {
    if (typeof ExcelJS === 'undefined') {
        showAlert('Excel export library failed to load.', 'error');
        return;
    }

    try {
        const { schools, districts } = await fetchReportData(district, periodKey);
        const districtTitle = district || 'All Districts';
        const periodLabel = PERIOD_LABEL[periodKey];

        const sheets = buildReportExcelSheets(schools, districts, districtTitle, periodLabel);
        const filename = `school_report_${districtTitle.replace(/\s+/g, '-')}_${periodKey}_${new Date().toISOString().split('T')[0]}.xlsx`;

        showExcelPreview(filename, sheets, async () => {
            const workbook = buildReportExcelWorkbook(schools, districts, districtTitle, periodLabel);
            await downloadExcelJSWorkbook(workbook, filename);
            showAlert('Excel report exported successfully!', 'success');
        });
    } catch (error) {
        console.error('Error exporting Excel report:', error);
        showAlert('Could not export report: ' + error.message, 'error');
    }
}

// Real per-district rollup from api/case-report (same source as
// sdo/analytics.js's comparative table) — schools/students
// referred/resolved/success-rate/last-updated, grouped by schools.district.
// Respects this page's own district/period filters instead of always
// showing all-time, every-district data regardless of the selection above.
function loadSummaryReports() {
    const tbody = document.getElementById('sampleReportsBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-5 text-muted">Loading district reports...</td></tr>';

    const district = selectedDistrict();
    const periodKey = selectedPeriodKey();
    const params = new URLSearchParams({ action: 'district_summary', period: PERIOD_PARAM[periodKey] });

    fetch(`../../api/case-report?${params.toString()}`)
        .then(response => response.json())
        .then(result => {
            if (!result.success) {
                throw new Error(result.message || 'Failed to load district reports');
            }
            let districts = result.districts || [];
            if (district) {
                districts = districts.filter(d => d.district === district);
            }
            renderSampleReports(districts);
        })
        .catch(error => {
            console.error('Error loading district reports:', error);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Unable to load district reports.</td></tr>';
        });
}

function renderSampleReports(districts) {
    const tbody = document.getElementById('sampleReportsBody');

    if (districts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No schools found.</td></tr>';
        return;
    }

    tbody.innerHTML = districts.map(row => {
        const successRate = row.studentsReferred > 0 ? Math.round((row.resolvedCount / row.studentsReferred) * 100) : 0;
        const lastDate = row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : 'No activity yet';

        return `
            <tr>
                <td><strong>${escapeHtml(row.district)}</strong></td>
                <td>${row.schoolCount}</td>
                <td>${row.studentsReferred}</td>
                <td>${row.resolvedCount}</td>
                <td><strong>${successRate}%</strong></td>
                <td>${lastDate}</td>
            </tr>
        `;
    }).join('');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', loadSchoolReports);
