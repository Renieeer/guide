// Counselor Student Feedback — read-only inbox of the star ratings and
// comments students left specifically for this counselor (see
// student/feedback.js's "Rate Counselor" tab). Backed by
// api/student-ratings.php, scoped to this counselor's own counselor_id —
// previously this read every rating in localStorage regardless of who it
// was actually for, since there was no real counselor attribution.

const STUDENT_RATINGS_API = '../../api/student-ratings';
let allRatings = [];

document.addEventListener('DOMContentLoaded', function() {
    initPage();
    initRatingsTab();
});

function initRatingsTab() {
    document.getElementById('ratingStarFilter').addEventListener('change', () => renderRatingsList(applyRatingFilters(allRatings)));
    document.getElementById('ratingSearchInput').addEventListener('input', () => renderRatingsList(applyRatingFilters(allRatings)));
    renderRatings();
}

async function renderRatings() {
    const user = getCurrentUser();
    const counselorId = user?.id || '';

    try {
        const response = await fetch(`${STUDENT_RATINGS_API}?counselor_id=${encodeURIComponent(counselorId)}`);
        const data = await response.json();
        allRatings = data.success ? data.data : [];
    } catch (error) {
        showAlert('Could not load your ratings: ' + error.message, 'error');
        allRatings = [];
    }

    renderRatingStats(allRatings);
    renderRatingsList(applyRatingFilters(allRatings));
}

function applyRatingFilters(ratings) {
    const starFilter = document.getElementById('ratingStarFilter').value;
    const search = document.getElementById('ratingSearchInput').value.trim().toLowerCase();

    return ratings.filter(r => {
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
            ${r.subjectLabel ? `<div class="review-counselor">${escapeHtml(r.subjectLabel)}</div>` : ''}
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

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
}
