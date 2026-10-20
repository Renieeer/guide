let caseStudents = [];
let caseDrafts   = [];
let openDrawerId = null; // tracks which case's student drawer is open
const expandedStudentGroups = new Set(); // case ids whose student list is fully expanded
let sectionData  = [];   // [{ SectionID, SectionName, categories: [{CaseId, CategoryName}] }]
const CASE_SCENARIO_API = '../../api/case-scenario';

// Close any open "more students" popover when clicking outside of it
document.addEventListener('click', function(e) {
    if (expandedStudentGroups.size === 0) return;
    if (e.target.closest('.drawer-student-more-wrapper')) return;
    expandedStudentGroups.clear();
    renderRecentCases();
});

function formatGradeLabel(grade) {
    const value = String(grade ?? '').trim();
    if (!value) return '';

    if (/^grade\s*\d+$/i.test(value)) {
        return value.replace(/\s+/g, ' ').replace(/^grade/i, 'Grade');
    }

    const gradeMap = {
        '1': 'Grade 7',
        '2': 'Grade 8',
        '3': 'Grade 9',
        '4': 'Grade 10',
        '5': 'Grade 11',
        '6': 'Grade 12'
    };

    if (gradeMap[value]) {
        return gradeMap[value];
    }

    if (/^\d+$/.test(value)) {
        const numericGrade = Number(value);
        if (numericGrade >= 7 && numericGrade <= 12) {
            return `Grade ${numericGrade}`;
        }
    }

    return value;
}

document.addEventListener('DOMContentLoaded', async () => {
    initPage();
    await refreshGradeScope();
    loadSectionData().then(() => {
        initCounselingCasePage();
        applyReferralPrefill();
    });
});

// Holds the originating referral's code between prefill and save — sent as
// a real referral_code column value (see collectCaseData() below and the
// counselor_case_scenarios.referral_code column in api/case-scenario)
// instead of being stuffed into case_summary as a "(Linked to Referral
// <code>)" text marker, which is how this used to work.
let pendingReferralCode = '';

// Arriving from a Stage 4 referral's "Open Counseling Case" button (see
// openCounselingCaseForReferral() in referrals.js) — opens the new-case
// form pre-filled with that referral's student instead of leaving the
// counselor to re-type what's already on the referral.
function applyReferralPrefill() {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('prefill_name');
    if (!name) return;

    openCaseForm();

    const nameInput = document.getElementById('studentName');
    if (nameInput) nameInput.value = name;

    const gradeInput = document.getElementById('studentGrade');
    if (gradeInput) {
        const grade = params.get('prefill_grade') || '';
        const section = params.get('prefill_section') || '';
        gradeInput.value = section ? `${grade} - ${section}` : grade;
    }

    const referralIntervention = params.get('referral_intervention') || '';
    // Notes shows only the Stage 1 Interview/Background note — the
    // referral's code is held in pendingReferralCode instead of being
    // written in here, so it never appears in what the counselor reads/edits.
    const referralInterview = params.get('referral_interview') || '';
    const referralCode = params.get('referral_code') || '';

    const summaryInput = document.getElementById('caseSummary');
    if (summaryInput) {
        summaryInput.value = referralInterview;
    }
    pendingReferralCode = referralCode;

    // "Initial Actions Taken" on the referral is the same idea as this
    // form's "Initial action plan" — what's already been tried before
    // counseling started.
    const firstActionInput = document.getElementById('firstAction');
    if (firstActionInput && referralIntervention) {
        firstActionInput.value = referralIntervention;
    }

    addStudent();
}

// Arriving from a referral's "View Counseling Case" link (see
// checkExistingCounselingCase() in referrals.js) — scrolls to and briefly
// flashes the matching row in Recent drafts so it's obvious which case that
// link pointed at instead of leaving the counselor to search the whole
// table for it.
function highlightLinkedCase() {
    const caseId = new URLSearchParams(window.location.search).get('case_id');
    if (!caseId) return;

    const row = document.getElementById(`caseRow-${caseId}`);
    if (!row) return;

    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('case-row-highlight');
    setTimeout(() => row.classList.remove('case-row-highlight'), 2500);
}

/* ---- Load sections + categories from DB ---- */
async function loadSectionData() {
    const sectionSelect = document.getElementById('caseSection');

    try {
        const res  = await fetch('../../api/get-case-section');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (json.success && Array.isArray(json.sections)) {
            sectionData = json.sections;
            populateSectionSelect();
            return;
        }

        throw new Error(json.message || 'Invalid sections payload.');
    } catch (e) {
        console.error('Failed to load section data:', e);
        if (sectionSelect) {
            sectionSelect.innerHTML = '<option value="">Failed to load sections</option>';
            sectionSelect.disabled = true;
        }
        showAlert('Failed to load case sections. Please refresh the page.', 'warning');
    }
}

function populateSectionSelect() {
    const select = document.getElementById('caseSection');
    if (!select) return;
    select.innerHTML = '<option value="">Select section</option>';
    sectionData.forEach(s => {
        const opt = document.createElement('option');
        opt.value       = s.SectionID;
        opt.textContent = s.SectionName;
        select.appendChild(opt);
    });
}

/* Returns the currently selected case section for the create-case form */
function getSelectedSectionAndCategory() {
    const secSelect = document.getElementById('caseSection');
    const section   = sectionData.find(s => String(s.SectionID) === String(secSelect?.value));
    return {
        sectionId:   secSelect?.value      || '',
        sectionName: section?.SectionName || '',
        sectionCode: section?.SectionCode || ''
    };
}

function isCategoryInSection(sectionId, categoryId) {
    const section = sectionData.find(s => String(s.SectionID) === String(sectionId));
    if (!section || !Array.isArray(section.categories)) return false;
    return section.categories.some(c => String(c.CaseId) === String(categoryId));
}

function initCounselingCasePage() {
    const user = getCurrentUser();
    document.getElementById('assignedCounselor').value = user?.name || 'Assigned counselor';
    setTodayDate('caseDate');

    const followUpDate = document.getElementById('followUpDate');
    if (followUpDate) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        followUpDate.value = nextWeek.toISOString().split('T')[0];
    }

    loadCaseDrafts();
    bindCaseEvents();
    renderStudentList();
    setupStudentSearchCounselor();
}

