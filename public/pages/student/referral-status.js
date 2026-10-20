// Student Referral Status
document.addEventListener('DOMContentLoaded', function() {
    initPage();
    loadReferrals();
    setupEventListeners();
});

function loadReferrals() {
    // Try multiple storage keys for compatibility
    let user = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
    if (!user.id && !user.first_name) {
        user = JSON.parse(sessionStorage.getItem('user') || '{}');
    }
    
    const userSchool = user?.school_attended || '';
    const studentName = user?.name || (user.first_name ? `${user.first_name} ${user.last_name}` : '');
    const studentId = user?.id;
    
    if (!studentName && !studentId) {
        console.error('ERROR: No student name or ID found');
        document.getElementById('referralsTableBody').innerHTML = 
            '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #999;">Unable to load referrals. Please log in again.</td></tr>';
        return;
    }

    // Build API URL with available data - prioritize student_id
    let apiUrl = `../../api/referral?role=student`;
    if (studentId) {
        apiUrl += `&student_id=${encodeURIComponent(studentId)}`;
    }
    if (studentName) {
        apiUrl += `&student_name=${encodeURIComponent(studentName)}`;
    }
    if (userSchool) {
        apiUrl += `&school=${encodeURIComponent(userSchool)}`;
    }
    
    fetch(apiUrl)
        .then(response => response.json())
        .then(result => {
            
            // Show the actual SQL query for debugging
            if (result.query_params) {
                
                // Show what we were searching for vs what exists
                
                // Show what's actually in the database
                if (result.debug_all_referrals_by_name && result.debug_all_referrals_by_name.length > 0) {
                    result.debug_all_referrals_by_name.forEach((ref, idx) => {
                    });
                    if (result.debug_all_referrals_by_name.length > 0) {
                        const firstRef = result.debug_all_referrals_by_name[0];
                    }
                }
            }
            
            if (result.success && result.data) {
                displayReferrals(result.data);
                focusReferralFromUrl();
            } else {
                throw new Error(result.message || 'Failed to load referrals');
            }
        })
        .catch(error => {
            console.error('=== ERROR LOADING REFERRALS ===', error);
            document.getElementById('referralsTableBody').innerHTML = 
                '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #999;">Error loading referrals. Please try again.</td></tr>';
        });
}

function displayReferrals(referrals) {
    const tbody = document.getElementById('referralsTableBody');
    const progressContainer = document.getElementById('progressContainer');
    
    if (referrals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #999;">No referrals yet</td></tr>';
        progressContainer.style.display = 'none';
        return;
    }
    
    // Show progress overview
    progressContainer.style.display = 'block';
    displayProgressOverview(referrals);
    
    tbody.innerHTML = referrals.map(referral => `
        <tr>
            <td>${formatDate(referral.date_submitted)}</td>
            <td>${referral.referral_reason || referral.reason}</td>
            <td>${referral.teacher_name || 'Unknown'}</td>
            <td>
                <span class="badge" style="background: ${getStatusColor(referral.status)}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.85em;">
                    ${referral.status || 'pending'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewReferral(${referral.id})">View</button>
            </td>
        </tr>
    `).join('');
}

function displayProgressOverview(referrals) {
    const progressList = document.getElementById('referralProgressList');
    
    const stageLabels = {
        1: 'Interview/Background',
        2: 'Initial Risk Assessment',
        3: 'Parent Call-up/Consent',
        4: 'Intervention',
        5: 'Counseling',
        6: 'Student Follow-up',
        7: 'Case Closing'
    };

    const stageIcons = {
        1: '📋',
        2: '👀',
        3: '📅',
        4: '⚙️',
        5: '✅',
        6: '🎯',
        7: '📁'
    };

    progressList.innerHTML = referrals.map(referral => {
        const currentStage = parseInt(referral.stage) || 1;
        const totalStages = 7;
        const progress = (currentStage / totalStages) * 100;
        
        return `
            <div data-referral-id="${referral.id}" style="margin-bottom: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid ${getStatusColor(referral.status)};">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <div>
                        <strong style="display: block; font-size: 1em; color: #1f2937; margin-bottom: 4px;">${referral.referral_reason}</strong>
                        <small style="color: #6b7280;">Submitted: ${formatDate(referral.date_submitted)} • By: ${referral.teacher_name || 'Unknown'}</small>
                    </div>
                    <span class="badge" style="background: ${getStatusColor(referral.status)}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.8em; white-space: nowrap;">
                        ${referral.status || 'pending'}
                    </span>
                </div>
                
                <!-- Progress Bar -->
                <div style="margin-bottom: 10px;">
                    <div style="height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${progress}%; background: ${getStatusColor(referral.status)}; transition: width 0.3s ease;"></div>
                    </div>
                </div>
                
                <!-- Stage Steps -->
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-top: 12px;">
                    ${[1, 2, 3, 4, 5, 6, 7].map(stage => `
                        <div style="text-align: center;">
                            <div style="
                                width: 36px;
                                height: 36px;
                                margin: 0 auto 6px;
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                background: ${stage <= currentStage ? getStatusColor(referral.status) : '#e5e7eb'};
                                color: white;
                                font-weight: bold;
                                font-size: 12px;
                            ">
                                ${stage <= currentStage ? '✓' : stage}
                            </div>
                            <small style="color: ${stage <= currentStage ? '#1f2937' : '#9ca3af'}; font-size: 11px; display: block; max-width: 50px; margin: 0 auto; word-break: break-word;">
                                ${stageLabels[stage] || 'Stage ' + stage}
                            </small>
                        </div>
                    `).join('')}
                </div>
                
                <small style="display: block; margin-top: 10px; color: #6b7280;">
                    Progress: Stage ${currentStage} of ${totalStages}
                </small>
            </div>
        `;
    }).join('');
}

