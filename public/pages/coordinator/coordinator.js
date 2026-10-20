// Coordinator Dashboard Script

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

async function loadCoordinatorDashboard() {
    initPage();
    initSidebarActive();
    await refreshGradeScope();

    const user = getCurrentUser();
    const school = (user && user.school_attended) || '';
    const gradeScope = getCurrentGradeScope();
    const apiUrl = `../../api/referral?role=coordinator&school=${encodeURIComponent(school)}&grade_scope=${encodeURIComponent(gradeScope)}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(result => {
            if (!result.success) {
                throw new Error(result.message || 'Failed to load referrals');
            }
            renderCoordinatorDashboard(result.data || []);
        })
        .catch(error => {
            console.error('Error loading coordinator dashboard:', error);
            ['totalReferrals', 'pendingReferrals', 'activeCases', 'closedCases']
                .forEach(id => { document.getElementById(id).textContent = '—'; });
            loadRecentReferrals([]);
        });
}

function renderCoordinatorDashboard(referrals) {
    // Calculate statistics
    const total = referrals.length;
    const pending = referrals.filter(r => r.stage === 1 || r.stage === 2).length;
    const active = referrals.filter(r => r.stage >= 3 && r.stage < 7).length;
    const closed = referrals.filter(r => r.stage === 7).length;

    // Update stats
    document.getElementById('totalReferrals').textContent = total;
    document.getElementById('pendingReferrals').textContent = pending;
    document.getElementById('activeCases').textContent = active;
    document.getElementById('closedCases').textContent = closed;

    // Already sorted newest-first by the API (date_submitted DESC).
    loadRecentReferrals(referrals.slice(0, 5));
}

function loadRecentReferrals(referrals) {
    const tbody = document.getElementById('recentReferralsBody');

    if (referrals.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="6" style="text-align: center; padding: 30px; color: #999;">No referrals yet</td>
        </tr>`;
        return;
    }

    tbody.innerHTML = referrals.map(referral => `
        <tr>
            <td><strong>${escapeHtml(referral.referral_code || referral.id)}</strong></td>
            <td>${escapeHtml(referral.student_name)}</td>
            <td>${escapeHtml(referral.referral_reason)}</td>
            <td>${escapeHtml(referral.teacher_name)}</td>
            <td>${createBadge(referral.status || getStatusLabel(referral.stage))}</td>
            <td>
                <a href="referrals?id=${encodeURIComponent(referral.id)}" class="btn btn-sm btn-primary">Review</a>
            </td>
        </tr>
    `).join('');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getStatusLabel(stage) {
    const labels = {
        1: 'pending',
        2: 'pending',
        3: 'in-progress',
        4: 'in-progress',
        5: 'in-progress',
        6: 'completed'
    };
    return labels[stage] || 'pending';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', loadCoordinatorDashboard);

