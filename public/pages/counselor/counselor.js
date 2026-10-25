// Counselor Dashboard Script

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

async function loadCounselorDashboard() {
    initPage();
    initSidebarActive();
    await refreshGradeScope();

    const user = getCurrentUser();
    const school = (user && user.school_attended) || '';
    const gradeScope = getCurrentGradeScope();

    loadReferralStats(school, gradeScope);
    loadWeekSessions(school);
}

function loadReferralStats(school, gradeScope) {
    const apiUrl = `../../api/referral?role=counselor&school=${encodeURIComponent(school)}&grade_scope=${encodeURIComponent(gradeScope)}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(result => {
            if (!result.success) {
                throw new Error(result.message || 'Failed to load referrals');
            }

            // Referrals only reach the counselor once they're past intake
            // (stage >= 3) — earlier stages are still with the teacher/coordinator.
            const assignedReferrals = (result.data || []).filter(r => r.stage >= 3);

            const active = assignedReferrals.filter(r => r.stage >= 4 && r.stage < 7).length;
            const followUps = assignedReferrals.filter(r => r.stage === 3).length;
            const totalStudents = assignedReferrals.length;

            document.getElementById('activeCases').textContent = active;
            document.getElementById('totalStudents').textContent = totalStudents;
            document.getElementById('followUps').textContent = followUps;

            // Already sorted newest-first by the API (date_submitted DESC).
            loadRecentReferrals(assignedReferrals.slice(0, 5));
        })
        .catch(error => {
            console.error('Error loading counselor dashboard referrals:', error);
            document.getElementById('activeCases').textContent = '—';
            document.getElementById('totalStudents').textContent = '—';
            document.getElementById('followUps').textContent = '—';
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
            <td colspan="6" style="text-align: center; padding: 30px; color: #999;">No referrals assigned yet</td>
        </tr>`;
        return;
    }

    tbody.innerHTML = referrals.map(referral => `
        <tr>
            <td><strong>${escapeHtml(referral.referral_code || referral.id)}</strong></td>
            <td>${escapeHtml(referral.student_name)}</td>
            <td>${escapeHtml(referral.referral_reason)}</td>
            <td>${formatDate(referral.date_submitted)}</td>
            <td>${createBadge(referral.status || getStatusLabel(referral.stage))}</td>
            <td>
                <a href="referral-status?id=${encodeURIComponent(referral.id)}" class="btn btn-sm btn-primary">View</a>
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

document.addEventListener('DOMContentLoaded', loadCounselorDashboard);

