// Coordinator Referrals Management Script

let currentReferral = null;
let allReferrals = [];

async function initReferralsPage() {
    initPage();
    await refreshGradeScope();

    const params = new URLSearchParams(window.location.search);
    const referralId = params.get('id');
    const statusParam = params.get('status');

    // Fetch referrals from database
    fetchCoordinatorReferrals()
        .then(() => {
            if (referralId) {
                const referral = allReferrals.find(r => r.id === parseInt(referralId) || r.referral_code === referralId);
                if (referral) {
                    loadReferralDetail(referral);
                } else {
                    loadReferralsList();
                }
            } else if (statusParam) {
                // Dashboard quick links use 'pending'/'active'/'completed';
                // 'active' maps to the 'in-progress' filter value (stages 3-6).
                const statusFilterValue = statusParam === 'active' ? 'in-progress' : statusParam;
                const statusFilterEl = document.getElementById('statusFilter');
                if ([...statusFilterEl.options].some(opt => opt.value === statusFilterValue)) {
                    statusFilterEl.value = statusFilterValue;
                }
                applyFilters();
            } else {
                loadReferralsList();
            }

            // Setup filter listeners
            document.getElementById('statusFilter').addEventListener('change', applyFilters);
            document.getElementById('urgencyFilter').addEventListener('change', applyFilters);
            document.getElementById('stageFilter').addEventListener('change', applyFilters);
        })
        .catch(error => {
            console.error('Error loading referrals:', error);
            showAlert('Error loading referrals. Please try again.', 'error');
        });
}

