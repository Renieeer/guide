// Teacher Referral Status Script

function initReferralStatus() {
    initPage();
    
    const params = new URLSearchParams(window.location.search);
    const referralId = params.get('id');

    // Fetch teacher's referrals from database
    fetchTeacherReferrals()
        .then(() => {
            if (referralId) {
                const referral = document.allReferralsData.find(r => r.id === parseInt(referralId) || r.referral_code === referralId);
                if (referral) {
                    loadReferralDetail(referral);
                } else {
                    loadReferralsList();
                }
            } else {
                loadReferralsList();
            }
        })
        .catch(error => {
            console.error('Error loading referrals:', error);
            showAlert('Error loading referrals. Please try again.', 'error');
        });
}

function fetchTeacherReferrals() {
    const user = getCurrentUser();
    const teacherSchool = user?.school_attended || '';
    const teacherId = user?.id || null;
    
    // Teachers can only see their own referrals
    const apiUrl = `../../api/referral?role=teacher&school=${encodeURIComponent(teacherSchool)}&user_id=${teacherId}`;
    
    return fetch(apiUrl)
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                document.allReferralsData = result.data || [];
            } else {
                throw new Error(result.message || 'Failed to fetch referrals');
            }
        });
}

function loadReferralDetail(referral) {
    // Show detail container
    document.getElementById('referralDetailContainer').style.display = 'block';
    document.getElementById('referralListContainer').style.display = 'none';

    // Populate details - use snake_case keys from database
    document.getElementById('refId').textContent = referral.referral_code || referral.id;
    document.getElementById('refStudentName').innerHTML = `${escapeHtml(referral.student_name)} ${referralRoleBadge(referral.referral_role)}`;
    document.getElementById('refGrade').textContent = referral.grade || 'N/A';
    document.getElementById('refDateSubmitted').textContent = formatDate(referral.date_submitted);
    document.getElementById('refUrgency').textContent = referral.urgency || 'normal';
    document.getElementById('refStatus').innerHTML = createBadge(referral.status);
    document.getElementById('refReason').textContent = referral.referral_reason;
    document.getElementById('refDescription').textContent = referral.description || 'No description provided';

    // Show/hide referral information section based on stage
    // Hide while counseling/follow-up is in progress (stages 4-6)
    const referralInfoSection = document.getElementById('referralInfoSection');
    if (referral.stage >= 4 && referral.stage < 7) {
        referralInfoSection.style.display = 'none';
    } else if (referral.stage === 7) {
        referralInfoSection.style.display = 'none'; // Hide info when showing acknowledgement
    } else {
        referralInfoSection.style.display = 'block'; // Show for stages 1-3
    }

    // Show acknowledgement form only when stage 7 (counseling complete/closed)
    const acknowledgementSection = document.getElementById('acknowledgementSection');
    if (referral.stage === 7) {
        acknowledgementSection.style.display = 'block';
        generateAcknowledgementForm(referral);
    } else {
        acknowledgementSection.style.display = 'none';
    }
}

function loadReferralsList() {
    const referrals = document.allReferralsData || [];
    const tbody = document.getElementById('referralListBody');

    if (referrals.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="8" style="text-align: center; padding: 30px; color: #999;">
                No referrals found. <a href="referral-form">Submit a new referral</a>
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = referrals.reverse().map(referral => `
        <tr>
            <td><strong>${referral.referral_code || referral.id}</strong></td>
            <td>${escapeHtml(referral.student_name)} ${referralRoleBadge(referral.referral_role)}</td>
            <td>${referral.grade || 'N/A'}</td>
            <td>${formatDate(referral.date_submitted)}</td>
            <td>${escapeHtml(referral.referral_reason)}</td>
            <td><strong>${referral.stage}/7</strong></td>
            <td>${createBadge(referral.status)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="selectReferral(${referral.id})">View</button>
            </td>
        </tr>
    `).join('');
}

function selectReferral(referralId) {
    const referral = (document.allReferralsData || []).find(r => r.id === referralId);
    if (referral) {
        window.history.pushState({}, '', `?id=${referral.referral_code || referralId}`);
        loadReferralDetail(referral);
    }
}

function exitReferralDetail() {
    window.history.pushState({}, '', 'referral-status');
    document.getElementById('referralDetailContainer').style.display = 'none';
    document.getElementById('referralListContainer').style.display = 'block';
    loadReferralsList();
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

// Must match ACKNOWLEDGEMENT_CHECKLIST_ITEMS in counselor/referral-status.js
const ACKNOWLEDGEMENT_CHECKLIST_ITEMS = [
    { key: 'closed_intake', label: 'Closed at Intake Interview' },
    { key: 'for_counseling', label: 'For Counseling' },
    { key: 'sessions_ongoing', label: 'Counseling Sessions are on-going' },
    { key: 'parent_conference', label: 'Parent/Guardian Conference Conducted' },
    { key: 'sessions_completed', label: 'Sessions Completed / Case Terminated' },
    { key: 'no_show', label: 'Student did not show up' },
    { key: 'under_monitoring', label: 'Under Monitoring' }
];

// This form is filled out once by the counselor after counseling ends
// (counselor/referral-status.js, stage 6) — the teacher only ever
// sees a read-only receipt of what was actually saved, never a blank
// fillable form of their own.
function generateAcknowledgementForm(referral) {
    const formDiv = document.getElementById('acknowledgementForm');
    formDiv.innerHTML = '<p class="text-muted" style="text-align:center;padding:30px;">Loading acknowledgement…</p>';

    fetch(`../../api/referral-acknowledgement?referral_id=${referral.id}`)
        .then(response => response.json())
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to load acknowledgement');
            renderAcknowledgementReadOnly(referral, result.data);
        })
        .catch(error => {
            console.error('Error loading acknowledgement:', error);
            formDiv.innerHTML = `<p class="text-danger" style="text-align:center;padding:30px;">Couldn't load the acknowledgement form: ${escapeHtml(error.message)}</p>`;
        });
}

