// Shared SDO report letterhead — stamps the official DepEd / Schools
// Division of Calapan City header (seal + agency names + office line) and
// footer (DepEd/Bagong Pilipinas/Division seals + address) onto every PDF
// export on the SDO side (Category of Cases, Division-Wide Summary, Cases
// by School, DMMR, School Reports), so every report type looks like it came
// from one consistent letterhead instead of a bare title. Excel exports on
// this same page intentionally do NOT get this letterhead (removed
// 2026-09-18 at the user's request) — only the PDF section below is live.
//
// Source artwork: sdo/sdo-report-assets.js (extracted from the
// official letterhead the user supplied — see that file's header comment).
// Requires that file loaded first (script order matters, both are plain
// globals, no module system on this page).
//
// Layout numbers here are all relative to the page's own measured size
// (doc.internal.pageSize) rather than hardcoded for one paper size, so the
// same code produces a correctly centered letterhead on Letter, Legal, A4,
// or any other "coupon bond" size/orientation a report happens to use.

const SDO_HEADER_LINES = [
    { text: 'Republic of the Philippines', bold: true, size: 11 },
    { text: 'Department of Education', bold: true, size: 11 },
    { text: 'SCHOOLS DIVISION OF CALAPAN CITY', bold: true, size: 12 }
];
const SDO_OFFICE_LINE = 'Office of the Schools Division Superintendent';
const SDO_FOOTER_ADDRESS_LINES = [
    'Hilltop, Calero, Calapan City',
    '(043) 288-1581  /  deped.calapan@deped.gov.ph'
];

// Known pixel aspect ratios of the source art (see sdo-report-assets.js) —
// used so every logo is drawn at a fixed target height without stretching.
// The 3 footer logos are pre-composed into one image (SDO_LOGO_FOOTER_
// COMBINED, DepEd + Bagong Pilipinas + Division seal side by side) rather
// than drawn as 3 separate images.
const SDO_LOGO_RATIOS = {
    sealHeader: 167 / 167,
    footerCombined: 548 / 130
};

/* ===================== Per-division custom override ===================== */
// SDO's "Report Settings" (district-report-cases.php) lets the division
// replace this whole hardcoded letterhead with one uploaded PDF, cropped
// into a header image + footer image client-side — exactly the same
// api/report-letterhead CRUD the coordinator role already uses per
// school, just keyed by this reserved sentinel instead of a real
// schools.school_code (that endpoint never validates the key against the
// schools table, so any distinctive string works as a division-wide slot).
const SDO_LETTERHEAD_SCHOOL_CODE = 'SDO-DIVISION';
const SDO_LETTERHEAD_MARGIN = 14; // mm side margin, matches this file's own `margin` locals below
const SDO_LETTERHEAD_IMAGE_TOP = 6; // mm from the page edge to the header image / up from the bottom edge to the footer image
const SDO_LETTERHEAD_BAND_GAP = 6; // mm breathing room between an image band and the report's own title/table

// Cached in-memory: same shape as the coordinator's currentReportLetterhead
// (headerImage/headerRatio/footerImage/footerRatio/sourceImage/headerPct/
// footerPct/originalFilename/updatedAt), or null if SDO has never replaced
// the built-in DepEd letterhead — every function below falls back to
// today's exact hardcoded design when this is null.
let sdoLetterheadOverride = null;

// Called once from district-report-cases.js's and school-reports.js's own
// init, before either page's first possible export.
async function loadSdoReportLetterheadOverride() {
    sdoLetterheadOverride = null;
    try {
        const res = await fetch(`../../api/report-letterhead?action=get&school_code=${encodeURIComponent(SDO_LETTERHEAD_SCHOOL_CODE)}`).then(r => r.json());
        if (res.success && res.exists) {
            sdoLetterheadOverride = {
                headerImage: res.header_image,
                headerRatio: res.header_ratio,
                footerImage: res.footer_image,
                footerRatio: res.footer_ratio,
                sourceImage: res.source_image || null,
                headerPct: res.header_pct,
                footerPct: res.footer_pct,
                originalFilename: res.original_filename,
                updatedAt: res.updated_at
            };
        }
    } catch (err) {
        console.error('Error loading SDO report letterhead override:', err);
    }
    return sdoLetterheadOverride;
}

