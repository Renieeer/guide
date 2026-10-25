// Combined Dashboard Script (Coordinator & Counselor)

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

async function loadCombinedDashboard() {
    initPage();
    initSidebarActive();
    await refreshGradeScope();

    const user = getCurrentUser();
    const school = (user && user.school_attended) || '';

    loadReferralStats(school);
    loadWeekSessions(school);
}

function loadReferralStats(school) {
    // `role=other-school` is required for the API to apply school/grade
    // scoping at all — without it the request falls through to an
    // unfiltered query (see other-school/referrals.js).
    const apiUrl = `../../api/referral?role=other-school&school=${encodeURIComponent(school)}&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(result => {
            if (!result.success) {
                throw new Error(result.message || 'Failed to load referrals');
            }
            const referrals = result.data || [];

            // Calculate statistics
            const active = referrals.filter(r => r.stage >= 3 && r.stage < 7).length;
            const followUps = referrals.filter(r => r.stage === 3 || r.stage === 4).length;
            const assignedReferrals = referrals.filter(r => r.stage >= 3);
            const totalStudents = assignedReferrals.length;
            // Coordinator's own dashboard stats (coordinator/coordinator.js
            // renderCoordinatorDashboard()) — the combined account gets these too.
            const total = referrals.length;
            const pending = referrals.filter(r => r.stage === 1 || r.stage === 2).length;
            const closed = referrals.filter(r => r.stage === 7).length;

            document.getElementById('activeCases').textContent = active;
            document.getElementById('totalStudents').textContent = totalStudents;
            document.getElementById('followUps').textContent = followUps;
            document.getElementById('totalReferrals').textContent = total;
            document.getElementById('pendingReferrals').textContent = pending;
            document.getElementById('closedCases').textContent = closed;

            // Already sorted newest-first by the API (date_submitted DESC).
            loadRecentReferrals(referrals.slice(0, 5));
        })
        .catch(error => {
            console.error('Error loading combined dashboard referrals:', error);
            document.getElementById('activeCases').textContent = '—';
            document.getElementById('totalStudents').textContent = '—';
            document.getElementById('followUps').textContent = '—';
            document.getElementById('totalReferrals').textContent = '—';
            document.getElementById('pendingReferrals').textContent = '—';
            document.getElementById('closedCases').textContent = '—';
            loadRecentReferrals([]);
        });
}

function loadWeekSessions(school) {
    const { start, end } = getCurrentWeekRange();
    const months = Array.from(new Set([start.slice(0, 7), end.slice(0, 7)]));

    Promise.all(months.map(month =>
        fetch(`../../api/schedule-events?school=${encodeURIComponent(school)}&month=${encodeURIComponent(month)}`)
            .then(response => response.json())
    ))
        .then(results => {
            const events = results.flatMap(result => (result.success && result.data) ? result.data : []);
            const weekCount = events.filter(ev => ev.date >= start && ev.date <= end).length;
            document.getElementById('weekSessions').textContent = weekCount;
        })
        .catch(error => {
            console.error('Error loading week sessions:', error);
            document.getElementById('weekSessions').textContent = '—';
        });
}

// Monday-through-Sunday range containing today, as YYYY-MM-DD strings.
function getCurrentWeekRange() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday .. 6 = Saturday
    const diffToMonday = (day === 0 ? -6 : 1 - day);

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return { start: localDateString(monday), end: localDateString(sunday) };
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
            <td>${escapeHtml(referral.teacher_name || 'N/A')}</td>
            <td>${createBadge(referral.status || getStatusLabel(referral.stage))}</td>
            <td>
                <a href="referrals?id=${encodeURIComponent(referral.id)}" class="btn btn-sm btn-primary">View</a>
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

// Logout functionality
document.getElementById('logoutBtn')?.addEventListener('click', requestLogout);