function fetchCoordinatorReferrals() {
    // Get user school using robust multi-source logic
    const getUserSchool = () => {
        try {
            const raw = sessionStorage.getItem('userInfo') || sessionStorage.getItem('user') || localStorage.getItem('currentUser') || localStorage.getItem('teacherSchool');
            if (!raw) return '';
            let parsed = null;
            try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
            if (parsed && typeof parsed === 'object') {
                return parsed.school_attended || parsed.school || '';
            }
            return '';
        } catch (e) {
            return '';
        }
    };
    const userSchool = getUserSchool();
    
    // Coordinators can see referrals from their school, scoped to their
    // assigned grade(s) if one is set (e.g. Grades 7-10).
    const apiUrl = `../../api/referral?role=coordinator&school=${encodeURIComponent(userSchool)}&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;
    
    return fetch(apiUrl)
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                allReferrals = result.data || [];
            } else {
                throw new Error(result.message || 'Failed to fetch referrals');
            }
        });
}

function loadReferralDetail(referral) {
    currentReferral = referral;

    document.getElementById('referralDetailView').style.display = 'block';
    document.getElementById('referralListView').style.display = 'none';

    // Populate details - use snake_case keys from database
    document.getElementById('detailRefId').textContent = referral.referral_code || referral.id;
    const detailStudentNameEl = document.getElementById('detailStudentName');
    detailStudentNameEl.textContent = referral.student_name;
    const detailRoleBadge = referralRoleBadge(referral.referral_role);
    if (detailRoleBadge) detailStudentNameEl.insertAdjacentHTML('beforeend', ' ' + detailRoleBadge);
    document.getElementById('detailStudentId').textContent = referral.student_id || 'N/A';
    document.getElementById('detailGrade').textContent = referral.grade || 'N/A';
    document.getElementById('detailAge').textContent = referral.age || 'N/A';
    document.getElementById('detailGender').textContent = referral.gender || 'N/A';
    document.getElementById('detailDateSubmitted').textContent = formatDate(referral.date_submitted);
    document.getElementById('detailUrgency').innerHTML = urgencyBadge(referral.urgency);
    document.getElementById('detailStatus').innerHTML = createBadge(referral.status || getStatusLabel(referral.stage));
    document.getElementById('detailStage').textContent = `${referral.stage}/7`;
    document.getElementById('detailStageNote').textContent = referral.stage_note ? ` — ${referral.stage_note}` : '';
    document.getElementById('detailDescription').textContent = referral.description || 'Not provided';
    document.getElementById('detailIntervention').textContent = referral.intervention_attempts || 'Not provided';
    document.getElementById('ovReason').textContent = referral.referral_reason || 'Not provided';
    document.getElementById('detailTeacherName').textContent = referral.teacher_name || 'Not provided';
    document.getElementById('detailTeacherSchool').textContent = referral.school_attended || 'Not provided';
    document.getElementById('detailTeacherContact').textContent = referral.teacher_contact || 'Not provided';
    document.getElementById('detailParent').textContent = referral.parent_guardian || 'Not provided';
    document.getElementById('detailContactNum').textContent = referral.parent_contact || 'Not provided';

    // Load stage progress
    loadStageProgress();

    // Load the Stage 2 assessment document (read-only — coordinators review it,
    // the counselor is the one who uploads it in referral-status.js/referrals.js).
    loadAssessmentFiles(referral.id);

    // Load coordinator actions
    loadCoordinatorActions();
}

// Same api/referral-assessment data and picture-preview rendering as
// counselor/referral-status.js and other-school/referrals.js's
// loadAssessmentFiles() — this copy is read-only, with no upload form.
function loadAssessmentFiles(referralId) {
    const container = document.getElementById('assessmentFileList');
    if (!container) return;
    container.innerHTML = '<p class="text-muted">Loading uploaded documents...</p>';

    fetch(`../../api/referral-assessment?referral_id=${referralId}`)
        .then(response => response.json())
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to load assessment documents');
            const rows = result.data || [];
            if (rows.length === 0) {
                container.innerHTML = '<p class="text-muted">No assessment document uploaded yet.</p>';
                return;
            }
            container.innerHTML = rows.map(row => {
                const ext = String(row.fileName || '').split('.').pop().toLowerCase();
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                // this.closest('a').nextElementSibling is the .file-chip fallback
                // right after the thumbnail link below — swapped in if the
                // image itself 404s, so a missing/broken file still reads as
                // a clean row instead of a broken-image icon.
                const preview = isImage
                    ? `<a href="${row.url}" target="_blank" rel="noopener" class="file-thumb-link"><img src="${row.url}" alt="${escapeHtml(row.fileName)}" class="file-thumb" onerror="this.closest('a').style.display='none'; this.closest('a').nextElementSibling.style.display='inline-flex';"></a><a href="${row.url}" target="_blank" rel="noopener" class="file-chip" style="display:none;"><i class="bi bi-file-earmark-image"></i> ${escapeHtml(row.fileName)}</a>`
                    : `<a href="${row.url}" target="_blank" rel="noopener" class="file-chip"><i class="bi bi-file-earmark-check"></i> ${escapeHtml(row.fileName)}</a>`;
                return `
                <div style="background:#f9fafb; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
                    ${preview}
                    <div><small class="text-muted">${((row.fileSize || 0) / 1024).toFixed(1)} KB • Uploaded by ${escapeHtml(row.uploadedBy || 'Unknown')} on ${formatDate(row.uploadedAt)}</small></div>
                </div>
            `;
            }).join('');
        })
        .catch(error => {
            container.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
        });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function loadStageProgress() {
    const container = document.getElementById('stageProgressContainer');
    container.innerHTML = createStageIndicator(currentReferral.stage);
}

function loadCoordinatorActions() {
    const container = document.getElementById('coordinatorActionsContainer');
    let html = '';

    if (currentReferral.stage < 7) {
        html += `<button class="btn btn-primary" onclick="openUpdateStageModal()">Update Stage</button>`;
    }

    if (currentReferral.stage === 7) {
        html += `<p style="color: #999; font-style: italic;">This case is closed. No further actions available.</p>`;
    } else {
        html += `<button class="btn btn-secondary" style="margin-left: 10px;" onclick="openRejectModal()">Reject Referral</button>`;
    }

    container.innerHTML = html;
}

function openUpdateStageModal() {
    document.getElementById('newStage').value = currentReferral.stage;
    openModal('updateStageModal');
}

function saveStageUpdate() {
    const newStage = parseInt(document.getElementById('newStage').value);
    const notes = document.getElementById('stageNotes').value.trim();
    const user = getCurrentUser();

    const apiUrl = `../../api/update-referral`;

    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            referral_id: currentReferral.id,
            stage: newStage,
            status: newStage === 7 ? 'completed' : (newStage === 1 || newStage === 2 ? 'pending' : 'in-progress'),
            stage_note: notes,
            counselor_id: user?.id || '',
            counselor_name: user?.name || ''
        })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            currentReferral = result.referral;
            closeModal('updateStageModal');
            showAlert('Referral stage updated successfully!', 'success');
            loadReferralDetail(currentReferral);
        } else {
            showAlert(result.message || 'Error updating stage', 'error');
        }
    })
    .catch(error => {
        console.error('Error updating stage:', error);
        showAlert('Error updating stage. Please try again.', 'error');
    });
}

function openRejectModal() {
    if (confirm('Are you sure you want to reject this referral? This action cannot be undone.')) {
        const apiUrl = `../../api/update-referral`;
        const user = getCurrentUser();

        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                referral_id: currentReferral.id,
                stage: 7,
                status: 'rejected',
                stage_note: 'Rejected',
                counselor_id: user?.id || '',
                counselor_name: user?.name || ''
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showAlert('Referral rejected successfully!', 'success');
                setTimeout(() => backToList(), 1500);
            } else {
                showAlert(result.message || 'Error rejecting referral', 'error');
            }
        })
        .catch(error => {
            console.error('Error rejecting referral:', error);
            showAlert('Error rejecting referral. Please try again.', 'error');
        });
    }
}

function backToList() {
    document.getElementById('referralDetailView').style.display = 'none';
    document.getElementById('referralListView').style.display = 'block';
    window.history.pushState({}, '', '?');
    loadReferralsList();
}

function loadReferralsList() {
    const tbody = document.getElementById('referralsTableBody');

    if (allReferrals.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="10" style="text-align: center; padding: 30px; color: #999;">No referrals found</td>
        </tr>`;
        return;
    }

    tbody.innerHTML = allReferrals.map(referral => `
        <tr>
            <td><strong>${referral.referral_code || referral.id}</strong></td>
            <td>${escapeHtml(referral.student_name)} ${referralRoleBadge(referral.referral_role)}</td>
            <td>${referral.grade || 'N/A'}</td>
            <td>${escapeHtml(referral.referral_reason)}</td>
            <td>${referral.teacher_name || 'Unknown'}</td>
            <td>${formatDate(referral.date_submitted)}</td>
            <td>${urgencyBadge(referral.urgency)}</td>
            <td>${referral.stage}/7</td>
            <td>${createBadge(referral.status || getStatusLabel(referral.stage))}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="selectReferral(${referral.id})">Review</button>
            </td>
        </tr>
    `).join('');
}