function getCurrentSdoReportLetterhead() {
    return sdoLetterheadOverride;
}

// sourceBlob/headerPct/footerPct are what makes "Edit Crop" possible later
// without re-uploading the PDF — the full rendered page plus the exact
// slider percentages used, same convention as the coordinator's
// saveReportLetterhead() in coordinator/report-letterhead.js.
async function saveSdoReportLetterhead(headerBlob, footerBlob, headerRatio, footerRatio, originalFilename, sourceBlob, headerPct, footerPct) {
    const user = getCurrentUser();
    const formData = new FormData();
    formData.append('action', 'save');
    formData.append('school_code', SDO_LETTERHEAD_SCHOOL_CODE);
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
        throw new Error(res.message || 'Failed to save the report letterhead');
    }

    await loadSdoReportLetterheadOverride();
    return res;
}

// Removes the custom override — sdoDrawPdfHeader()/sdoDrawPdfFooter() then
// fall straight back to the built-in DepEd design, not to a blank band,
// since SDO always has *something* to show (unlike a school that never set
// one up at all).
async function deleteSdoReportLetterhead() {
    const res = await fetch('../../api/report-letterhead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', school_code: SDO_LETTERHEAD_SCHOOL_CODE })
    }).then(r => r.json());

    if (!res.success) {
        throw new Error(res.message || 'Failed to delete the report letterhead');
    }

    sdoLetterheadOverride = null;
    return res;
}

function sdoLetterheadHeaderHeightMM(doc) {
    const imgWidth = doc.internal.pageSize.getWidth() - SDO_LETTERHEAD_MARGIN * 2;
    return imgWidth / sdoLetterheadOverride.headerRatio;
}

function sdoLetterheadFooterHeightMM(doc) {
    const imgWidth = doc.internal.pageSize.getWidth() - SDO_LETTERHEAD_MARGIN * 2;
    return imgWidth / sdoLetterheadOverride.footerRatio;
}

/* ============================== PDF (jsPDF) ============================== */

// Reserved vertical space (mm) at the top/bottom of every page — every
// report's title/table must start below sdoPdfContentTop() and leave at
// least sdoPdfFooterReserve() clear at the bottom (pass as autoTable's
// `margin: { top: sdoPdfContentTop(doc), bottom: sdoPdfFooterReserve(doc) }`
// so multi-page tables reserve the same space on every continued page, not
// just the first).
// The default 58/26 below is the built-in DepEd design's real measured
// size: seal(6..22) + 3 text lines(~27..42.5) + double rule(~44) + office
// line(~50, baseline) -- measured empirically by rendering a test page, not
// just estimated, since a few mm short here means the report's own title
// overlaps "Office of the ... Superintendent". A custom override instead
// sizes these from its own image's aspect ratio.
function sdoPdfContentTop(doc) {
    if (!sdoLetterheadOverride) return 58;
    return SDO_LETTERHEAD_IMAGE_TOP + sdoLetterheadHeaderHeightMM(doc) + SDO_LETTERHEAD_BAND_GAP;
}

function sdoPdfFooterReserve(doc) {
    if (!sdoLetterheadOverride) return 26;
    return SDO_LETTERHEAD_IMAGE_TOP + sdoLetterheadFooterHeightMM(doc) + SDO_LETTERHEAD_BAND_GAP;
}