// Setup student name search/autocomplete for counselor page
function setupStudentSearchCounselor() {
    const input = document.getElementById('studentName');
    if (!input) return;

    // create small status element if not present
    let status = document.getElementById('studentSearchStatus');
    if (!status) {
        status = document.createElement('div');
        status.id = 'studentSearchStatus';
        status.style.cssText = 'margin-top:6px;font-size:12px;color:#666;min-height:18px;';
        input.parentNode.insertBefore(status, input.nextSibling);
    }

    // suggestion dropdown
    let box = document.getElementById('studentSuggestionBox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'studentSuggestionBox';
        box.style.cssText = 'position:relative';
        const inner = document.createElement('div');
        inner.id = 'studentSuggestionList';
        inner.style.cssText = 'position:absolute;left:0;right:0;z-index:50;background:#fff;border:1px solid #ddd;border-radius:4px;max-height:200px;overflow:auto;box-shadow:0 6px 16px rgba(0,0,0,0.08);';
        box.appendChild(inner);
        input.parentNode.insertBefore(box, status);
    }

    let timeout;
    window.counselorStudentSuggestion = null;

    input.addEventListener('input', () => {
        clearTimeout(timeout);
        const q = input.value.trim();
        status.textContent = '';
        status.style.color = '#666';
        window.counselorStudentSuggestion = null;

        if (q.length < 2) return;

        timeout = setTimeout(() => searchStudentsForSuggestionCounselor(q, input, status), 250);
    });

    let highlightedIndex = -1;
    input.addEventListener('keydown', (e) => {
        const list = document.getElementById('studentSuggestionList');
        const items = list ? Array.from(list.querySelectorAll('.suggestion-item')) : [];
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
            updateHighlight(items, highlightedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            updateHighlight(items, highlightedIndex);
        } else if (e.key === 'Enter') {
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                e.preventDefault();
                items[highlightedIndex].click();
            }
        } else if ((e.key === 'Tab' || e.key === 'ArrowRight') && window.counselorStudentSuggestion) {
            e.preventDefault();
            const s = window.counselorStudentSuggestion;
            input.value = s.fullName;
            populateStudentFromSuggestionCounselor(s);
            window.counselorStudentSuggestion = null;
            status.textContent = `Selected: ${s.fullName}`;
            status.style.color = 'green';
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    input.addEventListener('blur', () => {
        // hide suggestion box shortly after blur
        setTimeout(() => hideSuggestions(), 200);
    });
}

function updateHighlight(items, idx) {
    items.forEach((it, i) => {
        if (i === idx) {
            it.style.background = '#f1f5ff';
        } else {
            it.style.background = '';
        }
    });
}

function hideSuggestions() {
    const list = document.getElementById('studentSuggestionList');
    if (list) list.innerHTML = '';
    window.counselorStudentSuggestion = null;
}

function searchStudentsForSuggestionCounselor(searchTerm, inputField, statusEl) {
    const user = getCurrentUser();
    let school = user?.school_attended;
    if (!school) school = localStorage.getItem('teacherSchool') || '';
    const gradeParam = `&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;
    let apiUrl;
    if (school) {
        apiUrl = `../../api/get-students?school=${encodeURIComponent(school)}&search=${encodeURIComponent(searchTerm)}&limit=8${gradeParam}`;
        statusEl.textContent = 'Searching school records...';
        statusEl.style.color = '#666';
    } else {
        // search across users_tables when school not provided
        apiUrl = `../../api/get-students?search=${encodeURIComponent(searchTerm)}&limit=8${gradeParam}`;
        statusEl.textContent = 'Searching records across schools...';
        statusEl.style.color = '#666';
    }

    console.debug('Student search URL:', apiUrl);
    fetch(apiUrl)
        .then(r => {
            console.debug('get-students HTTP status:', r.status, r.statusText);
            return r.json();
        })
        .then(result => {
            console.debug('get-students response:', result);
            if (!result.success) {
                statusEl.textContent = 'Unable to check student records.';
                statusEl.style.color = '#d66';
                hideSuggestions();
                return;
            }
            const listEl = document.getElementById('studentSuggestionList');
            listEl.innerHTML = '';
            if (result.data && result.data.length > 0) {
                result.data.forEach((student, i) => {
                    const fullName = `${student.first_name || student.FirstName || ''} ${student.last_name || student.LastName || ''}`.trim();
                    const gradeLabel = formatGradeLabel(student.grade_name || student.grade_level || student.grade_id || student.Grade || '');
                    const row = document.createElement('div');
                    row.className = 'suggestion-item';
                    row.style.cssText = 'padding:8px 10px;cursor:pointer;border-bottom:1px solid #f2f2f2;';
                    row.innerHTML = `<div style="font-weight:600">${escapeHtml(fullName)}</div><div style="font-size:12px;color:#666">${escapeHtml(gradeLabel)}${student.school_attended? ' • ' + escapeHtml(student.school_attended):''}</div>`;
                    row.addEventListener('mousedown', (ev) => {
                        ev.preventDefault();
                        inputField.value = fullName;
                        populateStudentFromSuggestionCounselor(Object.assign({}, student, { fullName }));
                        statusEl.textContent = `Selected: ${fullName}`;
                        statusEl.style.color = 'green';
                        hideSuggestions();
                    });
                    listEl.appendChild(row);
                });
                // set first suggestion for quick Tab acceptance
                const first = result.data[0];
                window.counselorStudentSuggestion = Object.assign({}, first, { fullName: `${first.first_name||first.FirstName||''} ${first.last_name||first.LastName||''}`.trim() });
                statusEl.textContent = `Found ${result.data.length} match${result.data.length>1?'es':''}`;
                statusEl.style.color = 'green';
            } else {
                statusEl.textContent = 'No matching student found in school records.';
                statusEl.style.color = '#d9534f';
                window.counselorStudentSuggestion = null;
                hideSuggestions();
            }
        })
        .catch(err => {
            console.error('Error searching students:', err);
            statusEl.textContent = 'Error checking student records.';
            statusEl.style.color = '#d66';
            window.counselorStudentSuggestion = null;
        });
}

function populateStudentFromSuggestionCounselor(student) {
    if (!student) return;
    const fullName = student.fullName || `${student.first_name || student.FirstName || ''} ${student.last_name || student.LastName || ''}`.trim();
    const nameInput = document.getElementById('studentName');
    if (nameInput) nameInput.value = fullName;

    const gradeInput = document.getElementById('studentGrade');
    if (gradeInput) gradeInput.value = formatGradeLabel(student.grade_name || student.grade_level || student.grade_id || student.Grade || '');
}

// Red-highlight helpers for saveCase()'s validation — a toast alone doesn't
// point at which field is the problem, especially once the form has more
// than one required field.
function clearCaseFieldErrors() {
    document.getElementById('caseSection')?.classList.remove('field-error');
    document.getElementById('caseSummary')?.classList.remove('field-error');
    document.getElementById('studentList')?.classList.remove('field-error');
}

function markFieldError(el) {
    if (!el) return;
    el.classList.add('field-error');
    el.focus();
}

function bindCaseEvents() {
    document.getElementById('openCaseFormBtn')?.addEventListener('click', openCaseForm);
    document.getElementById('cancelCaseFormBtn')?.addEventListener('click', cancelCaseForm);
    document.getElementById('addStudentBtn')?.addEventListener('click', addStudent);
    document.getElementById('studentRole')?.addEventListener('change', (e) => {
        const otherInput = document.getElementById('studentRoleOtherText');
        otherInput.style.display = e.target.value === 'Other' ? '' : 'none';
        if (e.target.value === 'Other') otherInput.focus();
    });
    document.getElementById('caseSection')?.addEventListener('change', () => {
        document.getElementById('caseSection').classList.remove('field-error');
    });
    document.getElementById('caseSummary')?.addEventListener('input', () => {
        document.getElementById('caseSummary').classList.remove('field-error');
    });
    document.getElementById('caseCreateForm')?.addEventListener('submit', event => {
        event.preventDefault();
        saveCase();
    });
    document.getElementById('draftSectionFilter')?.addEventListener('change', renderRecentCases);
    document.getElementById('draftCategoryFilter')?.addEventListener('change', renderRecentCases);
    document.getElementById('draftStatusFilter')?.addEventListener('change', renderRecentCases);
    document.getElementById('clearDraftFiltersBtn')?.addEventListener('click', () => {
        const sectionSelect  = document.getElementById('draftSectionFilter');
        const categorySelect = document.getElementById('draftCategoryFilter');
        const statusSelect   = document.getElementById('draftStatusFilter');
        if (sectionSelect)  sectionSelect.value  = '';
        if (categorySelect) categorySelect.value = '';
        if (statusSelect)   statusSelect.value   = '';
        renderRecentCases();
    });
}

function openCaseForm() {
    const wrapper = document.getElementById('caseFormWrapper');
    wrapper.style.display = 'block';
    wrapper.classList.add('case-form-enter');
    document.getElementById('openCaseFormBtn').style.display = 'none';
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideCaseForm() {
    const wrapper = document.getElementById('caseFormWrapper');
    wrapper.style.display = 'none';
    wrapper.classList.remove('case-form-enter');
    document.getElementById('openCaseFormBtn').style.display = '';
}

function cancelCaseForm() {
    resetForm();
    hideCaseForm();
}

/* ---- Student involvement ---- */
function addStudent() {
    const nameInput  = document.getElementById('studentName');
    const gradeInput = document.getElementById('studentGrade');
    const roleInput  = document.getElementById('studentRole');

    const name = nameInput.value.trim();
    if (!name) {
        nameInput.focus();
        showAlert('Enter a student name before adding it to the case.', 'warning');
        return;
    }

    // Validate student exists in DB before adding
    (async function validateAndAdd() {
        try {
            const user = getCurrentUser();
            const school = user?.school_attended || localStorage.getItem('teacherSchool') || '';
            const gradeParam = `&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;
            let api;
            if (school) {
                api = `../../api/get-students?school=${encodeURIComponent(school)}&search=${encodeURIComponent(name)}&limit=1${gradeParam}`;
            } else {
                // search across all schools when current user has no school set
                api = `../../api/get-students?search=${encodeURIComponent(name)}&limit=1${gradeParam}`;
            }

            console.debug('Validate student API URL:', api, 'searchName:', name, 'userSchool:', school);

            const res = await fetch(api);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const json = await res.json();
            console.debug('validate student response:', json);
            if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
                console.warn('Student lookup returned no matches for:', name, json);
                showAlert('Student not found in school records. Please register the student first or correct the name.', 'warning');
                nameInput.focus();
                return;
            }

            const s = json.data[0];
            const gradeLabel = formatGradeLabel(s.grade_name || s.grade_level || s.grade_id || s.Grade || gradeInput.value.trim());

            // "Other" stores whatever was typed in place of the literal
            // word "Other", so it reads naturally everywhere role shows up
            // (student tags, case-report exports) instead of just "Other".
            const roleOtherInput = document.getElementById('studentRoleOtherText');
            const role = roleInput.value === 'Other'
                ? (roleOtherInput.value.trim() || 'Other')
                : roleInput.value;

            caseStudents.push({
                id: s.id || s.StudentId || generateId(),
                name: `${s.first_name || s.FirstName || ''} ${s.last_name || s.LastName || ''}`.trim() || name,
                grade: gradeLabel || 'Grade not set',
                role: role
            });

            nameInput.value  = '';
            gradeInput.value = '';
            roleInput.value  = '';
            roleOtherInput.value = '';
            roleOtherInput.style.display = 'none';

            renderStudentList();
        } catch (error) {
            console.error('Failed to validate student:', error);
            showAlert('Unable to verify student at this time. Try again later.', 'warning');
        }
    })();
}

function removeStudent(id) {
    caseStudents = caseStudents.filter(s => s.id !== id);
    renderStudentList();
}

function renderStudentList() {
    const list = document.getElementById('studentList');
    const pill = document.getElementById('studentCountPill');

    pill.textContent = `${caseStudents.length} ${caseStudents.length === 1 ? 'student' : 'students'}`;

    if (caseStudents.length === 0) {
        list.innerHTML = '<div class="empty-state">No students linked yet. Add at least one student to open the case.</div>';
        return;
    }

    list.classList.remove('field-error');

    list.innerHTML = caseStudents.map(s => `
        <div class="student-item">
            <div class="student-meta">
                <strong>${escapeHtml(s.name)}</strong>
                <span>${escapeHtml(formatGradeLabel(s.grade_name || s.grade_level || s.grade_id || s.Grade || s.grade))}</span>
            </div>
            <div class="student-tags">
                <span class="tag"><i class="bi bi-person-badge"></i> ${escapeHtml(s.role)}</span>
                <button type="button" class="btn btn-outline btn-sm" onclick="removeStudent('${s.id}')">Remove</button>
            </div>
        </div>
    `).join('');
}

