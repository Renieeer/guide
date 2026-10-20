// Combined Student Feedback — two tabs:
//  - Messages (Counselor feature): messenger-style reply UI, a conversation
//    list on the left, the active thread on the right. Backed by
//    api/feedback (?action=staff_list) and api/feedback-replies
//    (thread fetch + reply post).
//  - Ratings & Reviews (Coordinator feature): read-only view of every
//    counselor's star ratings and student comments at this school, backed
//    by api/student-ratings?school=... (see the "Ratings & Reviews"
//    section below), plus the counselor-inbox's own unread/read tracking
//    (a rating's is_read flag isn't per-viewer, so this account marking one
//    read here also clears it for whichever counselor it was actually for).

const FEEDBACK_TYPE_LABELS = {
    counseling_case: 'Counseling Session',
    appointment: 'Appointment',
    event: 'Calendar Event'
};

let allFeedback = [];
let openFeedbackId = null;

document.addEventListener('DOMContentLoaded', function() {
    initPage();
    loadFeedbackList();
    setupEventListeners();
    initRatingsTab();
    setupFeedbackSectionTabs();
});

// Messages / Ratings & Reviews tab switcher.
function setupFeedbackSectionTabs() {
    document.querySelectorAll('#feedbackSectionTabs .tab-button').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#feedbackSectionTabs .tab-button').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const section = tab.dataset.section;
            document.getElementById('messagesSection').style.display = section === 'messages' ? '' : 'none';
            document.getElementById('ratingsSection').style.display = section === 'ratings' ? '' : 'none';
        });
    });
}

function setupEventListeners() {
    document.getElementById('statusFilter').addEventListener('change', renderConversationList);

    document.getElementById('backToList').addEventListener('click', backToList);

    document.getElementById('threadReplyForm').addEventListener('submit', function(e) {
        e.preventDefault();
        sendReply();
    });

    // Enter sends, Shift+Enter inserts a newline — standard messenger
    // composer behavior.
    document.getElementById('threadReplyInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendReply();
        }
    });
}

function backToList() {
    document.getElementById('feedbackMessenger').classList.remove('is-showing-thread');
}

async function loadFeedbackList() {
    const user = getCurrentUser();
    if (!user) return;

    const school = user.school_attended || user.school || '';

    try {
        const response = await fetch(`../../api/feedback?action=staff_list&school=${encodeURIComponent(school)}`);
        const data = await response.json();
        allFeedback = data.success ? data.data : [];
    } catch (error) {
        showAlert('Could not load student feedback: ' + error.message, 'error');
        allFeedback = [];
    }

    renderConversationList();
}

function renderConversationList() {
    const container = document.getElementById('conversationListItems');
    const statusFilter = document.getElementById('statusFilter').value;

    const filtered = statusFilter
        ? allFeedback.filter(f => f.status === statusFilter)
        : allFeedback;

    if (filtered.length === 0) {
        container.innerHTML = '<div class="feedback-conversation-list-empty">No feedback found</div>';
        return;
    }

    container.innerHTML = filtered.map(f => {
        const isActive = f.id === openFeedbackId;
        const isUnread = f.status === 'new';
        const preview = f.last_message || f.message;
        return `
            <div class="conversation-item ${isActive ? 'is-active' : ''} ${isUnread ? 'is-unread' : ''}" onclick="selectConversation('${f.id}')">
                <div class="conversation-avatar">${escapeHtml(getInitials(f.student_name))}</div>
                <div class="conversation-info">
                    <div class="conversation-top-row">
                        <span class="conversation-name">${escapeHtml(f.student_name)}</span>
                        <span class="conversation-time">${formatConversationTime(f.last_activity_at)}</span>
                    </div>
                    <div class="conversation-subject">${escapeHtml(FEEDBACK_TYPE_LABELS[f.subject_type] || f.subject_type)}</div>
                    <div class="conversation-preview">${escapeHtml(preview)}</div>
                </div>
                ${isUnread ? '<span class="conversation-unread-dot"></span>' : ''}
            </div>
        `;
    }).join('');
}