function renderAcknowledgementReadOnly(referral, ack) {
    const formDiv = document.getElementById('acknowledgementForm');
    const studentName = escapeHtml(referral.student_name);

    if (!ack) {
        formDiv.innerHTML = `
            <div class="ack-sheet">
                <div class="ack-sheet-header">Counseling Referral Acknowledgement Form</div>
                <div class="ack-paragraph" style="text-align:center;color:var(--text-light);">
                    <i class="bi bi-hourglass-split" style="font-size:28px;display:block;margin-bottom:10px;"></i>
                    Your counselor hasn't completed this acknowledgement yet.<br>
                    It will appear here once counseling for <strong>${studentName}</strong> has ended.
                </div>
            </div>
        `;
        return;
    }

    const checklist = ack.checklist || {};
    const html = `
        <div class="ack-sheet">
            <div class="ack-sheet-header">Counseling Referral Acknowledgement Form</div>

            <div class="ack-row">
                <span class="ack-row-label">To:</span>
                <span class="ack-row-value">${studentName}</span>
                <span class="ack-row-caption">(Referring Person / Unit)</span>
            </div>
            <div class="ack-row">
                <span class="ack-row-label">Designation/Department:</span>
                <span class="ack-row-value">&nbsp;</span>
            </div>

            <div class="ack-paragraph">
                This is to confirm that <span class="ack-blank">${studentName}</span> whom
                you referred to us on <span class="ack-blank">${escapeHtml(formatDate(referral.date_submitted))}</span>
                had started his/her session on <span class="ack-blank">&nbsp;</span>
                and is being attended by <span class="ack-blank">${escapeHtml(ack.attended_by) || '&nbsp;'}</span>.
            </div>

            <div class="ack-checklist-heading">Kindly refer to the checklist below on the status of the case at hand.</div>
            <div class="ack-checklist">
                ${ACKNOWLEDGEMENT_CHECKLIST_ITEMS.map(item => `
                    <label class="ack-checklist-item">
                        <input type="checkbox" disabled ${checklist[item.key] ? 'checked' : ''}>
                        <span>${escapeHtml(item.label)}</span>
                    </label>
                `).join('')}
                <label class="ack-checklist-item">
                    <input type="checkbox" disabled>
                    <span>Number of follow-ups made by the Counselor: <span class="ack-checklist-blank"></span></span>
                </label>
                <label class="ack-checklist-item">
                    <input type="checkbox" disabled>
                    <span>Referred to <span class="ack-checklist-blank"></span></span>
                </label>
            </div>

            <div class="ack-thanks">
                <p>Thank you.</p>
                <p>Always for the welfare of students,</p>
            </div>

            <div class="ack-signature">
                <div class="ack-signature-line"></div>
                <p class="ack-signature-name">${escapeHtml(ack.counselor_name) || ''}</p>
                <p class="ack-signature-title">Attending Guidance Counselor</p>
            </div>

            <div class="ack-date-row">
                <span>Date:</span>
                <span class="ack-blank">&nbsp;</span>
            </div>
        </div>
    `;

    formDiv.innerHTML = html;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initReferralStatus);

