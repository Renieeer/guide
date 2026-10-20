// Per-school PDF report header/footer ("Report Settings"). Mirrors
// sdo/sdo-report-letterhead.js's role (image-stamping + margin
// reservation for jsPDF/autoTable) but the images are fetched per-school
// from api/report-letterhead instead of being one hardcoded DepEd
// design. Loaded after jsPDF/autoTable, before report-case.js, since both
// exportToPDF() and exportFilteredCasesToPDF() call the functions below.

// Cached in-memory: { headerImage, headerRatio, footerImage, footerRatio,
// originalFilename, updatedAt } once loaded, or null if this school has
// never set one up — every function below no-ops back to today's plain
// title/table layout when this is null, so schools that never touch Report
// Settings see zero change.
let currentReportLetterhead = null;
let currentReportLetterheadSchoolCode = null;

const REPORT_LETTERHEAD_MARGIN = 14; // mm side margin, matches the table's own left/right margin
const REPORT_LETTERHEAD_IMAGE_TOP = 6; // mm from the page edge to the header image / up from the bottom edge to the footer image
const REPORT_LETTERHEAD_BAND_GAP = 6; // mm breathing room between an image band and the report's own title/table
const REPORT_LETTERHEAD_DEFAULT_TITLE_Y = 15; // today's hardcoded title y in report-case.js, kept as the no-letterhead fallback

// Resolves the session's free-text school_attended name to schools.school_code
// via the existing api/school-config (matches by school_code OR
// school_name) — report_letterhead is keyed by the stable code, not the name.
async function resolveReportLetterheadSchoolCode(schoolName) {
    if (!schoolName) return null;
    try {
        const res = await fetch(`../../api/school-config?action=config&school=${encodeURIComponent(schoolName)}`).then(r => r.json());
        return (res.success && res.school && res.school.schoolCode) || null;
    } catch (err) {
        console.error('Error resolving school code for report letterhead:', err);
        return null;
    }
}

// Called once from report-case.js's DOMContentLoaded, after currentSchool is
// known. Safe to call again later (e.g. after Save/Delete) to refresh the
// cache — always resolves the school code fresh rather than trusting a stale
// value across calls.
async function loadReportLetterhead(schoolName) {
    currentReportLetterheadSchoolCode = await resolveReportLetterheadSchoolCode(schoolName);
    currentReportLetterhead = null;

    if (!currentReportLetterheadSchoolCode) return null;

    try {
        const res = await fetch(`../../api/report-letterhead?action=get&school_code=${encodeURIComponent(currentReportLetterheadSchoolCode)}`).then(r => r.json());
        if (res.success && res.exists) {
            currentReportLetterhead = {
                headerImage: res.header_image,
                headerRatio: res.header_ratio,
                footerImage: res.footer_image,
                footerRatio: res.footer_ratio,
                // Null for a letterhead saved before "Edit Crop" existed —
                // the settings modal falls back to requiring a fresh PDF
                // upload in that case instead of offering Edit Crop.
                sourceImage: res.source_image || null,
                headerPct: res.header_pct,
                footerPct: res.footer_pct,
                originalFilename: res.original_filename,
                updatedAt: res.updated_at
            };
        }
    } catch (err) {
        console.error('Error loading report letterhead:', err);
    }

    return currentReportLetterhead;
}

function getCurrentReportLetterhead() {
    return currentReportLetterhead;
}

function getCurrentReportLetterheadSchoolCode() {
    return currentReportLetterheadSchoolCode;
}