// Arriving from the dashboard's "View Referrals" link (?ref=<id>) should land
// directly on that specific — usually still-active — case, not a bare list.
function focusReferralFromUrl() {
    const referralId = new URLSearchParams(window.location.search).get('ref');
    if (!referralId) return;

    const card = document.querySelector(`#referralProgressList [data-referral-id="${referralId}"]`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.outline = '3px solid #3b82f6';
        card.style.outlineOffset = '2px';
    }

    viewReferral(referralId);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString();
    } catch {
        return dateString;
    }
}

function viewReferral(referralId) {
    // Fetch full referral details from the database
    fetch(`../../api/referral?id=${encodeURIComponent(referralId)}`)
        .then(response => response.json())
        .then(result => {
            if (result.success && result.data) {
                const ref = result.data;
                
                // Populate modal fields with referral data
                document.getElementById('refStudentName').value = ref.student_name || '';
                document.getElementById('refStudentId').value = ref.student_id || '';
                document.getElementById('refGrade').value = ref.grade || '';
                document.getElementById('refSection').value = ref.section || '';
                document.getElementById('refAge').value = ref.age || '';
                document.getElementById('refGender').value = ref.gender || '';
                
                document.getElementById('refReason').value = ref.referral_reason || '';
                document.getElementById('refDescription').value = ref.description || '';
                document.getElementById('refIntervention').value = ref.intervention_attempts || '';
                document.getElementById('refBehaviors').value = ref.observed_behaviors || '';
                document.getElementById('refUrgency').value = ref.urgency || '';
                document.getElementById('refTeacher').value = ref.teacher_name || '';
                
                document.getElementById('refParent').value = ref.parent_guardian || '';
                document.getElementById('refParentContact').value = ref.parent_contact || '';
                document.getElementById('refParentEmail').value = ref.parent_email || '';
                document.getElementById('refFamilyBg').value = ref.family_background || '';
                
                document.getElementById('refStatus').value = (ref.status || 'pending').toUpperCase();
                document.getElementById('refDateSubmitted').value = formatDate(ref.date_submitted);
                
                // Update phase display
                const phase = parseInt(ref.stage) || 1;
                const phaseLabels = {
                    1: 'Phase 1: Interview/Background',
                    2: 'Phase 2: Initial Risk Assessment',
                    3: 'Phase 3: Parent Call-up/Consent',
                    4: 'Phase 4: Intervention',
                    5: 'Phase 5: Counseling',
                    6: 'Phase 6: Student Follow-up',
                    7: 'Phase 7: Case Closing'
                };
                document.getElementById('refPhase').value = phaseLabels[phase] || 'Phase ' + phase;

                // Update progress bar
                const progress = (phase / 7) * 100;
                const progressBar = document.getElementById('refProgressBar');
                progressBar.style.width = progress + '%';
                progressBar.style.background = getStatusColor(ref.status);
                
                // Color code the status field
                const statusField = document.getElementById('refStatus');
                statusField.style.background = getStatusColor(ref.status);
                statusField.style.color = 'white';
                statusField.style.borderColor = getStatusColor(ref.status);
                
                // Show modal with proper centering
                const modal = document.getElementById('referralModal');
                modal.classList.add('show');
                modal.style.display = 'flex';
            } else {
                alert('Error loading referral details: ' + (result.message || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error fetching referral:', error);
            alert('Error loading referral details. Please try again.');
        });
}

function setupEventListeners() {
    const closeBtn = document.getElementById('closeReferralModal');
    const closeBtnAlt = document.getElementById('closeReferralBtn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const modal = document.getElementById('referralModal');
            modal.classList.remove('show');
            modal.style.display = 'none';
        });
    }
    
    if (closeBtnAlt) {
        closeBtnAlt.addEventListener('click', () => {
            const modal = document.getElementById('referralModal');
            modal.classList.remove('show');
            modal.style.display = 'none';
        });
    }
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('referralModal');
        if (e.target === modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
        }
    });
}

function getStatusColor(status) {
    const colors = {
        'pending': '#f59e0b',
        'in-progress': '#3b82f6',
        'completed': '#10b981',
        'rejected': '#ef4444'
    };
    return colors[status?.toLowerCase?.()] || colors[status] || '#6b7280';
}

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', requestLogout);

