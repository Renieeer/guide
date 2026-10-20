// Coordinator Student Feedback — read-only view of every counselor's star
// ratings and student comments at this school. Backed by
// api/student-ratings (see student/feedback.js for how a rating
// is submitted, and counselor/student-feedback.js for the
// counselor-facing inbox this was ported from), so a rating submitted from
// any student's device shows up here, and counselorName is the actual
// counselor who handled the rated case/referral, not just a subject label.

const STUDENT_RATINGS_API = '../../api/student-ratings';
let allRatings = [];

document.addEventListener('DOMContentLoaded', function() {
    initPage();
    initRatingsTab();
});

function initRatingsTab() {
    document.getElementById('ratingCounselorFilter').addEventListener('change', () => renderRatingsList(applyRatingFilters(allRatings)));
    document.getElementById('ratingStarFilter').addEventListener('change', () => renderRatingsList(applyRatingFilters(allRatings)));
    document.getElementById('ratingSearchInput').addEventListener('input', () => renderRatingsList(applyRatingFilters(allRatings)));
    renderRatings();
}

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

function renderRatingsList(ratings) {
    const container = document.getElementById('ratingsList');

    if (ratings.length === 0) {
        container.innerHTML = '<div class="review-list-empty">No ratings match your filters.</div>';
        return;
    }

    const sorted = [...ratings].sort((a, b) => new Date(b.dateSent) - new Date(a.dateSent));
    container.innerHTML = sorted.map(r => `
        <div class="review-card">
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
            </div>
        </div>
    `).join('');
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
