// Student Feedback — star rating of how the counselor handled a specific
// counseling session or referral. Saved server-side via
// api/student-ratings (see counselor/student-feedback.js and
// coordinator/student-feedback.js for the read-only views), so a
// rating is visible to staff on any device, not just this browser. The
// session picker below reuses the same category -> specific-record data
// api/feedback (counseling cases) and api/referral (referrals)
// already expose — each item also carries who actually handled it
// (counselor_id/counselor_name), so a rating is attributed to a real
// counselor instead of just a free-text subject label.
//
// Rules (also enforced by api/student-ratings):
//   - feedback opens once a session/referral has ENDED: a counseling case
//     the counselor closed, or a referral completed at Case Closing;
//   - one rating per session/referral — after that it can only be edited
//     (from Your Ratings History), not sent again or deleted.

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
// Ended sessions/referrals only — see loadRatingSessionOptions().
let ratingSessionOptions = { counseling_case: [], referral: [] };
let myRatings = [];
let optionsLoaded = false;
// Rating currently open for editing in Your Ratings History (null = none).
let editingRatingId = null;
let editStarValue = 0;

document.addEventListener('DOMContentLoaded', async function() {
    initPage();
    setupStarRatingInput();
    setupEventListeners();
    await Promise.all([loadRatingSessionOptions(), loadMyRatings()]);
    optionsLoaded = true;
    renderAll();
});

function setupEventListeners() {
    document.getElementById('ratingForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveRating();
    });
    document.getElementById('ratingSubjectType').addEventListener('change', populateRatingSubjectIdOptions);
    document.getElementById('clearRatingFormBtn').addEventListener('click', clearRatingForm);
    document.getElementById('myRatingsList').addEventListener('click', handleHistoryClick);
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

function paintStars(value, container = document.getElementById('starRatingInput')) {
    container.querySelectorAll('i[data-value]').forEach(star => {
        const isFilled = Number(star.dataset.value) <= value;
        star.classList.toggle('is-filled', isFilled);
        star.classList.toggle('bi-star', !isFilled);
        star.classList.toggle('bi-star-fill', isFilled);
    });
}

// ============================================================
// Session picker — "What are you rating?" -> "Which one?", fed by the
// student's ended counseling cases and referrals.
// ============================================================

function hasEnded(subjectType, item) {
    const status = String(item.status || '').trim().toLowerCase();
    if (subjectType === 'counseling_case') return status === 'closed';
    return Number(item.stage) >= 7 && status !== 'rejected';
}