async function selectConversation(feedbackId) {
    openFeedbackId = feedbackId;
    renderConversationList();

    document.getElementById('conversationEmpty').style.display = 'none';
    document.getElementById('conversationActive').classList.add('show');
    document.getElementById('feedbackMessenger').classList.add('is-showing-thread');
    document.getElementById('threadMessages').innerHTML = '';
    document.getElementById('threadReplyInput').value = '';

    await loadThread();
}

async function loadThread() {
    const user = getCurrentUser();
    if (!user || !openFeedbackId) return;

    const school = user.school_attended || user.school || '';

    try {
        const response = await fetch(`../../api/feedback-replies?feedback_id=${encodeURIComponent(openFeedbackId)}&school=${encodeURIComponent(school)}`);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to load conversation');
        }
        renderThread(data.data.feedback, data.data.messages);
    } catch (error) {
        showAlert(error.message || 'Failed to load conversation', 'error');
    }
}

function renderThread(feedback, messages) {
    const user = getCurrentUser();

    document.getElementById('threadSubjectLabel').textContent = feedback.student_name;
    document.getElementById('threadMeta').textContent =
        `${FEEDBACK_TYPE_LABELS[feedback.subject_type] || feedback.subject_type} — ${feedback.subject_label} · ${feedback.feedback_type}`;

    const openingBubble = {
        sender_account_id: feedback.student_account_id,
        sender_name: feedback.student_name,
        message: feedback.message,
        created_at: feedback.created_at
    };
    const allMessages = [openingBubble, ...messages];

    const container = document.getElementById('threadMessages');
    container.innerHTML = allMessages.map(m => {
        const mine = Number(m.sender_account_id) === Number(user.id);
        return `
            <div class="chat-bubble ${mine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}">
                <span class="chat-bubble-meta">${escapeHtml(m.sender_name)} · ${formatDate(m.created_at)}</span>
                <div class="chat-bubble-text">${escapeHtml(m.message)}</div>
            </div>
        `;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

async function sendReply() {
    const user = getCurrentUser();
    const input = document.getElementById('threadReplyInput');
    const message = input.value.trim();
    if (!message || !openFeedbackId) return;

    const school = user.school_attended || user.school || '';

    try {
        const response = await fetch('../../api/feedback-replies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                feedback_id: openFeedbackId,
                sender_role: user.role,
                sender_account_id: user.id,
                sender_name: user.name,
                message: message,
                school: school
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to send reply');
        }

        input.value = '';
        await loadThread();
        loadFeedbackList();
    } catch (error) {
        showAlert(error.message || 'Failed to send reply', 'error');
    }
}

function getInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function formatConversationTime(dateStr) {
    const date = new Date(dateStr);
    const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
}

/* ── Ratings & Reviews (Coordinator feature, + Counselor's unread tracking) ── */

const STUDENT_RATINGS_API = '../../api/student-ratings';
let allRatings = [];

function initRatingsTab() {
    document.getElementById('ratingCounselorFilter').addEventListener('change', () => renderRatingsList(applyRatingFilters(allRatings)));
    document.getElementById('ratingStarFilter').addEventListener('change', () => renderRatingsList(applyRatingFilters(allRatings)));
    document.getElementById('ratingSearchInput').addEventListener('input', () => renderRatingsList(applyRatingFilters(allRatings)));
    renderRatings();
}

// school=... (not counselor_id=...) — the combined account sees every
// counselor's ratings at this school, same as a standalone Coordinator.
async function renderRatings() {
    const user = getCurrentUser();
    const school = user?.school_attended || user?.school || '';

    try {
        const response = await fetch(`${STUDENT_RATINGS_API}?school=${encodeURIComponent(school)}`);
        const data = await response.json();
        allRatings = data.success ? data.data : [];
    } catch (error) {
        showAlert('Could not load student ratings: ' + error.message, 'error');
        allRatings = [];
    }

    renderRatingStats(allRatings);
    populateCounselorFilter(allRatings);
    renderRatingsList(applyRatingFilters(allRatings));
}

// Built from whatever counselors actually appear in the data, so a
// coordinator overseeing several counselors can narrow the list to just
// one — hidden entirely when there's only one (or none), since there'd be
// nothing to narrow down. Only run once per full data load (not on every
// filter change), so picking a counselor doesn't get wiped out by its own
// change event re-populating the list out from under the selection.
function populateCounselorFilter(ratings) {
    const select = document.getElementById('ratingCounselorFilter');
    const previousValue = select.value;

    const counselors = [...new Set(ratings.map(r => r.counselorName).filter(Boolean))].sort();

    select.innerHTML = '<option value="">All Counselors</option>' +
        counselors.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');

    select.style.display = counselors.length > 1 ? '' : 'none';
    select.value = counselors.includes(previousValue) ? previousValue : '';
}

function applyRatingFilters(ratings) {
    const counselorFilter = document.getElementById('ratingCounselorFilter').value;
    const starFilter = document.getElementById('ratingStarFilter').value;
    const search = document.getElementById('ratingSearchInput').value.trim().toLowerCase();

    return ratings.filter(r => {
        if (counselorFilter && (r.counselorName || '') !== counselorFilter) return false;
        if (starFilter && String(r.rating) !== starFilter) return false;
        if (search && !String(r.comment || '').toLowerCase().includes(search)) return false;
        return true;
    });
}

function renderRatingStats(ratings) {
    const avgStat = document.getElementById('ratingAvgStat');
    const avgMeta = document.getElementById('ratingAvgMeta');
    const countStat = document.getElementById('ratingCountStat');

    countStat.textContent = ratings.length;

    if (ratings.length === 0) {
        avgStat.innerHTML = '0.0 <i class="bi bi-star-fill"></i>';
        avgMeta.textContent = 'No ratings yet';
        return;
    }

    const average = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
    avgStat.innerHTML = `${average.toFixed(1)} <i class="bi bi-star-fill"></i>`;
    avgMeta.textContent = `Based on ${ratings.length} rating${ratings.length === 1 ? '' : 's'}`;
}

// Cards for an unread rating (Counselor's own inbox behavior) are
// highlighted and clickable-to-mark-read, same as counselor/
// student-feedback.js — is_read isn't per-viewer, so marking one read here
// also clears it for whichever counselor the rating was actually for.
function renderRatingsList(ratings) {
    const container = document.getElementById('ratingsList');

    if (ratings.length === 0) {
        container.innerHTML = '<div class="review-list-empty">No ratings match your filters.</div>';
        return;
    }

    const sorted = [...ratings].sort((a, b) => new Date(b.dateSent) - new Date(a.dateSent));
    container.innerHTML = sorted.map(r => `
        <div class="review-card ${r.read ? '' : 'is-unread'}" onclick="markRatingRead('${r.id}')">
            <div class="review-card-top">
                <div class="star-display">${starsHtml(r.rating)}</div>
                <span class="review-date">${formatDate(r.dateSent)}</span>
            </div>
            ${r.counselorName ? `<div class="review-counselor">${escapeHtml(r.counselorName)}</div>` : ''}
            ${r.subjectLabel ? `<div class="review-subject">${escapeHtml(r.subjectLabel)}</div>` : ''}
            <p class="review-comment">${escapeHtml(r.comment)}</p>
            <div class="review-card-footer">
                ${r.anonymous
                    ? '<span class="badge badge-empty">Anonymous</span>'
                    : `<span class="review-student-name">${escapeHtml(r.studentName || 'Unknown Student')}</span>`}
                ${r.read ? '' : '<span class="badge badge-in-progress">New</span>'}
            </div>
        </div>
    `).join('');
}

async function markRatingRead(id) {
    const target = allRatings.find(r => r.id === id);
    if (!target || target.read) return;

    target.read = true;
    renderRatingsList(applyRatingFilters(allRatings));

    try {
        const response = await fetch(STUDENT_RATINGS_API, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to mark rating as read');
        }
    } catch (error) {
        target.read = false;
        renderRatingsList(applyRatingFilters(allRatings));
        showAlert('Could not mark rating as read: ' + error.message, 'error');
    }
}

function starsHtml(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="bi ${i <= rating ? 'bi-star-fill' : 'bi-star'}"></i>`;
    }
    return html;
}