function selectReferral(referralId) {
    const referral = allReferrals.find(r => r.id === referralId);
    if (referral) {
        window.history.pushState({}, '', `?id=${referral.referral_code || referralId}`);
        loadReferralDetail(referral);
    }
}

function applyFilters() {
    const statusFilter = document.getElementById('statusFilter').value;
    const urgencyFilter = document.getElementById('urgencyFilter').value;
    const stageFilter = document.getElementById('stageFilter').value;

    let filtered = allReferrals;

    if (statusFilter) {
        filtered = filtered.filter(r => (r.status || getStatusLabel(r.stage)) === statusFilter);
    }

    if (urgencyFilter) {
        filtered = filtered.filter(r => (r.urgency || 'normal').toLowerCase() === urgencyFilter);
    }

    if (stageFilter) {
        filtered = filtered.filter(r => r.stage === parseInt(stageFilter));
    }

    const tbody = document.getElementById('referralsTableBody');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="10" style="text-align: center; padding: 30px; color: #999;">No referrals found</td>
        </tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(referral => `
        <tr>
            <td><strong>${referral.referral_code || referral.id}</strong></td>
            <td>${escapeHtml(referral.student_name)} ${referralRoleBadge(referral.referral_role)}</td>
            <td>${referral.grade || 'N/A'}</td>
            <td>${escapeHtml(referral.referral_reason)}</td>
            <td>${referral.teacher_name || 'Unknown'}</td>
            <td>${formatDate(referral.date_submitted)}</td>
            <td>${urgencyBadge(referral.urgency)}</td>
            <td>${referral.stage}/7</td>
            <td>${createBadge(referral.status || getStatusLabel(referral.stage))}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="selectReferral(${referral.id})">Review</button>
            </td>
        </tr>
    `).join('');
}

function clearFilters() {
    document.getElementById('statusFilter').value = '';
    document.getElementById('urgencyFilter').value = '';
    document.getElementById('stageFilter').value = '';
    loadReferralsList();
}

function getStatusLabel(stage) {
    const labels = {
        1: 'pending',
        2: 'pending',
        3: 'in-progress',
        4: 'in-progress',
        5: 'in-progress',
        6: 'in-progress',
        7: 'completed'
    };
    return labels[stage] || 'pending';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initReferralsPage);