// Centers a report's own title + "Period: ... | Generated: ..." subtitle
// under the shared letterhead header above, instead of left-aligning at the
// page margin — every SDO PDF export (Category of Cases, Division-Wide
// Summary, Cases by School, DMMR, School Reports) calls this so all of them
// share one title layout instead of each hand-rolling its own doc.text()
// position/style.
//
// A title can run long once the Cases by School export appends its picked
// School Level/Section/Case Category (e.g. "... (Secondary, A. Behavioral
// or Conduct Problem, Membership of any Gang / Fraternity / Unsolicited
// Group)") — centering a single line that's wider than the page just clips
// it evenly off both edges instead of fixing anything, so the title is
// wrapped to fit the same margins as the letterhead's own rule line first.
// Returns the y (mm) where the caller's own content (usually an autoTable)
// should start, since a wrapped 2-3 line title pushes that down from the
// sdoPdfContentTop(doc) + 11 every caller uses.
function sdoDrawReportTitle(doc, title, subtitle) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const centerX = pageWidth / 2;
    const maxWidth = pageWidth - margin * 2;
    const titleLineHeight = 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0);
    const titleLines = doc.splitTextToSize(title, maxWidth);
    let y = sdoPdfContentTop(doc);
    titleLines.forEach(line => {
        doc.text(line, centerX, y, { align: 'center' });
        y += titleLineHeight;
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(subtitle, centerX, y, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);

    return y + 5;
}

function sdoDrawPdfHeader(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();

    // A custom override fully replaces the built-in design — image only,
    // no DepEd text layered on top of it (same mental model as the
    // coordinator's per-school letterhead: the uploaded design IS the
    // whole header band).
    if (sdoLetterheadOverride) {
        const imgWidth = pageWidth - SDO_LETTERHEAD_MARGIN * 2;
        const imgHeight = sdoLetterheadHeaderHeightMM(doc);
        doc.addImage(sdoLetterheadOverride.headerImage, 'PNG', SDO_LETTERHEAD_MARGIN, SDO_LETTERHEAD_IMAGE_TOP, imgWidth, imgHeight);
        return;
    }

    const centerX = pageWidth / 2;
    const margin = 14;

    const sealSize = 16;
    const sealX = centerX - sealSize / 2;
    const sealTop = 6;
    doc.addImage(SDO_LOGO_DEPED_SEAL, 'PNG', sealX, sealTop, sealSize, sealSize);

    let y = sealTop + sealSize + 5;
    SDO_HEADER_LINES.forEach(line => {
        doc.setFont('times', 'bold');
        doc.setFontSize(line.size);
        doc.setTextColor(0);
        doc.text(line.text, centerX, y, { align: 'center' });
        y += line.size === 12 ? 5.5 : 5;
    });

    y += 1.5;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    doc.line(margin, y + 0.8, pageWidth - margin, y + 0.8);

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(SDO_OFFICE_LINE, margin, y);

    // Reset state so the caller's own content (set right after this) isn't
    // left on whatever font/color the header last used.
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
}

function sdoDrawPdfFooter(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    if (sdoLetterheadOverride) {
        const imgWidth = pageWidth - SDO_LETTERHEAD_MARGIN * 2;
        const imgHeight = sdoLetterheadFooterHeightMM(doc);
        doc.addImage(sdoLetterheadOverride.footerImage, 'PNG', SDO_LETTERHEAD_MARGIN, pageHeight - SDO_LETTERHEAD_IMAGE_TOP - imgHeight, imgWidth, imgHeight);
        return;
    }

    const margin = 14;
    const ruleY = pageHeight - sdoPdfFooterReserve(doc);

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(margin, ruleY, pageWidth - margin, ruleY);
    doc.line(margin, ruleY + 0.8, pageWidth - margin, ruleY + 0.8);

    const logoTop = ruleY + 3;
    const logoHeight = 11;
    const logoWidth = logoHeight * SDO_LOGO_RATIOS.footerCombined;
    doc.addImage(SDO_LOGO_FOOTER_COMBINED, 'PNG', margin, logoTop, logoWidth, logoHeight);

    const textX = margin + logoWidth + 4;
    let textY = logoTop + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(40);
    SDO_FOOTER_ADDRESS_LINES.forEach(line => {
        doc.text(line, textX, textY);
        textY += 4.2;
    });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
}

// Stamps the header + footer onto every page of a finished jsPDF document.
// Call this LAST, right before showPdfPreview()/doc.save() — after
// autoTable has finished paginating the content, so doc.internal
// .getNumberOfPages() reflects the real, final page count.
function drawSdoPdfLetterhead(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        sdoDrawPdfHeader(doc);
        sdoDrawPdfFooter(doc);
    }
    doc.setPage(pageCount);
}

// Excel exports on the SDO side intentionally do NOT get this letterhead —
// removed 2026-09-18 at the user's request, back to a plain title/table
// like before. PDF exports above are unaffected.
