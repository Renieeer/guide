// SDO Dashboard Script

// Initialize sidebar active state based on current page
function initSidebarActive() {
    // Get the current page filename
    const url = window.location.href;
    const currentFile = url.substring(url.lastIndexOf('/') + 1);
    
    // Get all sidebar menu links
    const menuLinks = document.querySelectorAll('.sidebar-menu a');
    
    // Remove active class from all and add to current page
    menuLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        
        // Match current file with link href
        if (href && url.includes(href)) {
            link.classList.add('active');
        }
    });
}

let sdoReferrals = [];
// District Performance table pagination — applied client-side on top of
// whatever loadDistrictSummary() last fetched (already filtered by the
// districtFilter dropdown above). 'all' page size disables paging entirely.
let allDistrictRows = [];
let districtPageSize = 20;
let districtCurrentPage = 1;

function loadSDODashboard() {
    initPage();
    initSidebarActive();

    // No role param: falls through to an unfiltered query, which is what
    // SDO/division-level oversight actually wants — every referral across
    // every school, not scoped to one.
    fetch('../../api/referral')
        .then(res => res.json())
        .then(referralResult => {
            if (!referralResult.success) {
                throw new Error(referralResult.message || 'Failed to load referrals');
            }
            sdoReferrals = referralResult.data || [];

            renderOverallStats();
        })
        .catch(error => {
            console.error('Error loading SDO dashboard:', error);
            ['totalReferrals', 'activeCases', 'resolutionRate', 'schoolsReporting']
                .forEach(id => { document.getElementById(id).textContent = '—'; });
        });

    loadDistrictOptions();
    loadDistrictSummary();

    // Setup district filter
    document.getElementById('districtFilter').addEventListener('change', loadDistrictSummary);

    document.getElementById('districtPageSizeFilter').addEventListener('change', (e) => {
        districtPageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
        districtCurrentPage = 1;
        applyDistrictPaginationAndRender();
    });

    document.getElementById('districtPagination').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        districtCurrentPage = btn.getAttribute('data-page') === 'next' ? districtCurrentPage + 1 : districtCurrentPage - 1;
        applyDistrictPaginationAndRender();
    });
}

// Real district list (schools.district), same source as the district report
// pages — the dropdown used to offer a fixed "District 1".."District 11"
// that never matched any real district value, so picking one changed
// nothing.
async function loadDistrictOptions() {
    const select = document.getElementById('districtFilter');
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

function renderOverallStats() {
    const total = sdoReferrals.length;
    const active = sdoReferrals.filter(r => r.stage >= 3 && r.stage < 7).length;
    const completed = sdoReferrals.filter(r => r.stage === 7).length;
    const resolutionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const schoolsReporting = new Set(
        sdoReferrals.map(r => r.school_attended || r.student_school).filter(Boolean)
    ).size;

    document.getElementById('totalReferrals').textContent = total;
    document.getElementById('activeCases').textContent = active;
    document.getElementById('resolutionRate').textContent = resolutionRate + '%';
    document.getElementById('schoolsReporting').textContent = schoolsReporting;
}

// Real per-district rollup from api/case-report (same source/shape as
// sdo/analytics.js and school-reports.js) — schools grouped by
// schools.district, referral/resolution counts from the referral table.
// Respects the district filter dropdown above instead of ignoring it.
function loadDistrictSummary() {
    const tbody = document.getElementById('districtTableBody');
    const selectedDistrict = document.getElementById('districtFilter').value;

    fetch('../../api/case-report?action=district_summary')
        .then(response => response.json())
        .then(result => {
            if (!result.success) {
                throw new Error(result.message || 'Failed to load district summary');
            }
            let rows = result.districts || [];
            if (selectedDistrict) {
                rows = rows.filter(d => d.district === selectedDistrict);
            }
            allDistrictRows = rows;
            districtCurrentPage = 1;
            applyDistrictPaginationAndRender();
        })
        .catch(error => {
            console.error('Error loading district summary:', error);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Unable to load district data.</td></tr>';
        });
}

function applyDistrictPaginationAndRender() {
    const totalPages = Math.max(1, Math.ceil(allDistrictRows.length / districtPageSize));
    if (districtCurrentPage > totalPages) districtCurrentPage = totalPages;
    if (districtCurrentPage < 1) districtCurrentPage = 1;

    const startIdx = districtPageSize === Infinity ? 0 : (districtCurrentPage - 1) * districtPageSize;
    const endIdx = districtPageSize === Infinity ? allDistrictRows.length : Math.min(startIdx + districtPageSize, allDistrictRows.length);

    renderDistrictSummary(allDistrictRows.slice(startIdx, endIdx));
    renderDistrictPagination(allDistrictRows.length, startIdx, endIdx, totalPages);
}

function renderDistrictPagination(totalFiltered, startIdx, endIdx, totalPages) {
    const el = document.getElementById('districtPagination');
    if (!el) return;

    if (totalFiltered === 0 || districtPageSize === Infinity || totalPages <= 1) {
        el.innerHTML = '';
        return;
    }

    el.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${districtCurrentPage <= 1 ? 'disabled' : ''}>
            <i class="bi bi-chevron-left"></i> Prev
        </button>
        <span class="accounts-page-info">Showing ${startIdx + 1}&ndash;${endIdx} of ${totalFiltered} &middot; Page ${districtCurrentPage} of ${totalPages}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${districtCurrentPage >= totalPages ? 'disabled' : ''}>
            Next <i class="bi bi-chevron-right"></i>
        </button>`;
}

function renderDistrictSummary(rows) {
    const tbody = document.getElementById('districtTableBody');

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No schools found.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(row => {
        const resolutionRate = row.referralCount > 0 ? Math.round((row.resolvedCount / row.referralCount) * 100) : 0;
        const lastActivity = row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : 'No activity yet';
        const status = row.referralCount === 0 ? 'Good' : (resolutionRate >= 70 ? 'Good' : 'Attention Needed');

        return `
            <tr>
                <td><strong>${escapeHtml(row.district)}</strong></td>
                <td>${row.schoolCount}</td>
                <td>${row.referralCount}</td>
                <td>${row.resolvedCount}</td>
                <td>${resolutionRate}%</td>
                <td>${lastActivity}</td>
                <td>${createBadge(status === 'Good' ? 'completed' : 'pending')}</td>
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

document.addEventListener('DOMContentLoaded', loadSDODashboard);