/* ---- Save / submit ---- */
async function saveCase() {
    const payload = collectCaseData();
    clearCaseFieldErrors();

    if (!payload.sectionId) {
        showAlert('Please select a case section.', 'warning');
        markFieldError(document.getElementById('caseSection'));
        return;
    }
    if (!document.getElementById('caseSummary').value.trim()) {
        showAlert('Summary of concern is required.', 'warning');
        markFieldError(document.getElementById('caseSummary'));
        return;
    }
    if (caseStudents.length === 0) {
        showAlert('Add at least one student before saving the case.', 'warning');
        markFieldError(document.getElementById('studentList'));
        return;
    }

    try {
        const res = await fetch(CASE_SCENARIO_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', record: payload })
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.message || `HTTP ${res.status}`);
        }

        caseDrafts.unshift(payload);
        caseDrafts = caseDrafts.slice(0, 50);
        renderRecentCases();

        showAlert('Case submitted and saved to database.', 'success');
        resetForm();
        hideCaseForm();
    } catch (error) {
        console.error('Failed to save case scenario:', error);
        showAlert(`Failed to save case scenario: ${error.message}`, 'warning');
    }
}

function collectCaseData() {
    const user = getCurrentUser();
    const caseId = `CS-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)}`;
    const { sectionId, sectionName, sectionCode } = getSelectedSectionAndCategory();

    const caseTitle = sectionCode
        ? `${sectionCode}. ${sectionName}`
        : sectionName;

    return {
        id:               caseId,
        status:           'pending',
        counselorId:      user?.id || '',
        counselor:        user?.name || '',
        schoolAttended:   user?.school_attended || '',
        sectionId,
        sectionName,
        // Category is recorded per student later (follow-up / counseling info),
        // not at case creation.
        categoryId:       '',
        categoryName:     '',
        // Title should represent the case section/range.
        caseTitle,
        caseDate:         document.getElementById('caseDate').value,
        caseSummary:      document.getElementById('caseSummary').value.trim(),
        caseObjective:    document.getElementById('caseObjective').value.trim(),
        firstAction:      document.getElementById('firstAction').value.trim(),
        followUpDate:     document.getElementById('followUpDate').value,
        confidentialityAck: document.getElementById('confidentialityAck').checked,
        // Real column now (counselor_case_scenarios.referral_code) — see
        // applyReferralPrefill() above and api/case-scenario.php.
        referralCode:     pendingReferralCode,
        students:         [...caseStudents],
        createdAt:        new Date().toISOString()
    };
}

/* Returns the categories that belong to this record's section */
function getCategoriesForRecord(record) {
    if (!record?.sectionId) return [];
    const section = sectionData.find(s => String(s.SectionID) === String(record.sectionId));
    return section?.categories || [];
}

