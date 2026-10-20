// Student Dashboard
document.addEventListener('DOMContentLoaded', function() {
    initPage();
    loadDashboardData();
});

/* Mirrors resolveStudentId() in student-information.js — a logged-in
   student's own identifier can show up under several different keys
   depending on which login path/storage was used, so every plausible
   source is checked rather than assuming one shape. */
function parseStoredJson(storage, key) {
    try {
        return JSON.parse(storage.getItem(key) || '{}');
    } catch (e) {
        return {};
    }
}

function resolveOwnStudentId() {
    const storedUser = parseStoredJson(sessionStorage, 'user');
    const storedUserInfo = parseStoredJson(sessionStorage, 'userInfo');
    const storedCurrentUser = parseStoredJson(localStorage, 'currentUser');

    const candidates = [
        storedUser.studentId, storedUser.StudentId, storedUser.student_id, storedUser.id,
        storedUserInfo.studentId, storedUserInfo.StudentId, storedUserInfo.student_id, storedUserInfo.id,
        storedCurrentUser.studentId, storedCurrentUser.StudentId, storedCurrentUser.student_id, storedCurrentUser.id,
        sessionStorage.getItem('studentId'), sessionStorage.getItem('StudentId')
    ];

    const found = candidates.find(value => String(value ?? '').trim() !== '');
    return found ? String(found).trim() : '';
}

function loadDashboardData() {
    const studentId = resolveOwnStudentId();

    if (!studentId) {
        console.warn('No student id found — cannot load dashboard data');
        displayReferralProgress([]);
        loadActivityFeed({});
        return;
    }

    fetch(`../../api/student-history?student_id=${encodeURIComponent(studentId)}&role=student`)
        .then(response => response.json())
        .then(result => {
            if (!result.success) {
                console.error('Error loading dashboard data:', result.message);
                displayReferralProgress([]);
                loadActivityFeed({});
                return;
            }

            const data = result.data || {};
            const counts = result.counts || {};

            document.getElementById('referralCount').textContent = counts.referrals || 0;
            document.getElementById('appointmentCount').textContent = counts.appointments || 0;
            document.getElementById('historyCount').textContent =
                (counts.referrals || 0) + (counts.counseling || 0) + (counts.follow_ups || 0) + (counts.appointments || 0);

            displayReferralProgress(data.referrals || []);
            loadActivityFeed(data);
        })
        .catch(error => {
            console.error('Error loading dashboard data:', error);
            displayReferralProgress([]);
            loadActivityFeed({});
        });
}

function displayReferralProgress(referrals) {
    const preview = document.getElementById('referralProgressPreview');
    const viewLink = document.getElementById('viewReferralsLink');

    if (referrals.length === 0) {
        preview.innerHTML = '<p style="color: #999; margin: 0; text-align: center;">No referrals yet</p>';
        if (viewLink) viewLink.href = 'referral-status';
        return;
    }

    // Show quick progress for most recent (i.e. currently active) referral,
    // and send "View Referrals" straight to that case instead of the bare list.
    const latest = referrals[0];
    if (viewLink && latest.id) {
        viewLink.href = `referral-status?ref=${encodeURIComponent(latest.id)}`;
    }
    const currentStage = parseInt(latest.stage || latest.progress_stage || 1) || 1;
    const progress = (currentStage / 7) * 100;

    const stageLabels = {
        1: 'Interview/Background',
        2: 'Initial Risk Assessment',
        3: 'Parent Call-up/Consent',
        4: 'Intervention',
        5: 'Counseling',
        6: 'Student Follow-up',
        7: 'Case Closing'
    };

    const statusColor = getProgressColor(latest.status);

    preview.innerHTML = `
        <div style="margin-bottom: 8px; text-align: center;">
            <small style="color: #6b7280; display: block; margin-bottom: 8px;">Latest: ${latest.referral_reason || latest.reason || 'Referral'}</small>
            <div style="height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                <div style="height: 100%; width: ${progress}%; background: ${statusColor}; transition: width 0.3s ease;"></div>
            </div>
            <small style="color: #6b7280; display: block;">
                <strong>Stage ${currentStage}/7</strong> - ${stageLabels[currentStage] || 'In Progress'}
            </small>
        </div>
    `;
}

function getProgressColor(status) {
    const colors = {
        'pending': '#f59e0b',
        'in-progress': '#3b82f6',
        'completed': '#10b981',
        'rejected': '#ef4444'
    };
    return colors[status?.toLowerCase?.()] || colors[status] || '#6b7280';
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
}

function formatActivityDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* Merges referrals, counseling cases, follow-ups, and appointments into one
   chronological feed — each type has its own date field, so everything is
   normalized to {date, icon, title, meta} before sorting and rendering. */
function loadActivityFeed(data) {
    const feed = document.getElementById('activityFeed');
    const items = [];

    (data.referrals || []).forEach(r => {
        items.push({
            date: r.date_submitted,
            icon: 'bi-clipboard-data',
            color: '#3b82f6',
            title: r.referral_reason || 'Referral submitted',
            meta: `Referral · Stage ${r.stage || 1}/6 · ${r.status || 'pending'}`
        });
    });

    (data.counseling || []).forEach(c => {
        items.push({
            date: c.case_date || c.created_at,
            icon: 'bi-chat-square-text',
            color: '#8b5cf6',
            title: c.case_title || c.section_name || 'Counseling session',
            meta: `Counseling · ${c.status || 'pending'}`
        });
    });

    (data.follow_ups || []).forEach(f => {
        items.push({
            date: f.follow_up_date || f.created_at,
            icon: 'bi-calendar-check',
            color: '#10b981',
            title: f.category_name || f.case_title || 'Follow-up session',
            meta: 'Counseling Follow-Up'
        });
    });

    (data.appointments || []).forEach(a => {
        items.push({
            date: a.preferred_date,
            icon: 'bi-calendar-day',
            color: '#ec4899',
            title: a.reason || 'Appointment request',
            meta: `Online Appointment · ${a.status || 'pending'}`
        });
    });

    if (items.length === 0) {
        feed.innerHTML = '<p style="text-align: center; color: #999; padding: 30px;">No recent activity</p>';
        return;
    }

    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    feed.innerHTML = items.slice(0, 8).map(item => `
        <div style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 4px; border-bottom: 1px solid #f1f5f9;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${item.color}1a; color: ${item.color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="bi ${item.icon}"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${escapeHtml(item.title)}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(item.meta)}</div>
            </div>
            <div style="font-size: 12px; color: #9ca3af; white-space: nowrap;">${escapeHtml(formatActivityDate(item.date))}</div>
        </div>
    `).join('');
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', requestLogout);