// sourceBlob/headerPct/footerPct are what makes "Edit Crop" possible later
// without re-uploading the PDF — the full rendered page plus the exact
// slider percentages used, so a future edit can reload this same image and
// re-slice it. sourceBlob may be omitted (e.g. a very old caller) — the
// server just treats that letterhead as edit-by-reupload-only.
async function saveReportLetterhead(headerBlob, footerBlob, headerRatio, footerRatio, originalFilename, sourceBlob, headerPct, footerPct) {
    if (!currentReportLetterheadSchoolCode) {
        throw new Error('This account has no matching school_code — cannot save a report letterhead.');
    }

    const user = getCurrentUser();
    const formData = new FormData();
    formData.append('action', 'save');
    formData.append('school_code', currentReportLetterheadSchoolCode);
    formData.append('header_image', headerBlob, 'header.png');
    formData.append('footer_image', footerBlob, 'footer.png');
    formData.append('header_ratio', String(headerRatio));
    formData.append('footer_ratio', String(footerRatio));
    formData.append('header_pct', String(headerPct || 0));
    formData.append('footer_pct', String(footerPct || 0));
    formData.append('original_filename', originalFilename || '');
    formData.append('updated_by_id', (user && user.id) || '');
    if (sourceBlob) {
        formData.append('source_image', sourceBlob, 'source.png');
    }

    const res = await fetch('../../api/report-letterhead', { method: 'POST', body: formData }).then(r => r.json());
    if (!res.success) {
        throw new Error(res.message || 'Failed to save report letterhead');
    }

    await loadReportLetterhead(currentSchool);
    return res;
}

async function deleteReportLetterhead() {
    if (!currentReportLetterheadSchoolCode) return;

    const res = await fetch('../../api/report-letterhead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', school_code: currentReportLetterheadSchoolCode })
    }).then(r => r.json());

    if (!res.success) {
        throw new Error(res.message || 'Failed to delete report letterhead');
    }

    currentReportLetterhead = null;
    return res;
}

function reportLetterheadHeaderHeightMM(doc) {
    if (!currentReportLetterhead) return 0;
    const imgWidth = doc.internal.pageSize.getWidth() - REPORT_LETTERHEAD_MARGIN * 2;
    return imgWidth / currentReportLetterhead.headerRatio;
}

function reportLetterheadFooterHeightMM(doc) {
    if (!currentReportLetterhead) return 0;
    const imgWidth = doc.internal.pageSize.getWidth() - REPORT_LETTERHEAD_MARGIN * 2;
    return imgWidth / currentReportLetterhead.footerRatio;
}

// Where a report's own title should start — today's fixed 15 when no
// letterhead is set, otherwise right under the header image.
function reportLetterheadContentTop(doc) {
    if (!currentReportLetterhead) return REPORT_LETTERHEAD_DEFAULT_TITLE_Y;
    return REPORT_LETTERHEAD_IMAGE_TOP + reportLetterheadHeaderHeightMM(doc) + REPORT_LETTERHEAD_BAND_GAP;
}

// autoTable's `margin` option — deliberately returns null (meaning: pass no
// margin key at all) when no letterhead is set, rather than an explicit
// {top:0, bottom:0}, so every school that never touches Report Settings
// keeps today's exact default pagination margins.
function reportLetterheadTableMargin(doc) {
    if (!currentReportLetterhead) return null;
    return {
        top: reportLetterheadContentTop(doc),
        bottom: REPORT_LETTERHEAD_IMAGE_TOP + reportLetterheadFooterHeightMM(doc) + REPORT_LETTERHEAD_BAND_GAP
    };
}

// Stamps the header/footer image onto every page of a finished jsPDF
// document — call this LAST, right before showPdfPreview(), after autoTable
// has finished paginating, same convention as the SDO letterhead's
// drawSdoPdfLetterhead(). No-ops entirely when this school has no letterhead.
function stampReportLetterhead(doc) {
    if (!currentReportLetterhead) return;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgWidth = pageWidth - REPORT_LETTERHEAD_MARGIN * 2;
    const headerHeight = reportLetterheadHeaderHeightMM(doc);
    const footerHeight = reportLetterheadFooterHeightMM(doc);
    const pageCount = doc.internal.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.addImage(currentReportLetterhead.headerImage, 'PNG', REPORT_LETTERHEAD_MARGIN, REPORT_LETTERHEAD_IMAGE_TOP, imgWidth, headerHeight);
        doc.addImage(currentReportLetterhead.footerImage, 'PNG', REPORT_LETTERHEAD_MARGIN, pageHeight - REPORT_LETTERHEAD_IMAGE_TOP - footerHeight, imgWidth, footerHeight);
    }
    doc.setPage(pageCount);
}