/* ---- Recent drafts table ---- */
async function loadCaseDrafts() {
    const user = getCurrentUser();
    const school = user?.school_attended ? String(user.school_attended).trim() : '';
    const gradeParam = `&grade_scope=${encodeURIComponent(getCurrentGradeScope())}`;
    const query = (school ? `?school_attended=${encodeURIComponent(school)}&limit=50` : '?limit=50') + gradeParam;

    try {
        const res = await fetch(`${CASE_SCENARIO_API}${query}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) {
            throw new Error(json.message || 'Invalid case scenario payload.');
        }

        caseDrafts = json.data;
        renderRecentCases();
        highlightLinkedCase();
    } catch (error) {
        console.error('Failed to load case scenarios from database:', error);
        caseDrafts = getData('counselor_case_records') || [];
        renderRecentCases();
        showAlert('Unable to load case scenarios from database. Showing local drafts.', 'warning');
    }
}

async function persistCaseUpdate(record) {
    const res = await fetch(CASE_SCENARIO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', record })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.message || `HTTP ${res.status}`);
    }
}

/* All sections/categories defined in the database (sectionData, loaded up front
   from get-case-section.php), used to populate the filters - so a section or
   category with zero cases so far still shows up and can be filtered on. */
function populateDraftSectionFilter() {
    const select = document.getElementById('draftSectionFilter');
    if (!select) return;

    const previousValue = select.value;
    const options = sectionData
        .map(s => [String(s.SectionID), s.SectionName || String(s.SectionID)])
        .sort((a, b) => a[1].localeCompare(b[1]));

    select.innerHTML = '<option value="">All sections</option>' +
        options.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('');

    if (options.some(([id]) => id === previousValue)) {
        select.value = previousValue;
    }
}

/* Categories belong to a section (case_category.SectionID), so once a
   Section filter is picked, narrow the Category options to just that
   section's categories instead of listing every category in the school. */
function populateDraftCategoryFilter() {
    const select = document.getElementById('draftCategoryFilter');
    if (!select) return;

    const sectionFilter = document.getElementById('draftSectionFilter')?.value || '';
    const previousValue  = select.value;
    const categoryNames  = new Set();

    sectionData
        .filter(s => !sectionFilter || String(s.SectionID) === sectionFilter)
        .forEach(s => (s.categories || []).forEach(c => {
            if (c.CategoryName) categoryNames.add(c.CategoryName);
        }));

    const categories = Array.from(categoryNames).sort((a, b) => a.localeCompare(b));

    select.innerHTML = '<option value="">All categories</option>' +
        categories.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');

    if (categories.includes(previousValue)) {
        select.value = previousValue;
    }
}

/* A case's category isn't set at the case level - it's recorded per student,
   per follow-up (see saveFollowUp). This collects the distinct category
   names actually used by a case's follow-ups so filtering/display reflects
   what counselors picked, instead of the always-blank case-level field. */
function getRecordCategoryNames(record) {
    const names = new Set();
    if (record.categoryName) names.add(record.categoryName);
    (record.followUps || []).forEach(f => {
        if (f.categoryName) names.add(f.categoryName);
    });
    return Array.from(names);
}

/* Applies the section/category/status filters and sorts newest-first (by
   createdAt, falling back to the case id, which is time-ordered) for quick scanning. */
function getVisibleDrafts() {
    const sectionFilter  = document.getElementById('draftSectionFilter')?.value  || '';
    const categoryFilter = document.getElementById('draftCategoryFilter')?.value || '';
    const statusFilter   = document.getElementById('draftStatusFilter')?.value   || '';

    return caseDrafts
        .filter(record => !sectionFilter || String(record.sectionId) === sectionFilter)
        .filter(record => !categoryFilter || getRecordCategoryNames(record).includes(categoryFilter))
        .filter(record => !statusFilter || (statusFilter === 'closed' ? record.status === 'closed' : record.status !== 'closed'))
        .slice()
        .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (bTime !== aTime) return bTime - aTime;
            return String(b.id).localeCompare(String(a.id));
        });
}

function renderRecentCases() {
    const tbody = document.getElementById('recentCasesBody');
    populateDraftSectionFilter();
    populateDraftCategoryFilter();

    if (!caseDrafts.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No saved drafts yet.</td></tr>';
        return;
    }

    const visibleDrafts = getVisibleDrafts();
    if (!visibleDrafts.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No drafts match the selected filters.</td></tr>';
        return;
    }

    tbody.innerHTML = visibleDrafts.map(record => {
        const titleDisplay    = record.sectionName  || record.caseTitle || '—';
        const recordCategories = getRecordCategoryNames(record);
        const categoryDisplay  = recordCategories.length ? recordCategories.join(', ') : '—';

        return `
        <tr id="caseRow-${escapeHtml(record.id)}">
            <td><strong>${escapeHtml(record.id)}</strong></td>
            <td>${escapeHtml(titleDisplay)}</td>
            <td>${escapeHtml(categoryDisplay)}</td>
            <td>${(record.students || []).length}</td>
            <td>
                ${record.status === 'closed' ? '<span class="badge badge-completed">Ended</span>' : '<span class="badge badge-pending">Pending</span>'}
            </td>
            <td style="display:flex;gap:8px;align-items:center;">
                <button type="button" class="btn btn-outline btn-sm" onclick="toggleStudentDrawer('${record.id}')">
                    <i class="bi bi-people"></i> View
                </button>
                ${record.status !== 'closed' ? `
                <button type="button" class="btn btn-success btn-sm" onclick="openAppointModal('${record.id}')">
                    <i class="bi bi-calendar-plus"></i> Add Counseling Session
                </button>
                <button type="button" class="btn btn-warning btn-sm" onclick="openFollowUpModal('${record.id}')">
                    <i class="bi bi-chat-dots"></i> Add Student Follow-up
                </button>
                <button type="button" class="btn btn-outline btn-sm btn-danger" onclick="endCase('${record.id}')">
                    <i class="bi bi-check-circle"></i> End case
                </button>
                ` : ''}
            </td>
        </tr>
        <tr class="drawer-row ${openDrawerId === record.id ? '' : 'hidden'}" id="drawerRow-${record.id}">
            <td colspan="6">
                <div class="student-drawer">
                    <div class="student-drawer-header">
                        <span><i class="bi bi-people"></i> Students involved in ${escapeHtml(record.id)}</span>
                        <button type="button" class="drawer-close" onclick="toggleStudentDrawer('${record.id}')">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>

                    <div class="drawer-columns">
                        <div class="student-drawer-grid">
                            ${(() => {
                                const students = record.students || [];
                                const STUDENT_PREVIEW_LIMIT = 2;
                                const isExpanded = expandedStudentGroups.has(record.id);
                                const visibleStudents = students.slice(0, STUDENT_PREVIEW_LIMIT);
                                const hiddenStudents = students.slice(STUDENT_PREVIEW_LIMIT);

                                let html = visibleStudents.map(s => `
                                    <div class="drawer-student-card clickable" onclick="openCounselingPanel('${record.id}', '${s.id}')">
                                        <div class="cp-avatar">${initials(s.name)}</div>
                                        <div>
                                            <p class="cp-name">${escapeHtml(s.name)}</p>
                                            <p class="cp-sub">${escapeHtml(s.grade)}</p>
                                            <p class="cp-sub">${escapeHtml(s.role)}</p>
                                        </div>
                                    </div>
                                `).join('');

                                if (hiddenStudents.length > 0) {
                                    html += `
                                        <div class="drawer-student-more-wrapper">
                                            <div class="drawer-student-card drawer-student-more clickable" onclick="toggleStudentGroup('${record.id}')">
                                                <div class="cp-avatar cp-avatar-more"><i class="bi bi-folder2${isExpanded ? '-open' : ''}"></i></div>
                                                <div>
                                                    <p class="cp-name">+${hiddenStudents.length} more student${hiddenStudents.length > 1 ? 's' : ''}</p>
                                                    <p class="cp-sub">Click to view all</p>
                                                </div>
                                            </div>
                                            ${isExpanded ? `
                                                <div class="student-more-popover-backdrop" onclick="toggleStudentGroup('${record.id}')"></div>
                                                <div class="student-more-popover" onclick="event.stopPropagation()">
                                                    <div class="student-more-popover-header">
                                                        <span>${hiddenStudents.length} more student${hiddenStudents.length > 1 ? 's' : ''}</span>
                                                        <button type="button" class="drawer-close" onclick="toggleStudentGroup('${record.id}')">
                                                            <i class="bi bi-x-lg"></i>
                                                        </button>
                                                    </div>
                                                    <div class="student-more-popover-list">
                                                        ${hiddenStudents.map(s => `
                                                            <div class="drawer-student-card clickable" onclick="openCounselingPanel('${record.id}', '${s.id}')">
                                                                <div class="cp-avatar">${initials(s.name)}</div>
                                                                <div>
                                                                    <p class="cp-name">${escapeHtml(s.name)}</p>
                                                                    <p class="cp-sub">${escapeHtml(s.grade)}</p>
                                                                    <p class="cp-sub">${escapeHtml(s.role)}</p>
                                                                </div>
                                                            </div>
                                                        `).join('')}
                                                    </div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                }

                                return html;
                            })()}
                        </div>

                        <div class="drawer-case-summary">
                            <div class="drawer-case-counts">
                                <span><strong>${countFollowUpsByTitle(record, 'Counseling Session')}</strong> sessions</span>
                                <span><strong>${countFollowUpsByTitle(record, 'Follow-up')}</strong> follow-ups</span>
                            </div>
                            ${buildCaseTimelineRail(record)}
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

// The case drawer's chronological story — the case's own creation as the
// first node, then a node per counseling session in date order, with every
// follow-up nested inside whichever session most recently preceded it (a
// follow-up is a check-in on progress since that session, not its own
// separate step — see the "come back on that day" / "track if she's
// improving" distinction), plus an open "still ongoing" node while the case
// is pending. A follow-up logged before any session exists yet has nothing
// to nest under, so it falls back to its own node. Reuses
// student-history.js's own .sh-case-day/-badge/-bar/-note-row rail styling
// (see counseling.php's stylesheet link) instead of a second design — and
// counts/labels come straight from record.followUps, the same source
// countFollowUpsByTitle() reads.
function buildCaseTimelineRail(record) {
    const followUps = record.followUps || [];
    const sorted = followUps.slice().sort((a, b) => {
        const da = new Date(a.recordedAt || a.followUpDate || 0);
        const db = new Date(b.recordedAt || b.followUpDate || 0);
        return da - db;
    });

    // Group into { session, followUps: [...] } — a Counseling Session opens
    // a new group; a Follow-up joins whichever group is currently open, or
    // stands alone (session: null) if none has happened yet.
    const groups = [];
    let currentGroup = null;
    sorted.forEach(f => {
        const isSession = (f.title || 'Follow-up') === 'Counseling Session';
        if (isSession) {
            currentGroup = { session: f, followUps: [] };
            groups.push(currentGroup);
        } else if (currentGroup) {
            currentGroup.followUps.push(f);
        } else {
            groups.push({ session: null, followUps: [f] });
        }
    });

    // inlineLabel + its own LOGGED badge only apply to a nested follow-up
    // (no day-bar of its own to carry a label/pill) — a session's own note,
    // or a session-less orphan follow-up, already gets both from its bar.
    const buildNoteRow = (f, inlineLabel) => `
        <div class="sh-case-note-row">
            <span class="sh-case-note-icon"><i class="fas fa-pen"></i></span>
            <div class="sh-case-note-body">
                <div class="sh-case-note-head">
                    ${inlineLabel ? `<strong>${escapeHtml(inlineLabel)}</strong> &middot; ` : ''}${f.categoryName ? `Category <strong>${escapeHtml(f.categoryName)}</strong> &middot; ` : ''}Note by <strong>${escapeHtml(f.counselorName || 'A counselor')}</strong> &middot; ${escapeHtml(formatDate(f.followUpDate))}
                    ${inlineLabel ? `<span class="badge badge-completed" style="margin-left:6px;">LOGGED</span>` : ''}
                </div>
                <div class="sh-case-note-text">${escapeHtml(f.initialAction) || '—'}</div>
            </div>
        </div>`;

    let sessionNum = 0;
    let followUpNum = 0;
    const eventNodes = groups.map(group => {
        if (group.session) {
            sessionNum++;
            const nestedFollowUps = group.followUps.map(f => buildNoteRow(f, `Student Follow-up #${++followUpNum}`)).join('');
            return `
            <div class="sh-case-day">
                <div class="sh-case-day-row">
                    <span class="sh-case-day-badge sh-case-day-badge--session">${sessionNum}</span>
                    <div class="sh-case-day-bar">
                        <span>COUNSELING SESSION &middot; #${sessionNum}</span>
                        <span class="sh-case-day-pill sh-case-day-pill--session">LOGGED</span>
                    </div>
                </div>
                ${buildNoteRow(group.session)}
                ${nestedFollowUps}
            </div>`;
        }
        // No session has happened yet — nothing to nest this follow-up
        // under, so it gets its own node same as before.
        return group.followUps.map(f => `
            <div class="sh-case-day">
                <div class="sh-case-day-row">
                    <span class="sh-case-day-badge">${++followUpNum}</span>
                    <div class="sh-case-day-bar">
                        <span>STUDENT FOLLOW-UP &middot; #${followUpNum}</span>
                        <span class="sh-case-day-pill">LOGGED</span>
                    </div>
                </div>
                ${buildNoteRow(f)}
            </div>`).join('');
    });

    const students = record.students || [];
    const roleLine = students.length === 1
        ? `Student role: ${escapeHtml(students[0].role || '—')}`
        : `${students.length} students involved`;
    const openedLabel = record.referralCode
        ? `CASE OPENED &mdash; FROM REFERRAL #${escapeHtml(record.referralCode)}`
        : 'CASE OPENED &mdash; WALK-IN';

    const openedNode = `
        <div class="sh-case-day">
            <div class="sh-case-day-row">
                <span class="sh-case-day-badge sh-case-day-badge--opened"><i class="bi bi-folder2-open"></i></span>
                <div class="sh-case-day-bar">
                    <span>${openedLabel}</span>
                </div>
            </div>
            <div class="sh-case-note-row">
                <span class="sh-case-note-icon"><i class="fas fa-folder-open"></i></span>
                <div class="sh-case-note-body">
                    <div class="sh-case-note-head">Opened by <strong>${escapeHtml(record.counselor || 'A counselor')}</strong> &middot; ${roleLine} &middot; ${escapeHtml(formatDate(record.caseDate))}</div>
                    ${record.caseSummary ? `<div class="sh-case-note-text">${escapeHtml(record.caseSummary)}</div>` : ''}
                    ${record.referralCode ? `<div style="margin-top:8px;"><a href="referrals?id=${encodeURIComponent(record.referralCode)}" class="btn btn-outline btn-sm"><i class="bi bi-box-arrow-up-right"></i> View Referral</a></div>` : ''}
                </div>
            </div>
        </div>`;

    const ongoingNode = record.status !== 'closed' ? `
        <div class="sh-case-day">
            <div class="sh-case-day-row">
                <span class="sh-case-day-badge sh-case-day-badge--ongoing"></span>
                <span class="sh-case-day-ongoing-text">Case ongoing — add another session or follow-up.</span>
            </div>
        </div>` : '';

    return `<div class="case-timeline-rail sh-case-thread-days">${openedNode}${eventNodes.join('')}${ongoingNode}</div>`;
}

function toggleStudentDrawer(caseId) {
    openDrawerId = openDrawerId === caseId ? null : caseId;
    renderRecentCases();
}

function toggleStudentGroup(caseId) {
    if (expandedStudentGroups.has(caseId)) {
        expandedStudentGroups.delete(caseId);
    } else {
        expandedStudentGroups.add(caseId);
    }
    renderRecentCases();
}

/* ---- Helpers ---- */
// Counts follow_up rows already on this case by their Title — 'Counseling
// Session' vs 'Follow-up' (see saveFollowUp()) — so the drawer can show a
// running total of each without a separate query. A row saved before this
// distinction existed has no title, and counts as 'Follow-up' to match the
// same default api/follow-up now applies server-side.
function countFollowUpsByTitle(record, title) {
    return (record.followUps || []).filter(f => (f.title || 'Follow-up') === title).length;
}

function initials(name) {
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function resetForm() {
    document.getElementById('caseCreateForm').reset();
    clearCaseFieldErrors();
    caseStudents = [];
    // Only ever meant for the one case just saved (or abandoned) — never
    // carry it over to the next case opened in this same page session.
    pendingReferralCode = '';
    document.getElementById('assignedCounselor').value = getCurrentUser()?.name || 'Assigned counselor';
    setTodayDate('caseDate');
    const followUpDate = document.getElementById('followUpDate');
    if (followUpDate) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        followUpDate.value = nextWeek.toISOString().split('T')[0];
    }
    renderStudentList();
}

/* ---- Counseling info panel (per student, per case) ---- */
function openCounselingPanel(caseId, studentId) {
    const record  = caseDrafts.find(r => r.id === caseId);
    const student = record?.students.find(s => s.id === studentId);
    if (!record || !student) return;

    record.counselingRecords = record.counselingRecords || {};
    const counseling = record.counselingRecords[studentId] || {
        categoryId:   record.categoryId   || '',
        categoryName: record.categoryName || '',
        scenario_id:  '',
        action:       '',
        reason:       '',
        document_id:  ''
    };

    const modal = document.getElementById('counselingInfoModal');
    const body  = document.getElementById('counselingInfoBody');

    const caseDateFormatted = record.caseDate
        ? new Date(record.caseDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '—';

    // Category is set via the Follow-up flow, not here - show the most recent
    // follow-up's category for this student, read-only.
    const studentFollowUps = (record.followUps || []).filter(f => f.studentId === studentId);
    const latestCategoryName = studentFollowUps.length
        ? studentFollowUps[studentFollowUps.length - 1].categoryName
        : (counseling.categoryName || '');

    body.innerHTML = `
        <div class="rc-layout">
            <div class="rc-sidebar">
                <div class="rc-avatar-lg">${initials(student.name)}</div>
                <div class="rc-profile-rows">
                    <div class="rc-profile-row"><span class="rc-label">NAME</span><span class="rc-value">${escapeHtml(student.name)}</span></div>
                    <div class="rc-profile-row"><span class="rc-label">GRADE / SEC</span><span class="rc-value">${escapeHtml(formatGradeLabel(student.grade_name || student.grade_level || student.grade_id || student.Grade || student.grade))}</span></div>
                    <div class="rc-profile-row"><span class="rc-label">ROLE</span><span class="rc-value">${escapeHtml(student.role)}</span></div>
                    <div class="rc-profile-row"><span class="rc-label">AGE</span><span class="rc-value"><input type="text" class="rc-inline-input" id="ci-age" value="${escapeHtml(counseling.age || '')}" placeholder="—"></span></div>
                    <div class="rc-profile-row"><span class="rc-label">ADDRESS</span><span class="rc-value"><input type="text" class="rc-inline-input" id="ci-address" value="${escapeHtml(counseling.address || '')}" placeholder="—"></span></div>
                    <div class="rc-profile-row"><span class="rc-label">MOTHER</span><span class="rc-value"><input type="text" class="rc-inline-input" id="ci-mother" value="${escapeHtml(counseling.mother || '')}" placeholder="—"></span></div>
                    <div class="rc-profile-row"><span class="rc-label">CONTACT</span><span class="rc-value"><input type="text" class="rc-inline-input" id="ci-contact" value="${escapeHtml(counseling.contact || '')}" placeholder="—"></span></div>
                    <div class="rc-profile-row"><span class="rc-label">FATHER</span><span class="rc-value"><input type="text" class="rc-inline-input" id="ci-father" value="${escapeHtml(counseling.father || '')}" placeholder="—"></span></div>
                    <div class="rc-profile-row"><span class="rc-label">CONTACT NO.</span><span class="rc-value"><input type="text" class="rc-inline-input" id="ci-contactno" value="${escapeHtml(counseling.contactNo || '')}" placeholder="—"></span></div>
                </div>
                <div class="rc-sidebar-footer">
                    <div class="rc-profile-row"><span class="rc-label">PROBLEMS</span><span class="rc-value">${(record.followUps || []).filter(f => f.studentId === student.id).length} follow-ups</span></div>
                    <div class="rc-profile-row"><span class="rc-label">DATE</span><span class="rc-value">${caseDateFormatted}</span></div>
                </div>
            </div>

            <div class="rc-main">
                <div class="rc-form-row-two">
                    <div class="rc-form-field">
                        <label class="rc-form-label">SECTION</label>
                        <input type="text" id="ci-section" class="rc-form-input" value="${escapeHtml(record.sectionName || '')}" readonly>
                    </div>
                    <div class="rc-form-field">
                        <label class="rc-form-label">CATEGORY</label>
                        <input type="text" id="ci-category" class="rc-form-input" value="${escapeHtml(latestCategoryName || '—')}" readonly>
                    </div>
                </div>

                <div class="rc-form-field">
                    <label class="rc-form-label">DESCRIPTIONS</label>
                    <textarea id="ci-scenario" class="rc-form-textarea" rows="4" placeholder="Describe the counseling scenario.">${escapeHtml(counseling.scenario_id || '')}</textarea>
                </div>

                <div class="rc-form-field">
                    <label class="rc-form-label">ACTION TAKEN</label>
                    <textarea id="ci-action" class="rc-form-textarea" rows="4" placeholder="e.g. Conducted one-on-one session">${escapeHtml(counseling.action || '')}</textarea>
                </div>

                <div class="rc-form-field">
                    <label class="rc-form-label">REASON</label>
                    <textarea id="ci-reason" class="rc-form-textarea" rows="3" placeholder="e.g. Reported bullying incident">${escapeHtml(counseling.reason || '')}</textarea>
                </div>

                <div class="rc-form-field">
                    <label class="rc-form-label">SUPPORTING DOCUMENT</label>
                    <input type="text" id="ci-document" class="rc-form-input" value="${escapeHtml(counseling.document_id || '')}" placeholder="Document reference">
                </div>
            </div>
        </div>
    `;

    modal.dataset.caseId    = caseId;
    modal.dataset.studentId = studentId;

    // Try to auto-fill student details from backend when available.
    (async function tryPrefillStudentDetails() {
        const api = '../../api/get-student-details';

        // Candidate ID fields that may map to the DB student id
        const idCandidates = [student.StudentId, student.studentId, student.student_id, student.schoolStudentId, student.id];

        function setIfEmpty(elId, value) {
            try {
                const el = document.getElementById(elId);
                if (!el) return;
                if (!el.value || String(el.value).trim() === '') el.value = value || '';
            } catch (e) { /* ignore */ }
        }

        function computeAgeFromDate(d) {
            if (!d) return '';
            const bd = new Date(d);
            if (isNaN(bd)) return '';
            const now = new Date();
            let age = now.getFullYear() - bd.getFullYear();
            const m = now.getMonth() - bd.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
            return String(age);
        }

        // small inline loader appended to modal body so user sees activity
        let loader = null;
        try {
            const bodyEl = document.getElementById('counselingInfoBody');
            if (bodyEl) {
                loader = document.createElement('div');
                loader.id = 'ci-loader';
                loader.textContent = 'Loading student details…';
                loader.style.cssText = 'padding:8px 12px;font-size:13px;color:#666;opacity:0.95;';
                bodyEl.prepend(loader);
            }

            for (const sid of idCandidates) {
                if (!sid) continue;
                try {
                    const res = await fetch(`${api}?student_id=${encodeURIComponent(sid)}`);
                    if (!res.ok) continue;
                    const json = await res.json();
                    if (!json || !json.success || !json.student) continue;

                    const s = json.student || {};

                    // Only fill values when empty so user can override or type freely
                    // Some records have the mother/father's info entered under the
                    // guardian table instead of the dedicated parent record (with
                    // Relationship set to "mother"/"father"). Route it to the right
                    // field instead of letting it default into Contact.
                    const guardianRelationship = (json.guardian_Relationship || '').trim().toLowerCase();
                    const guardianIsMother = guardianRelationship === 'mother';
                    const guardianIsFather = guardianRelationship === 'father';

                    setIfEmpty('ci-age', computeAgeFromDate(s.BirthDate || s.birthdate || s.Birth_Date || s.Birthdate));
                    setIfEmpty('ci-address', s.Address || json.father_Address || json.mother_Address || json.guardian_Address || '');
                    setIfEmpty('ci-mother', json.mother_name || (json.mother_FirstName ? `${json.mother_FirstName} ${json.mother_LastName || ''}`.trim() : '') || (guardianIsMother ? json.guardian_name : ''));
                    setIfEmpty('ci-father', json.father_name || (json.father_FirstName ? `${json.father_FirstName} ${json.father_LastName || ''}`.trim() : '') || (guardianIsFather ? json.guardian_name : ''));
                    setIfEmpty('ci-contact', (guardianIsMother || guardianIsFather) ? '' : (json.guardian_name || json.mother_name || json.father_name || ''));
                    setIfEmpty('ci-contactno', json.guardian_MobileNumber || json.father_ContactNumber || json.mother_ContactNumber || '');

                    // Stop after first successful match
                    break;
                } catch (e) {
                    // ignore and try next candidate
                    continue;
                }
            }
        } finally {
            try { if (loader && loader.remove) loader.remove(); } catch (e) { /* ignore */ }
        }
    })();

    modal.classList.add('show');

    const headerMeta = document.getElementById('rcHeaderMeta');
    if (headerMeta) {
        headerMeta.innerHTML = `
            <div class="rc-header-meta-item"><div class="rc-header-meta-label">Case ID</div><div class="rc-header-meta-val">${escapeHtml(record.id)}</div></div>
            <div class="rc-header-meta-item"><div class="rc-header-meta-label">Date Logged</div><div class="rc-header-meta-val">${record.caseDate ? new Date(record.caseDate + 'T00:00:00').toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'}) : '—'}</div></div>
            <div class="rc-header-meta-item"><div class="rc-header-meta-label">Counselor</div><div class="rc-header-meta-val">${escapeHtml(record.counselor || '—')}</div></div>
        `;
    }
}

function closeCounselingPanel() {
    document.getElementById('counselingInfoModal').classList.remove('show');
}

async function saveCounselingInfo() {
    const modal     = document.getElementById('counselingInfoModal');
    const caseId    = modal.dataset.caseId;
    const studentId = modal.dataset.studentId;

    const record = caseDrafts.find(r => r.id === caseId);
    if (!record) return;

    record.counselingRecords = record.counselingRecords || {};

    // Category is set via the Follow-up flow, not here.
    const existing = record.counselingRecords[studentId] || {};

    record.counselingRecords[studentId] = {
        categoryId:   existing.categoryId   || '',
        categoryName: existing.categoryName || '',
        scenario_id:  document.getElementById('ci-scenario')?.value.trim()  || '',
        action:       document.getElementById('ci-action')?.value.trim()    || '',
        reason:       document.getElementById('ci-reason')?.value.trim()    || '',
        document_id:  document.getElementById('ci-document')?.value.trim() || '',
        age:          document.getElementById('ci-age')?.value.trim()      || '',
        address:      document.getElementById('ci-address')?.value.trim()  || '',
        mother:       document.getElementById('ci-mother')?.value.trim()   || '',
        father:       document.getElementById('ci-father')?.value.trim()   || '',
        contact:      document.getElementById('ci-contact')?.value.trim()  || '',
        contactNo:    document.getElementById('ci-contactno')?.value.trim()|| '',
    };

    try {
        await persistCaseUpdate(record);
        saveData('counselor_case_records', caseDrafts);
        showAlert('Counseling information saved.', 'success');
        closeCounselingPanel();
    } catch (error) {
        console.error('Failed to update counseling info:', error);
        showAlert(`Failed to save counseling info: ${error.message}`, 'warning');
    }
}

/* ---- Follow-up modal ----
   Category and date are recorded once per follow-up session and apply to
   every student in the case; the note underneath each student is theirs
   individually. Saved via api/follow-up into the follow_up (session)
   and follow_up_note (per-student note) tables, not the old followUps
   JSON blob. */
const FOLLOW_UP_API = '../../api/follow-up';

// How many students show as tiles before the rest collapse into a
// "+N more" tile — matches STUDENT_PREVIEW_LIMIT used by the "View
// students" drawer elsewhere on this page, for the same reason (a case
// can have far more students than comfortably fit in one form).
const FOLLOW_UP_PREVIEW_LIMIT = 2;

// Category lives per-student now (not one shared "applies to all students"
// dropdown) — different students in the same case can be presenting
// completely different behavior, so each one gets its own category picker
// alongside their note. Defaults to whatever category was picked for them
// last time, same as the note textarea defaulting to their last note.
function renderFollowUpNoteTile(record, s, autoExpand) {
    const existing = (record.followUps || []).filter(f => f.studentId === s.id);
    const last     = existing[existing.length - 1];
    const hasNote  = !!(last?.initialAction || '').trim();
    const categories = getCategoriesForRecord(record);
    const lastCategoryId = last?.categoryId || '';

    // Counts every follow-up already on record for this student in this
    // case, so it's clear at a glance whether this is their first session
    // or a continuation — matches the "Session N" labeling already used on
    // the Student History timeline for the same underlying records.
    const sessionNumber = existing.length + 1;
    const sessionLabel = sessionNumber === 1 ? 'First session' : `Session ${sessionNumber}`;

    return `
    <div class="fu-note-tile ${autoExpand && hasNote ? 'expanded' : ''}">
        <button type="button" class="fu-note-tile-header" onclick="toggleFollowUpNoteTile(this)">
            <div class="fu-student-avatar">${initials(s.name)}</div>
            <div class="fu-note-tile-meta">
                <span class="fu-note-tile-name">${escapeHtml(s.name)}</span>
                <span class="fu-note-tile-sub">${escapeHtml(s.grade)} &middot; ${sessionLabel}</span>
            </div>
            ${hasNote ? '<span class="fu-recorded-dot" title="Has follow-up"></span>' : ''}
            <i class="bi bi-chevron-down fu-note-tile-caret"></i>
        </button>
        <div class="fu-note-tile-body">
            <span class="fu-form-label fu-note-category-label">Category — this student's behavior</span>
            <select class="fu-form-select fu-note-category" data-student-id="${escapeHtml(s.id)}">
                <option value="">Select category</option>
                ${categories.map(c =>
                    `<option value="${escapeHtml(c.CaseId)}" data-name="${escapeHtml(c.CategoryName)}" ${lastCategoryId === c.CaseId ? 'selected' : ''}>${escapeHtml(c.CategoryName)}</option>`
                ).join('')}
            </select>
            <span class="fu-form-label fu-note-category-label">Comment — behavior or action taken</span>
            <textarea
                class="fu-form-textarea fu-note-textarea"
                data-student-id="${escapeHtml(s.id)}"
                data-student-name="${escapeHtml(s.name)}"
                rows="3"
                placeholder="Describe ${escapeHtml(s.name)}'s behavior or action this session…"
            ></textarea>
        </div>
    </div>`;
}

// Accordion behavior: opening one student's note closes whichever other
// one was open (across both the main tile list and the "+N more" popover),
// so only one note is expanded at a time instead of stacking up.
function toggleFollowUpNoteTile(headerEl) {
    const tile = headerEl.closest('.fu-note-tile');
    if (!tile) return;

    const root = tile.closest('.fu-layout-single') || document;
    const shouldExpand = !tile.classList.contains('expanded');

    root.querySelectorAll('.fu-note-tile.expanded').forEach(other => {
        if (other !== tile) other.classList.remove('expanded');
    });

    tile.classList.toggle('expanded', shouldExpand);
}

function toggleFollowUpMorePopover(headerEl) {
    headerEl.closest('.fu-note-more-wrapper')?.classList.toggle('open');
}

function closeFollowUpMorePopover() {
    document.querySelector('.fu-note-more-wrapper.open')?.classList.remove('open');
}

function openFollowUpModal(caseId) {
    const record = caseDrafts.find(r => r.id === caseId);
    if (!record) return;

    const modal    = document.getElementById('followUpModal');
    const body     = document.getElementById('followUpBody');
    const students = record.students || [];

    const visibleStudents = students.slice(0, FOLLOW_UP_PREVIEW_LIMIT);
    const hiddenStudents   = students.slice(FOLLOW_UP_PREVIEW_LIMIT);

    // At most one tile should start expanded, to match the accordion
    // behavior (opening one closes any other) — pick the first student
    // in list order who already has a saved note.
    const firstNotedStudent = students.find(s => {
        const existing = (record.followUps || []).filter(f => f.studentId === s.id);
        return !!(existing[existing.length - 1]?.initialAction || '').trim();
    });

    body.innerHTML = `
        <div class="fu-layout-single">
            <div class="fu-form-row-two">
                <div class="fu-form-field">
                    <label class="fu-form-label">SECTION</label>
                    <input type="text" class="fu-form-input" value="${escapeHtml(record.sectionName || '—')}" readonly>
                </div>
                <div class="fu-form-field">
                    <label class="fu-form-label">DATE</label>
                    <input type="date" id="fu-date" class="fu-form-input" value="${new Date().toISOString().split('T')[0]}" readonly>
                </div>
            </div>

            <div class="fu-form-field">
                <label class="fu-form-label">Individual notes &amp; category (per student)</label>
                <div class="fu-note-tiles">
                    ${students.length ? visibleStudents.map(s => renderFollowUpNoteTile(record, s, s === firstNotedStudent)).join('') : '<p class="empty-state" style="padding:16px;">No students linked to this case.</p>'}
                    ${hiddenStudents.length ? `
                        <div class="fu-note-more-wrapper">
                            <div class="fu-note-tile fu-note-more">
                                <button type="button" class="fu-note-tile-header" onclick="toggleFollowUpMorePopover(this)">
                                    <div class="fu-student-avatar cp-avatar-more"><i class="bi bi-folder2"></i></div>
                                    <div class="fu-note-tile-meta">
                                        <span class="fu-note-tile-name">+${hiddenStudents.length} more student${hiddenStudents.length > 1 ? 's' : ''}</span>
                                        <span class="fu-note-tile-sub">Click to add their notes</span>
                                    </div>
                                </button>
                            </div>
                            <div class="fu-note-more-popover-backdrop" onclick="closeFollowUpMorePopover()"></div>
                            <div class="fu-note-more-popover" onclick="event.stopPropagation()">
                                <div class="student-more-popover-header">
                                    <span>${hiddenStudents.length} more student${hiddenStudents.length > 1 ? 's' : ''}</span>
                                    <button type="button" class="drawer-close" onclick="closeFollowUpMorePopover()">
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                                <div class="fu-note-more-popover-list">
                                    ${hiddenStudents.map(s => renderFollowUpNoteTile(record, s, s === firstNotedStudent)).join('')}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    modal.dataset.caseId = caseId;
    modal.classList.add('show');
}

function closeFollowUpModal() {
    document.getElementById('followUpModal').classList.remove('show');
    closeFollowUpMorePopover();
}

async function saveFollowUp() {
    const modal  = document.getElementById('followUpModal');
    const caseId = modal.dataset.caseId;
    const record = caseDrafts.find(r => r.id === caseId);
    if (!record) return;

    record.followUps = record.followUps || [];

    const date = document.getElementById('fu-date')?.value;
    if (!date) {
        showAlert('Please select a follow-up date.', 'warning');
        return;
    }

    // Category is per-student now (see renderFollowUpNoteTile) — each tile
    // carries its own select alongside its textarea, so a student's
    // category/note pair is read from the same tile, not a shared field.
    const tiles = Array.from(modal.querySelectorAll('.fu-note-tile:not(.fu-note-more)'));
    const entries = tiles.map(tile => {
        const textarea  = tile.querySelector('.fu-note-textarea');
        const catSelect = tile.querySelector('.fu-note-category');
        const catOpt    = catSelect?.selectedOptions[0];
        return {
            studentId:    textarea?.dataset.studentId || '',
            studentName:  textarea?.dataset.studentName || '',
            note:         textarea?.value.trim() || '',
            categoryId:   catSelect?.value || '',
            categoryName: catOpt?.dataset.name || ''
        };
    }).filter(e => e.studentId && e.note);

    if (!entries.length) {
        showAlert('Enter a note for at least one student before saving.', 'warning');
        return;
    }

    const missingCategory = entries.find(e => !e.categoryId);
    if (missingCategory) {
        showAlert(`Please select a category for ${missingCategory.studentName || 'that student'}.`, 'warning');
        return;
    }

    const invalidCategory = entries.find(e => !isCategoryInSection(record.sectionId, e.categoryId));
    if (invalidCategory) {
        showAlert('Selected category does not belong to this case section.', 'warning');
        return;
    }

    // Confirmed only after every field above is already valid — same
    // reasoning as submitAppointments()'s confirmAction() call above.
    confirmAction(
        'Are you sure you want to save this follow-up?',
        () => finishSaveFollowUp(modal, caseId, record, date, entries)
    );
}

async function finishSaveFollowUp(modal, caseId, record, date, entries) {
    const user = getCurrentUser();

    try {
        // One follow_up row per student, not one shared row for the whole
        // batch — the table only has room for a single category per row,
        // and each student here can now have a different one.
        for (const entry of entries) {
            const res = await fetch(FOLLOW_UP_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    case_uid:       record.id,
                    title:          'Follow-up',
                    category_id:    entry.categoryId,
                    category_name:  entry.categoryName,
                    follow_up_date: date,
                    counselor_id:   user?.id   || '',
                    counselor_name: user?.name || '',
                    notes: [{ student_id: entry.studentId, student_name: entry.studentName, note: entry.note }]
                })
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);

            record.followUps.push({
                followUpId:    `FU-${json.data?.follow_up_id ?? Date.now()}-${entry.studentId}`,
                title:         'Follow-up',
                studentId:     entry.studentId,
                categoryId:    entry.categoryId,
                categoryName:  entry.categoryName,
                initialAction: entry.note,
                followUpDate:  date,
                recordedAt:    new Date().toISOString(),
                counselorName: user?.name || ''
            });
        }

        saveData('counselor_case_records', caseDrafts);
        showAlert('Follow-up saved successfully.', 'success');
        closeFollowUpModal();
        renderRecentCases();
    } catch (error) {
        console.error('Failed to save follow-up:', error);
        showAlert(`Failed to save follow-up: ${error.message}`, 'warning');
    }
}

const APPOINTMENT_REQUEST_API = '../../api/appointment-request';
const SCHEDULE_EVENTS_API     = '../../api/schedule-events';

// Appoint modal calendar state — lets the counselor see which days already
// have schedule events or booked appointments (so they can pick a vacant one)
// instead of typing a date blind.
let appointCalendarViewDate = new Date();
let appointSelectedDate     = '';
let appointScheduleEvents   = [];
let appointBookedEvents     = [];

function appointGetCurrentSchool() {
    const user = getCurrentUser();
    return user?.school_attended || '';
}

function appointGetTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function appointIsWeekend(dateStr) {
    const day = new Date(`${dateStr}T00:00:00`).getDay();
    return day === 0 || day === 6;
}

async function loadAppointCalendarData() {
    const school = appointGetCurrentSchool();
    if (!school) {
        appointScheduleEvents = [];
        appointBookedEvents = [];
        return;
    }

    const month = `${appointCalendarViewDate.getFullYear()}-${String(appointCalendarViewDate.getMonth() + 1).padStart(2, '0')}`;

    try {
        const [scheduleRes, apptRes] = await Promise.all([
            fetch(`${SCHEDULE_EVENTS_API}?school=${encodeURIComponent(school)}&month=${encodeURIComponent(month)}`).then(r => r.json()),
            fetch(`${APPOINTMENT_REQUEST_API}?school=${encodeURIComponent(school)}&role=counselor`).then(r => r.json())
        ]);
        appointScheduleEvents = scheduleRes?.success ? (scheduleRes.data || []) : [];
        appointBookedEvents   = apptRes?.success ? (apptRes.data || []).filter(r => r.status !== 'rejected') : [];
    } catch (error) {
        console.error('Failed to load calendar availability:', error);
        appointScheduleEvents = [];
        appointBookedEvents = [];
    }
}

function appointEventsForDate(dateStr) {
    const schedule = appointScheduleEvents.filter(ev => {
        const start = String(ev.date || '').split('T')[0];
        const end   = String(ev.endDate || '').split('T')[0] || start;
        return start && dateStr >= start && dateStr <= end;
    });
    const appts = appointBookedEvents.filter(r => String(r.preferred_date || '').split('T')[0] === dateStr);
    return { schedule, appts };
}

function renderAppointCalendar() {
    const grid  = document.getElementById('appointCalendarGrid');
    const label = document.getElementById('appointCalendarMonth');
    if (!grid || !label) return;

    const today       = appointGetTodayDateStr();
    const year        = appointCalendarViewDate.getFullYear();
    const month       = appointCalendarViewDate.getMonth();
    const firstDay    = new Date(year, month, 1);
    const startDay    = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells  = Math.ceil((startDay + daysInMonth) / 7) * 7;

    label.textContent = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = dayNames.map(d => `<div class="appoint-mini-weekday">${d}</div>`).join('');

    for (let i = 0; i < totalCells; i++) {
        const cellDay = i - startDay + 1;
        if (cellDay < 1 || cellDay > daysInMonth) {
            html += '<div class="appoint-mini-day is-outside"></div>';
            continue;
        }

        const dateStr        = `${year}-${String(month + 1).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`;
        const { schedule, appts } = appointEventsForDate(dateStr);
        const isPast         = dateStr < today;
        const isWeekendDay   = appointIsWeekend(dateStr);
        const isDisabled     = isPast || isWeekendDay;

        const classes = ['appoint-mini-day'];
        if (dateStr === today) classes.push('is-today');
        if (isDisabled) classes.push('is-disabled');
        if (!isDisabled && (schedule.length || appts.length)) classes.push('is-busy');
        if (dateStr === appointSelectedDate) classes.push('is-selected');

        html += `<div class="${classes.join(' ')}" data-date="${dateStr}" ${isDisabled ? '' : `onclick="selectAppointDate('${dateStr}')"`}><span class="appoint-day-num">${cellDay}</span></div>`;
    }

    grid.innerHTML = html;
    renderAppointDayEvents();
}

function renderAppointDayEvents() {
    const el        = document.getElementById('appointDayEvents');
    const dateLabel = document.getElementById('appointSelectedDateLabel');

    if (dateLabel) {
        dateLabel.innerHTML = appointSelectedDate
            ? `<i class="bi bi-calendar-check"></i> ${escapeHtml(new Date(`${appointSelectedDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}`
            : '<i class="bi bi-calendar-x"></i> <span class="placeholder">No date selected — pick a day on the calendar</span>';
    }
    if (!el) return;

    if (!appointSelectedDate) {
        el.className = 'appoint-day-events';
        el.innerHTML = '';
        return;
    }

    const { schedule, appts } = appointEventsForDate(appointSelectedDate);
    if (!schedule.length && !appts.length) {
        el.className = 'appoint-day-events is-vacant';
        el.innerHTML = '<i class="bi bi-check-circle"></i> Fully vacant — no schedule or appointments on this day.';
        return;
    }

    const parts = [
        ...schedule.map(ev => `${escapeHtml(ev.title || 'Event')} (${ev.allDay ? 'All day' : escapeHtml(ev.time || '')})`),
        ...appts.map(a => `Appointment: ${escapeHtml(a.student_name || 'Student')} @ ${escapeHtml(a.preferred_time || '')}`)
    ];
    el.className = 'appoint-day-events is-busy-day';
    el.innerHTML = `<i class="bi bi-exclamation-circle"></i> Already booked: ${parts.join(', ')}`;
}

function selectAppointDate(dateStr) {
    appointSelectedDate = dateStr;
    renderAppointCalendar();
}

function changeAppointCalendarMonth(delta) {
    appointCalendarViewDate = new Date(appointCalendarViewDate.getFullYear(), appointCalendarViewDate.getMonth() + delta, 1);
    loadAppointCalendarData().then(renderAppointCalendar);
}

/* Appointment requests need a real numeric student id (see appointment-request.php,
   which casts to int and rejects 0). A case's student can lack one if they were
   added as a local fallback (see generateId() in addStudent) instead of a real
   DB lookup match, so those can't be appointed. */
function hasValidStudentId(student) {
    return /^\d+$/.test(String(student?.id ?? '').trim());
}

function updateAppointSelectedCount() {
    const el = document.getElementById('appointSelectedCount');
    if (!el) return;
    const count = document.querySelectorAll('.appoint-student-checkbox:checked').length;
    el.textContent = `${count} student${count === 1 ? '' : 's'} selected`;
}

function openAppointModal(caseId) {
    const record = caseDrafts.find(r => r.id === caseId);
    if (!record) return;

    const modal    = document.getElementById('appointModal');
    const body     = document.getElementById('appointBody');
    const students = record.students || [];

    appointCalendarViewDate = new Date();
    appointSelectedDate     = '';

    body.innerHTML = `
        <div class="appoint-layout">
            <div class="appoint-top-row">
                <div class="fu-student-list appoint-student-list">
                    ${students.length ? `
                    <div class="fu-select-all-row">
                        <label class="fu-select-all-label">
                            <input type="checkbox" id="appoint-select-all"> Select all (${students.length})
                        </label>
                    </div>` : ''}
                    ${students.map(s => {
                        const validId = hasValidStudentId(s);
                        return `
                        <label class="fu-student-row ${validId ? '' : 'fu-student-row--disabled'}">
                            <input type="checkbox" class="appoint-student-checkbox" value="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" ${validId ? '' : 'disabled'} hidden>
                            <div class="fu-student-avatar">${initials(s.name)}</div>
                            <div class="fu-student-meta">
                                <span class="fu-student-name">${escapeHtml(s.name)}</span>
                                <span class="fu-student-sub">${validId ? escapeHtml(s.grade || '—') : 'Missing student ID — cannot appoint'}</span>
                            </div>
                            <i class="bi bi-check-circle-fill fu-check-icon"></i>
                        </label>`;
                    }).join('') || '<p class="empty-state" style="padding:16px;">No students linked to this case.</p>'}
                </div>

                <div class="appoint-calendar-col">
                    <div class="appoint-calendar-header">
                        <div class="appoint-calendar-title-group">
                            <span class="appoint-calendar-eyebrow">Select a date</span>
                            <span class="appoint-calendar-title"><i class="bi bi-calendar3"></i> <span id="appointCalendarMonth"></span></span>
                        </div>
                        <div class="appoint-calendar-nav">
                            <button type="button" class="appoint-calendar-nav-btn" onclick="changeAppointCalendarMonth(-1)" aria-label="Previous month"><i class="bi bi-chevron-left"></i></button>
                            <button type="button" class="appoint-calendar-nav-btn" onclick="changeAppointCalendarMonth(1)" aria-label="Next month"><i class="bi bi-chevron-right"></i></button>
                        </div>
                    </div>
                    <div class="appoint-mini-grid" id="appointCalendarGrid"></div>
                    <div class="appoint-calendar-legend">
                        <span class="appoint-legend-item"><span class="appoint-legend-dot"></span> Booked</span>
                        <span class="appoint-legend-item"><span class="appoint-legend-ring"></span> Today</span>
                        <span class="appoint-legend-item"><span class="appoint-legend-swatch"></span> Selected</span>
                    </div>
                    <div class="appoint-day-events" id="appointDayEvents"></div>
                </div>
            </div>

            <div class="appoint-bottom-row">
                <div class="appoint-details-header">
                    <span class="appoint-section-label">Appointment details</span>
                    <div class="appoint-selected-date-chip" id="appointSelectedDateLabel"></div>
                </div>
                <div class="fu-form-row-two">
                    <div class="fu-form-field">
                        <label class="fu-form-label">Preferred time</label>
                        <select id="appoint-time" class="fu-form-input">
                            <option value="">Select a time...</option>
                            <optgroup label="Morning (8:00 AM - 12:00 PM)">
                                <option value="08:00">8:00 AM</option>
                                <option value="08:30">8:30 AM</option>
                                <option value="09:00">9:00 AM</option>
                                <option value="09:30">9:30 AM</option>
                                <option value="10:00">10:00 AM</option>
                                <option value="10:30">10:30 AM</option>
                                <option value="11:00">11:00 AM</option>
                                <option value="11:30">11:30 AM</option>
                            </optgroup>
                            <optgroup label="Afternoon (1:00 PM - 4:00 PM)">
                                <option value="13:00">1:00 PM</option>
                                <option value="13:30">1:30 PM</option>
                                <option value="14:00">2:00 PM</option>
                                <option value="14:30">2:30 PM</option>
                                <option value="15:00">3:00 PM</option>
                                <option value="15:30">3:30 PM</option>
                            </optgroup>
                        </select>
                    </div>
                    <div class="fu-form-field">
                        <label class="fu-form-label">Reason</label>
                        <input type="text" id="appoint-reason" class="fu-form-input" placeholder="e.g. Follow-up counseling session" value="Follow-up for case ${escapeHtml(record.id)}">
                    </div>
                </div>
                <div class="fu-form-field">
                    <label class="fu-form-label">Notes (optional)</label>
                    <textarea id="appoint-notes" class="fu-form-textarea" rows="3" placeholder="Additional context for this appointment"></textarea>
                </div>
                <p class="appoint-count-hint" id="appointSelectedCount">0 students selected</p>
            </div>
        </div>
    `;

    body.querySelectorAll('.appoint-student-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            cb.closest('.fu-student-row')?.classList.toggle('fu-student-row--active', cb.checked);
            updateAppointSelectedCount();
        });
    });

    const selectAll = document.getElementById('appoint-select-all');
    selectAll?.addEventListener('change', () => {
        body.querySelectorAll('.appoint-student-checkbox:not(:disabled)').forEach(cb => {
            cb.checked = selectAll.checked;
            cb.closest('.fu-student-row')?.classList.toggle('fu-student-row--active', cb.checked);
        });
        updateAppointSelectedCount();
    });

    modal.dataset.caseId = caseId;
    modal.classList.add('show');
    loadAppointCalendarData().then(renderAppointCalendar);
}

function closeAppointModal() {
    document.getElementById('appointModal').classList.remove('show');
    appointSelectedDate = '';
}

async function submitAppointments() {
    const modal  = document.getElementById('appointModal');
    const caseId = modal.dataset.caseId;
    const record = caseDrafts.find(r => r.id === caseId);
    const body   = document.getElementById('appointBody');

    const checked = Array.from(body.querySelectorAll('.appoint-student-checkbox:checked'));
    if (!checked.length) {
        showAlert('Select at least one student to appoint.', 'warning');
        return;
    }

    const date   = appointSelectedDate;
    const time   = document.getElementById('appoint-time')?.value;
    const reason = document.getElementById('appoint-reason')?.value.trim();
    const notes  = document.getElementById('appoint-notes')?.value.trim();

    if (!date) {
        showAlert('Pick a date on the calendar for this appointment.', 'warning');
        return;
    }
    if (!time || !reason) {
        showAlert('Please fill in the time and reason for the appointment.', 'warning');
        return;
    }

    // Confirmed only after every field above is already valid — asking
    // "are you sure" before that would risk confirming, then immediately
    // hitting a validation error, which reads as if the confirmation itself
    // failed. confirmAction() (js/utils.js) is styled with this app's own
    // .modal chrome instead of the browser's plain native confirm(), and
    // is event-driven rather than blocking — so everything that used to
    // run after a synchronous confirm() moves into its Yes callback.
    confirmAction(
        `Are you sure you want to appoint the selected student${checked.length > 1 ? 's' : ''}?`,
        () => finishAppointmentSubmission(modal, caseId, record, checked, date, time, reason, notes)
    );
}

async function finishAppointmentSubmission(modal, caseId, record, checked, date, time, reason, notes) {
    const submitBtn = document.getElementById('appointSubmitBtn');
    submitBtn.disabled = true;
    try {


    const user   = getCurrentUser();
    const school = user?.school_attended || '';

    // Appointments made here are the counselor directly scheduling a
    // student (not a student requesting one), so the server auto-approves
    // them instead of leaving them pending review — see appointment-request.php.
    const results = await Promise.allSettled(checked.map(cb => fetch(APPOINTMENT_REQUEST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            student_id:     cb.value,
            student_name:   cb.dataset.name,
            preferred_date: date,
            preferred_time: time,
            reason,
            notes,
            school,
            role:         user?.role || '',
            counselor_id: user?.id || 0,
            case_uid:     caseId
        })
    }).then(async res => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
        return json;
    })));

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed    = results.filter(r => r.status === 'rejected');
    // Only the students whose appointment actually went through get logged
    // as a counseling session — same order as `checked` since allSettled
    // preserves it.
    const bookedStudents = checked.filter((cb, i) => results[i].status === 'fulfilled');

    if (succeeded) {
        showAlert(`Appointment${succeeded > 1 ? 's' : ''} scheduled successfully for ${succeeded} student${succeeded > 1 ? 's' : ''}.`, 'success');
        closeAppointModal();

        // Booking a counseling session also logs it on the case timeline —
        // reuses the same follow_up/follow_up_note tables as
        // "Add Student Follow-up" (see saveFollowUp()), tagged via the
        // existing Title column so it's counted/shown as a session rather
        // than a follow-up. A session has no per-student behavior category
        // (it's a scheduled meeting, not an observation), so category_id is
        // sent empty — api/follow-up only requires one for a Follow-up.
        if (record && bookedStudents.length) {
            record.followUps = record.followUps || [];
            try {
                const res = await fetch(FOLLOW_UP_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        case_uid:       caseId,
                        title:          'Counseling Session',
                        category_id:    '',
                        category_name:  '',
                        follow_up_date: date,
                        counselor_id:   user?.id   || '',
                        counselor_name: user?.name || '',
                        notes: bookedStudents.map(cb => ({
                            student_id:   cb.value,
                            student_name: cb.dataset.name,
                            note: `Scheduled counseling session — ${reason}${notes ? ` (${notes})` : ''} at ${time}.`
                        }))
                    })
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);

                bookedStudents.forEach(cb => {
                    record.followUps.push({
                        followUpId:    `FU-${json.data?.follow_up_id ?? Date.now()}-${cb.value}`,
                        title:         'Counseling Session',
                        studentId:     cb.value,
                        categoryId:    '',
                        categoryName:  '',
                        initialAction: `Scheduled counseling session — ${reason}${notes ? ` (${notes})` : ''} at ${time}.`,
                        followUpDate:  date,
                        recordedAt:    new Date().toISOString(),
                        counselorName: user?.name || ''
                    });
                });
                renderRecentCases();
            } catch (error) {
                console.error('Failed to log counseling session on the case:', error);
                showAlert(`Appointment booked, but logging it on the case failed: ${error.message}`, 'warning');
            }
        }
    }
    if (failed.length) {
        console.error('Appointment request failures:', failed.map(f => f.reason?.message));
        showAlert(`${failed.length} appointment request${failed.length > 1 ? 's' : ''} failed: ${failed[0].reason?.message || 'Unknown error'}`, 'warning');
    }

    } finally {
        submitBtn.disabled = false;
    }
}

function endCase(caseId) {
    const record = caseDrafts.find(r => r.id === caseId);
    if (!record) return;

    // confirmAction() (js/utils.js) is styled with this app's own .modal
    // chrome instead of the browser's plain native confirm().
    confirmAction('Are you sure you want to end this case?', () => finishEndCase(record));
}

async function finishEndCase(record) {
    const previousStatus = record.status;
    record.status = 'closed';

    try {
        await persistCaseUpdate(record);
        saveData('counselor_case_records', caseDrafts);
        showAlert('Case closed successfully.', 'success');
        renderRecentCases();
    } catch (error) {
        record.status = previousStatus;
        console.error('Failed to end case:', error);
        showAlert(`Failed to end case: ${error.message}`, 'warning');
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}