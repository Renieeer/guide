// Student Feedback — star rating of how the counselor handled a specific
// counseling session or referral. Saved server-side via
// api/student-ratings (see counselor/student-feedback.js and
// coordinator/student-feedback.js for the read-only views), so a
// rating is visible to staff on any device, not just this browser. The
// session picker below reuses the same category -> specific-record data
// api/feedback (counseling cases) and api/referral (referrals)
// already expose — each item now also carries who actually handled it
// (counselor_id/counselor_name), so a rating is attributed to a real
// counselor instead of just a free-text subject label.

const STUDENT_RATINGS_API = '../../api/student-ratings';
const STAR_RATING_HINTS = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent'
};
const RATING_SUBJECT_LABELS = {
    counseling_case: 'Counseling Session',
    referral: 'Referral'
};

let selectedStarRating = 0;
let ratingSessionOptions = { counseling_case: [], referral: [] };

document.addEventListener('DOMContentLoaded', function() {
    initPage();
    setupStarRatingInput();
    setupEventListeners();
    loadRatingSessionOptions();
    renderMyRatings();
});

function setupEventListeners() {
    document.getElementById('ratingForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveRating();
    });
    document.getElementById('ratingSubjectType').addEventListener('change', populateRatingSubjectIdOptions);
    document.getElementById('clearRatingFormBtn').addEventListener('click', clearRatingForm);
}

function setupStarRatingInput() {
    const stars = document.querySelectorAll('#starRatingInput i');
    stars.forEach(star => {
        star.addEventListener('mouseenter', () => paintStars(Number(star.dataset.value)));
        star.addEventListener('mouseleave', () => paintStars(selectedStarRating));
        star.addEventListener('click', () => {
            selectedStarRating = Number(star.dataset.value);
            paintStars(selectedStarRating);
            document.getElementById('starRatingHint').textContent = STAR_RATING_HINTS[selectedStarRating] || '';
        });
    });
}

function paintStars(value) {
    document.querySelectorAll('#starRatingInput i').forEach(star => {
        const isFilled = Number(star.dataset.value) <= value;
        star.classList.toggle('is-filled', isFilled);
        star.classList.toggle('bi-star', !isFilled);
        star.classList.toggle('bi-star-fill', isFilled);
    });
}

// ============================================================
// Session picker — "What are you rating?" -> "Which one?", fed by the
// student's real counseling cases and referrals.
// ============================================================

async function loadRatingSessionOptions() {
    const user = getCurrentUser();
    if (!user) return;

    const school = user.school_attended || user.school || '';

    try {
        const response = await fetch(`../../api/feedback?action=options&student_id=${encodeURIComponent(user.id)}&school=${encodeURIComponent(school)}`);
        const data = await response.json();
        if (data.success) {
            ratingSessionOptions.counseling_case = (data.data.counseling_cases || []).map(c => ({
                subject_id: c.subject_id,
                label: c.label,
                counselor_id: c.counselor_id || '',
                counselor_name: c.counselor_name || ''
            }));
        }
    } catch (error) {
        showAlert('Could not load your counseling sessions: ' + error.message, 'error');
    }

    try {
        const response = await fetch(`../../api/referral?role=student&student_id=${encodeURIComponent(user.id)}&school=${encodeURIComponent(school)}`);
        const data = await response.json();
        if (data.success) {
            ratingSessionOptions.referral = (data.data || []).map(r => ({
                subject_id: String(r.id),
                label: `${r.referral_reason || 'Referral'} — ${formatDate(r.date_submitted)}`,
                counselor_id: r.counselor_id || '',
                counselor_name: r.counselor_name || ''
            }));
        }
    } catch (error) {
        showAlert('Could not load your referrals: ' + error.message, 'error');
    }

    updateRatingSubjectTypeAvailability();
}

function updateRatingSubjectTypeAvailability() {
    const typeSelect = document.getElementById('ratingSubjectType');
    let anyAvailable = false;
    Array.from(typeSelect.options).forEach(option => {
        const subjectType = option.value;
        if (!subjectType) return;
        const hasItems = (ratingSessionOptions[subjectType] || []).length > 0;
        option.disabled = !hasItems;
        const baseLabel = RATING_SUBJECT_LABELS[subjectType];
        option.textContent = hasItems ? baseLabel : `${baseLabel} (none yet)`;
        if (hasItems) anyAvailable = true;
    });

    document.getElementById('ratingForm').style.display = anyAvailable ? '' : 'none';
    document.getElementById('ratingEmptyState').style.display = anyAvailable ? 'none' : '';
}

function populateRatingSubjectIdOptions() {
    const subjectType = document.getElementById('ratingSubjectType').value;
    const idSelect = document.getElementById('ratingSubjectId');
    idSelect.innerHTML = '';

    if (!subjectType) {
        idSelect.disabled = true;
        idSelect.innerHTML = '<option value="">Select a category first</option>';
        return;
    }

    const items = ratingSessionOptions[subjectType] || [];
    if (items.length === 0) {
        idSelect.disabled = true;
        idSelect.innerHTML = '<option value="">No records found</option>';
        return;
    }

    idSelect.disabled = false;
    idSelect.innerHTML = '<option value="">Select one</option>' +
        items.map(item => `<option value="${escapeAttr(item.subject_id)}" data-counselor-id="${escapeAttr(item.counselor_id)}" data-counselor-name="${escapeAttr(item.counselor_name)}">${escapeHtml(item.label)}</option>`).join('');
}