async function loadRatingSessionOptions() {
    const user = getCurrentUser();
    if (!user) return;

    const school = user.school_attended || user.school || '';

    try {
        const response = await fetch(`../../api/feedback?action=options&student_id=${encodeURIComponent(user.id)}&school=${encodeURIComponent(school)}`);
        const data = await response.json();
        if (data.success) {
            ratingSessionOptions.counseling_case = (data.data.counseling_cases || [])
                .filter(c => hasEnded('counseling_case', c))
                .map(c => ({
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
            ratingSessionOptions.referral = (data.data || [])
                .filter(r => hasEnded('referral', r))
                .map(r => ({
                    subject_id: String(r.id),
                    label: `${r.referral_reason || 'Referral'} — ${formatDate(r.date_submitted)}`,
                    counselor_id: r.counselor_id || '',
                    counselor_name: r.counselor_name || ''
                }));
        }
    } catch (error) {
        showAlert('Could not load your referrals: ' + error.message, 'error');
    }
}

function isRated(subjectType, subjectId) {
    return myRatings.some(r => r.subjectType === subjectType && String(r.subjectId) === String(subjectId));
}

function unratedItems(subjectType) {
    return (ratingSessionOptions[subjectType] || []).filter(item => !isRated(subjectType, item.subject_id));
}

function updateRatingSubjectTypeAvailability() {
    const typeSelect = document.getElementById('ratingSubjectType');
    let anyUnrated = false;
    let anyEnded = false;

    Array.from(typeSelect.options).forEach(option => {
        const subjectType = option.value;
        if (!subjectType) return;
        const ended = (ratingSessionOptions[subjectType] || []).length;
        const open = unratedItems(subjectType).length;
        const baseLabel = RATING_SUBJECT_LABELS[subjectType];
        option.disabled = open === 0;
        option.textContent = ended === 0 ? `${baseLabel} (none ended yet)` : (open === 0 ? `${baseLabel} (all rated)` : baseLabel);
        if (ended > 0) anyEnded = true;
        if (open > 0) anyUnrated = true;
    });

    // A category that just ran out of unrated items can't stay selected.
    if (typeSelect.value && typeSelect.selectedOptions[0] && typeSelect.selectedOptions[0].disabled) {
        typeSelect.value = '';
    }
    populateRatingSubjectIdOptions();

    const emptyState = document.getElementById('ratingEmptyState');
    document.getElementById('ratingForm').style.display = anyUnrated ? '' : 'none';
    emptyState.style.display = anyUnrated ? 'none' : '';
    emptyState.textContent = anyEnded
        ? "You've already given feedback on every session and referral that has ended. You can edit your feedback in Your Ratings History below."
        : 'You can give feedback once a counseling session or referral has ended. None of yours has ended yet.';
}

function populateRatingSubjectIdOptions() {
    const subjectType = document.getElementById('ratingSubjectType').value;
    const idSelect = document.getElementById('ratingSubjectId');
    const previous = idSelect.value;
    idSelect.innerHTML = '';

    if (!subjectType) {
        idSelect.disabled = true;
        idSelect.innerHTML = '<option value="">Select a category first</option>';
        return;
    }

    const items = ratingSessionOptions[subjectType] || [];
    if (items.length === 0) {
        idSelect.disabled = true;
        idSelect.innerHTML = '<option value="">No ended sessions yet</option>';
        return;
    }

    // Already-rated ones stay listed (greyed out) so it's clear why they
    // can't be picked again.
    idSelect.disabled = false;
    idSelect.innerHTML = '<option value="">Select one</option>' +
        items.map(item => {
            const rated = isRated(subjectType, item.subject_id);
            return `<option value="${escapeAttr(item.subject_id)}" data-counselor-id="${escapeAttr(item.counselor_id)}" data-counselor-name="${escapeAttr(item.counselor_name)}"${rated ? ' disabled' : ''}>${escapeHtml(item.label)}${rated ? ' (already rated)' : ''}</option>`;
        }).join('');
    if (previous && items.some(i => String(i.subject_id) === previous && !isRated(subjectType, i.subject_id))) {
        idSelect.value = previous;
    }
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
    if (isRated(subjectType, subjectId)) {
        showAlert('You already rated this. You can edit your rating in Your Ratings History.', 'error');
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
        showAlert('Thanks! Your rating has been submitted.');
    } catch (error) {
        showAlert('Could not submit your rating: ' + error.message, 'error');
    }
    // Either way, refresh: a rejected duplicate means the list was stale.
    await loadMyRatings();
    renderAll();
}

// ============================================================
// Editing a rating (the only change allowed after sending it)
// ============================================================

function handleHistoryClick(e) {
    const editBtn = e.target.closest('[data-edit-rating]');
    if (editBtn) {
        const rating = myRatings.find(r => r.id === editBtn.dataset.editRating);
        if (!rating) return;
        editingRatingId = rating.id;
        editStarValue = rating.rating;
        renderMyRatingsHistory();
        const textarea = document.querySelector('#myRatingsList .review-edit-comment');
        if (textarea) textarea.focus();
        return;
    }

    const star = e.target.closest('.review-edit [data-value]');
    if (star) {
        editStarValue = Number(star.dataset.value);
        const box = star.closest('.review-edit');
        paintStars(editStarValue, box.querySelector('.star-rating-input'));
        box.querySelector('.star-rating-hint').textContent = STAR_RATING_HINTS[editStarValue] || '';
        return;
    }

    if (e.target.closest('[data-cancel-edit]')) {
        editingRatingId = null;
        renderMyRatingsHistory();
        return;
    }

    const saveBtn = e.target.closest('[data-save-edit]');
    if (saveBtn) saveRatingEdit(saveBtn);
}

async function saveRatingEdit(saveBtn) {
    const box = saveBtn.closest('.review-edit');
    const comment = box.querySelector('.review-edit-comment').value.trim();
    const anonymous = box.querySelector('.review-edit-anonymous').checked;

    if (editStarValue < 1) {
        showAlert('Please select a star rating.', 'error');
        return;
    }
    if (!comment) {
        showAlert('Please write a comment about your experience.', 'error');
        return;
    }

    saveBtn.disabled = true;
    try {
        const response = await fetch(STUDENT_RATINGS_API, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingRatingId, rating: editStarValue, comment, anonymous })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to update rating');
        }
        editingRatingId = null;
        showAlert('Your rating has been updated.');
        await loadMyRatings();
        renderAll();
    } catch (error) {
        saveBtn.disabled = false;
        showAlert('Could not update your rating: ' + error.message, 'error');
    }
}

// ============================================================
// Rendering
// ============================================================

async function loadMyRatings() {
    const user = getCurrentUser();
    if (!user) {
        myRatings = [];
        return;
    }
    try {
        const response = await fetch(`${STUDENT_RATINGS_API}?student_id=${encodeURIComponent(user.id)}`);
        const data = await response.json();
        myRatings = data.success ? data.data : [];
    } catch (error) {
        showAlert('Could not load your ratings: ' + error.message, 'error');
        myRatings = [];
    }
}

function renderAll() {
    renderRatingSummary();
    renderMyRatingsHistory();
    if (optionsLoaded) updateRatingSubjectTypeAvailability();
}

function renderRatingSummary() {
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

function renderMyRatingsHistory() {
    const container = document.getElementById('myRatingsList');

    if (myRatings.length === 0) {
        container.innerHTML = '<div class="review-list-empty">You haven\'t rated a counseling session yet.</div>';
        return;
    }

    const sorted = [...myRatings].sort((a, b) => new Date(b.dateSent) - new Date(a.dateSent));
    container.innerHTML = sorted.map(r => {
        const heading = `
            ${r.counselorName ? `<div class="review-counselor">${escapeHtml(r.counselorName)}</div>` : ''}
            ${r.subjectLabel ? `<div class="review-subject">${escapeHtml(r.subjectLabel)}</div>` : ''}`;

        if (r.id === editingRatingId) {
            return `
            <div class="review-card is-editing">
                ${heading}
                <div class="review-edit">
                    <label class="review-edit-label">Your Rating *</label>
                    <div class="star-rating-input" role="group" aria-label="Star rating">
                        ${[1, 2, 3, 4, 5].map(v => `<i class="bi ${v <= editStarValue ? 'bi-star-fill is-filled' : 'bi-star'}" data-value="${v}" title="${STAR_RATING_HINTS[v]}"></i>`).join('')}
                    </div>
                    <div class="star-rating-hint">${escapeHtml(STAR_RATING_HINTS[editStarValue] || '')}</div>
                    <label class="review-edit-label" for="reviewEditComment">Comment *</label>
                    <textarea id="reviewEditComment" class="review-edit-comment" rows="4">${escapeHtml(r.comment)}</textarea>
                    <label class="rating-checkbox-row">
                        <input type="checkbox" class="review-edit-anonymous"${r.anonymous ? ' checked' : ''}>
                        Submit anonymously
                    </label>
                    <div class="review-card-footer">
                        <span></span>
                        <span class="review-edit-actions">
                            <button type="button" class="btn btn-sm btn-secondary" data-cancel-edit>Cancel</button>
                            <button type="button" class="btn btn-sm btn-success" data-save-edit><i class="bi bi-check-lg"></i> Save changes</button>
                        </span>
                    </div>
                </div>
            </div>`;
        }

        return `
            <div class="review-card">
                <div class="review-card-top">
                    <div class="star-display">${starsHtml(r.rating)}</div>
                    <span class="review-date">${formatDate(r.dateSent)}${r.editedAt ? ` &middot; Edited ${formatDate(r.editedAt)}` : ''}</span>
                </div>
                ${heading}
                <p class="review-comment">${escapeHtml(r.comment)}</p>
                <div class="review-card-footer">
                    ${r.anonymous ? '<span class="badge badge-empty">Sent Anonymously</span>' : '<span></span>'}
                    <button type="button" class="btn btn-sm btn-primary" data-edit-rating="${escapeAttr(r.id)}">
                        <i class="bi bi-pencil-square"></i> Edit
                    </button>
                </div>
            </div>`;
    }).join('');
}

function starsHtml(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="bi ${i <= rating ? 'bi-star-fill' : 'bi-star'}"></i>`;
    }
    return html;
}

// escapeHtml() is the shared copy in js/utils.js.

function escapeAttr(value) { return escapeHtml(value); }