// ============================================================
// Rating form save / clear
// ============================================================

function clearRatingForm() {
    document.getElementById('ratingForm').reset();
    document.getElementById('ratingSubjectId').innerHTML = '<option value="">Select a category first</option>';
    document.getElementById('ratingSubjectId').disabled = true;
    selectedStarRating = 0;
    paintStars(0);
    document.getElementById('starRatingHint').textContent = 'Click a star to rate';
}

async function saveRating() {
    const user = getCurrentUser();
    if (!user) return;

    const subjectType = document.getElementById('ratingSubjectType').value;
    const idSelect = document.getElementById('ratingSubjectId');
    const subjectId = idSelect.value;
    const comment = document.getElementById('ratingComment').value.trim();
    const anonymous = document.getElementById('ratingAnonymous').checked;

    if (!subjectType || !subjectId) {
        showAlert('Please select what this rating is about.', 'error');
        return;
    }
    if (selectedStarRating < 1) {
        showAlert('Please select a star rating.', 'error');
        return;
    }
    if (!comment) {
        showAlert('Please write a comment about your experience.', 'error');
        return;
    }

    const selectedOption = idSelect.options[idSelect.selectedIndex];
    const sessionLabel = selectedOption.textContent;
    const subjectLabel = `${RATING_SUBJECT_LABELS[subjectType]} — ${sessionLabel}`;

    try {
        const response = await fetch(STUDENT_RATINGS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId: user.id,
                studentName: user.name,
                schoolAttended: user.school_attended || user.school || '',
                subjectType,
                subjectId,
                subjectLabel,
                counselorId: selectedOption.dataset.counselorId || '',
                counselorName: selectedOption.dataset.counselorName || '',
                rating: selectedStarRating,
                comment,
                anonymous
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to submit rating');
        }

        clearRatingForm();
        renderMyRatings();
        showAlert('Thanks! Your rating has been submitted.');
    } catch (error) {
        showAlert('Could not submit your rating: ' + error.message, 'error');
    }
}

async function deleteRating(id) {
    if (!confirm('Delete this rating? This cannot be undone.')) return;

    const user = getCurrentUser();
    if (!user) return;

    try {
        const response = await fetch(`${STUDENT_RATINGS_API}?id=${encodeURIComponent(id)}&student_id=${encodeURIComponent(user.id)}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to delete rating');
        }
        renderMyRatings();
    } catch (error) {
        showAlert('Could not delete rating: ' + error.message, 'error');
    }
}

// ============================================================
// Rendering
// ============================================================

async function getMyRatings() {
    const user = getCurrentUser();
    if (!user) return [];
    try {
        const response = await fetch(`${STUDENT_RATINGS_API}?student_id=${encodeURIComponent(user.id)}`);
        const data = await response.json();
        return data.success ? data.data : [];
    } catch (error) {
        showAlert('Could not load your ratings: ' + error.message, 'error');
        return [];
    }
}

async function renderMyRatings() {
    const myRatings = await getMyRatings();
    renderRatingSummary(myRatings);
    renderMyRatingsHistory(myRatings);
}

function renderRatingSummary(myRatings) {
    const scoreEl = document.getElementById('ratingSummaryScore');
    const starsEl = document.getElementById('ratingSummaryStars');
    const metaEl = document.getElementById('ratingSummaryMeta');

    if (myRatings.length === 0) {
        scoreEl.textContent = '0.0';
        starsEl.innerHTML = starsHtml(0);
        metaEl.textContent = 'No ratings submitted yet';
        return;
    }

    const average = myRatings.reduce((sum, r) => sum + r.rating, 0) / myRatings.length;
    scoreEl.textContent = average.toFixed(1);
    starsEl.innerHTML = starsHtml(Math.round(average));
    metaEl.textContent = `Based on ${myRatings.length} rating${myRatings.length === 1 ? '' : 's'}`;
}

function renderMyRatingsHistory(myRatings) {
    const container = document.getElementById('myRatingsList');

    if (myRatings.length === 0) {
        container.innerHTML = '<div class="review-list-empty">You haven\'t rated a counseling session yet.</div>';
        return;
    }

    const sorted = [...myRatings].sort((a, b) => new Date(b.dateSent) - new Date(a.dateSent));
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
                ${r.anonymous ? '<span class="badge badge-empty">Sent Anonymously</span>' : '<span></span>'}
                <button type="button" class="btn btn-sm btn-danger" onclick="deleteRating('${r.id}')">
                    <i class="bi bi-trash"></i> Delete
                </button>
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

function escapeAttr(value) {
    return String(value ?? '').replace(/"/g, '&quot;');
}
