// Teacher Referral Form Script

let personCardCounter = 0;
let activeEditCard = null;

function initReferralForm() {
    initPage();
    setTodayDate('referralDate');
    populateTeacherSchool();
    // Kicked off early (in parallel with everything else below) so it's
    // almost always already resolved by the time a person card's grade
    // dropdown needs it — see loadGradeOptionsOnce()/populateGradeOptions().
    loadGradeOptionsOnce();
    setupPeopleList();
    setupPersonEditModal();
    setupReasonChecklist();
    loadExistingReferralData();
    document.getElementById('referralForm').addEventListener('submit', submitReferralForm);
}

// "Others" reveals a free-text field when checked — kept for reasons that
// don't fit the fixed list, without letting every referral fall back to
// freeform text (which is what made the reason breakdown in Analytics
// unusable for filtering in the first place).
function setupReasonChecklist() {
    const otherCheck = document.getElementById('referralReasonOtherCheck');
    const otherText = document.getElementById('referralReasonOtherText');
    otherCheck.addEventListener('change', () => {
        otherText.style.display = otherCheck.checked ? '' : 'none';
        if (otherCheck.checked) otherText.focus();
    });
}

// Combines the checked reason boxes (plus "Others" free text, if used) into
// the single semicolon-separated string the API stores as referral_reason.
// Analytics splits on the same separator to tally each reason on its own.
function collectReferralReason() {
    const checked = Array.from(document.querySelectorAll('.referral-reason-check:checked')).map(c => c.value);
    const otherCheck = document.getElementById('referralReasonOtherCheck');
    if (otherCheck.checked) {
        const otherText = document.getElementById('referralReasonOtherText').value.trim();
        if (otherText) checked.push(otherText);
    }
    return checked.join('; ');
}

// Re-checks the boxes matching a previously saved referral_reason string
// (editing/prefill flow). Any part that doesn't match one of the fixed
// options — e.g. a referral saved before this checklist existed — is
// preserved under "Others" instead of being silently dropped.
function populateReferralReasonChecklist(storedReason) {
    if (!storedReason) return;

    const options = Array.from(document.querySelectorAll('.referral-reason-check'));
    const parts = storedReason.split(';').map(s => s.trim()).filter(Boolean);
    const candidates = parts.length ? parts : [storedReason.trim()];
    const leftover = [];

    candidates.forEach(part => {
        const match = options.find(c => c.value.toLowerCase() === part.toLowerCase());
        if (match) {
            match.checked = true;
        } else {
            leftover.push(part);
        }
    });

    if (leftover.length) {
        const otherCheck = document.getElementById('referralReasonOtherCheck');
        const otherText = document.getElementById('referralReasonOtherText');
        otherCheck.checked = true;
        otherText.value = leftover.join('; ');
        otherText.style.display = '';
    }
}

// Load existing referral data from database (if editing or viewing previous submission)
function loadExistingReferralData() {
    const urlParams = new URLSearchParams(window.location.search);
    const referralId = urlParams.get('referral_id') || urlParams.get('id');
    const studentId = urlParams.get('student_id');

    if (!referralId && !studentId) {
        return; // No existing referral to load
    }

    let apiUrl = '../../api/referral?role=teacher';
    if (referralId) {
        apiUrl += `&id=${encodeURIComponent(referralId)}`;
    } else if (studentId) {
        apiUrl += `&student_id=${encodeURIComponent(studentId)}&limit=1`;
    }

    fetch(apiUrl)
        .then(r => r.json())
        .then(result => {
            if (result.success && result.data) {
                const referralData = Array.isArray(result.data) ? result.data[0] : result.data;
                if (referralData) {
                    populateReferralForm(referralData);
                }
            }
        })
        .catch(error => console.error('Error loading existing referral:', error));
}

// Populate the shared incident fields plus the first person card — used
// only by the single-referral edit/prefill flow above (loadExistingReferralData).
function populateReferralForm(referral) {
    const sharedFieldMap = {
        date_submitted: 'referralDate',
        description: 'referralDescription',
        intervention_attempts: 'interventionAttempts',
        teacher_contact: 'teacherContact'
    };

    Object.entries(sharedFieldMap).forEach(([apiField, formFieldId]) => {
        if (referral[apiField]) {
            const element = document.getElementById(formFieldId);
            if (element) {
                let value = referral[apiField];
                // Format date if it's a date field and value is a full timestamp
                if (formFieldId === 'referralDate' && value.includes(' ')) {
                    value = value.split(' ')[0]; // Get just the date part (YYYY-MM-DD)
                }
                element.value = value;
            }
        }
    });

    populateReferralReasonChecklist(referral.referral_reason);

    const firstCard = allPersonCards()[0];
    if (!firstCard) return;

    const personFieldMap = {
        student_name: '.person-name',
        student_id: '.person-student-id',
        grade: '.person-grade',
        gender: '.person-gender',
        age: '.person-age',
        referral_role: '.person-role',
        parent_guardian: '.person-parent-name',
        parent_contact: '.person-parent-contact'
    };

    Object.entries(personFieldMap).forEach(([apiField, selector]) => {
        if (referral[apiField]) {
            const element = firstCard.querySelector(selector);
            if (element) element.value = referral[apiField];
        }
    });
}

// ========== PEOPLE LIST (multi-person referral: e.g. an offender and a
// victim from the same incident) ==========

function setupPeopleList() {
    const list = document.getElementById('peopleList');
    list.appendChild(createPersonCard());
    renumberPersonCards();

    document.getElementById('addPersonBtn').addEventListener('click', () => {
        // Collapse every card already filled in — each moves up into the
        // file-icon strip next to this button — so the form below doesn't
        // keep growing taller as more people are added. Only the new card
        // (which needs editing) stays expanded.
        allPersonCards().forEach(card => {
            setCardCollapsed(card, true);
        });
        list.appendChild(createPersonCard());
        renumberPersonCards();
    });
}

// Person cards live in one of two containers depending on their state:
// #peopleList (expanded, full form, inside <form id="referralForm">) or
// #peopleChips (collapsed file icon — lives in .page-content, *outside*
// the <form> entirely, next to "Add Another Person"). Deliberately NOT
// scoped to #referralForm — a collapsed card's fields would silently be
// excluded from every count/collection here (and from submission) the
// moment it's outside the form's subtree, since collectPeopleFromForm()
// reads each card's values through this same list.
function allPersonCards() {
    return Array.from(document.querySelectorAll('.referral-person-card'));
}

function createPersonCard() {
    personCardCounter += 1;

    const card = document.createElement('div');
    card.className = 'referral-person-card';
    card.dataset.personId = personCardCounter;

    card.innerHTML = `
        <button type="button" class="referral-person-chip" title="Click to edit">
            <i class="bi bi-file-earmark-person"></i>
            <span class="referral-person-chip-name">Person</span>
        </button>
        <button type="button" class="referral-person-remove" title="Remove this person"><i class="bi bi-x-lg"></i></button>
        <div class="referral-person-full">
            <div class="referral-person-header">
                <div class="referral-person-title-group">
                    <span class="referral-person-title">Person</span>
                </div>
                <button type="button" class="referral-person-fold" aria-expanded="true" title="Collapse into a file">
                    <i class="bi bi-chevron-down"></i>
                </button>
                <select class="person-role">
                    <option value="">Role (optional)</option>
                    <option value="offender">Offender</option>
                    <option value="victim">Victim</option>
                </select>
            </div>
            <div class="referral-person-body">
                <div class="form-row-three referral-person-row-with-age">
                    <div class="form-field">
                        <label>Name of Student:</label>
                        <input type="text" class="person-name" required>
                        <input type="hidden" class="person-student-id">
                        <div class="person-search-status"></div>
                        <div class="person-suggestion-box">
                            <div class="person-suggestion-list"></div>
                        </div>
                    </div>
                    <div class="form-field">
                        <label>Grade & Level:</label>
                        <!-- Options filled in by populateGradeOptions() once
                             loadGradeOptionsOnce() resolves — Grade 1-6 for
                             an elementary school (East/West/South), Grade
                             7-12 for Secondary, per api/school-config's
                             gradesForSchoolLevel(). -->
                        <select class="person-grade" required>
                            <option value="">Select Grade</option>
                        </select>
                    </div>
                    <div class="form-field">
                        <label>Gender:</label>
                        <select class="person-gender" required>
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="form-field">
                        <label>Age:</label>
                        <input type="text" class="person-age" readonly placeholder="Auto-filled from student record" title="Calculated automatically from the student's date of birth — not manually editable">
                    </div>
                </div>
                <div class="form-row-two">
                    <div class="form-field">
                        <label>Parent/Guardian's Name:</label>
                        <input type="text" class="person-parent-name">
                    </div>
                    <div class="form-field">
                        <label>Parent/Guardian's Contact Number:</label>
                        <input type="tel" class="person-parent-contact">
                    </div>
                </div>
            </div>
        </div>
    `;

    wirePersonNameSearch(card);
    card.querySelector('.referral-person-remove').addEventListener('click', () => {
        if (activeEditCard === card) closePersonEditModal(false);
        card.remove();
        renumberPersonCards();
    });
    card.querySelector('.referral-person-fold').addEventListener('click', () => {
        setCardCollapsed(card, true);
    });
    card.querySelector('.referral-person-chip').addEventListener('click', () => {
        setCardCollapsed(card, false);
    });

    loadGradeOptionsOnce().then(grades => populateGradeOptions(card, grades));

    return card;
}

// Collapses a person card down to a small file icon labeled with the
// person's name, and moves it up into the #peopleChips strip next to "Add
// Another Person" — outside the form area entirely, instead of taking a
// full-width row in the list below. Expanding a card (clicking its chip, or
// a validation failure jumping back to it) no longer re-inserts it into the
// form — see openPersonEditModal() — that used to push the rest of the page
// down every time someone reopened a person to fix a typo.
function setCardCollapsed(card, collapsed) {
    if (!collapsed) {
        openPersonEditModal(card);
        return;
    }

    if (activeEditCard === card) closePersonEditModal(false);

    card.classList.add('is-collapsed');
    card.querySelector('.referral-person-fold').setAttribute('aria-expanded', 'false');
    document.getElementById('peopleChips').appendChild(card);

    const name = card.querySelector('.person-name').value.trim();
    const role = card.querySelector('.person-role').value;
    const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : '';

    const chip = card.querySelector('.referral-person-chip');
    chip.classList.remove('role-offender', 'role-victim');
    if (role) chip.classList.add(`role-${role}`);
    // Chip text is truncated with an ellipsis at this width — the full
    // name (+ role) is still reachable on hover/long-press via the title.
    chip.title = name ? `${name}${roleLabel ? ' · ' + roleLabel : ''} — click to edit` : 'Click to edit';

    card.querySelector('.referral-person-chip-name').textContent = name || 'Not filled in yet';
}

// Opens a person's full info in a floating modal (rather than moving their
// card back into the in-page form, which used to shove the reason/actions
// fields further down every time). The card's real DOM node — with all its
// event listeners and autocomplete state already wired by
// wirePersonNameSearch() — is relocated into the modal body and back again
// on close, so nothing needs to be re-bound or synced.
function openPersonEditModal(card) {
    activeEditCard = card;
    card.classList.remove('is-collapsed');
    card.querySelector('.referral-person-fold').setAttribute('aria-expanded', 'true');
    document.getElementById('personEditModalBody').appendChild(card);

    const name = card.querySelector('.person-name').value.trim();
    document.getElementById('personEditModalTitle').textContent = name ? `Edit ${name}` : 'Person Details';
    // "Remove this person" lives in the modal footer now (a labeled button,
    // not the card's own corner ×, which is hidden while inside this modal
    // — see .person-edit-modal .referral-person-remove in the CSS) — always
    // available, even for the last remaining person; collectPeopleFromForm()
    // is what actually enforces "a referral needs at least one", at submit
    // time, with a clear message.
    document.getElementById('personEditModalRemove').style.display = '';
    document.getElementById('personEditModal').classList.add('show');
    card.querySelector('.person-name').focus();
}

// collapseCard=false is used by callers (remove button, the fold button via
// setCardCollapsed) that are already handling where the card goes next —
// they just need the modal chrome to disappear, not a second move.
function closePersonEditModal(collapseCard = true) {
    const card = activeEditCard;
    document.getElementById('personEditModal').classList.remove('show');
    activeEditCard = null;
    if (card && collapseCard) {
        setCardCollapsed(card, true);
    }
}

function setupPersonEditModal() {
    document.getElementById('personEditModalClose').addEventListener('click', () => closePersonEditModal(true));
    document.getElementById('personEditModalDone').addEventListener('click', () => closePersonEditModal(true));
    document.getElementById('personEditModalRemove').addEventListener('click', () => {
        const card = activeEditCard;
        if (!card) return;
        activeEditCard = null;
        document.getElementById('personEditModal').classList.remove('show');
        card.remove();
        renumberPersonCards();
    });
    document.getElementById('personEditModal').addEventListener('click', (e) => {
        if (e.target.id === 'personEditModal') closePersonEditModal(true);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('personEditModal').classList.contains('show')) {
            closePersonEditModal(true);
        }
    });
}

// Remove is always available, even down to the last person — clearing
// everyone is allowed here; collectPeopleFromForm() is what actually
// enforces "a referral needs at least one person", with a clear message,
// at submit time. Also keeps the live headcount next to "Add Another
// Person" in sync, so it's clear how many people are on this referral
// without having to look for the (possibly off-screen) chips.
function renumberPersonCards() {
    const cards = allPersonCards();
    cards.forEach((card) => {
        card.querySelector('.referral-person-remove').style.display = '';
    });

    const countEl = document.getElementById('peopleCount');
    if (countEl) {
        countEl.textContent = cards.length > 0 ? `${cards.length} ${cards.length === 1 ? 'person' : 'people'}` : '';
    }
}

// Validates and collects every person card into the shape the API expects.
// Returns null (after showing an error) if any required field is missing.
function collectPeopleFromForm() {
    const cards = allPersonCards();
    if (cards.length === 0) {
        showErrorMessage('Please add at least one person before submitting.');
        return null;
    }

    const people = [];
    for (const card of cards) {
        const nameInput = card.querySelector('.person-name');
        const gradeInput = card.querySelector('.person-grade');
        const name = nameInput.value.trim();
        const grade = gradeInput.value;

        if (!name) {
            setCardCollapsed(card, false);
            showErrorMessage('Please enter a name for every person listed.');
            nameInput.focus();
            return null;
        }
        if (!grade) {
            setCardCollapsed(card, false);
            showErrorMessage('Please select a grade for every person listed.');
            gradeInput.focus();
            return null;
        }

        people.push({
            student_name: name,
            student_id: card.querySelector('.person-student-id').value || null,
            grade: grade,
            gender: card.querySelector('.person-gender').value,
            age: card.querySelector('.person-age').value || '',
            referral_role: card.querySelector('.person-role').value || null,
            parent_guardian: card.querySelector('.person-parent-name').value.trim(),
            parent_contact: card.querySelector('.person-parent-contact').value.trim()
        });
    }
    return people;
}

// Setup student name search with dropdown auto-suggestions (same UX as the
// counselor's Case Scenario student search) — restricted to the teacher's
// own school. Wired directly to this specific card's own input/status/list
// elements (rather than global ids), so any number of person cards can each
// have independent, working autocomplete.
function wirePersonNameSearch(card) {
    const input = card.querySelector('.person-name');
    const status = card.querySelector('.person-search-status');
    const listEl = card.querySelector('.person-suggestion-list');
    let searchTimeout;
    let highlightedIndex = -1;

    function hideSuggestions() {
        listEl.innerHTML = '';
    }

    // Applies a specific suggestion (by row + its stored student data) —
    // the one place both mouse selection and keyboard selection go through,
    // so a keyboard accept can never resolve to a different student than
    // the one actually highlighted.
    function applySuggestion(row) {
        if (!row || !row._studentData) return;
        const student = row._studentData;
        input.value = student.fullName;
        populateStudentFromSearch(card, student);
        status.textContent = `Selected: ${student.fullName}`;
        status.style.color = 'green';
        hideSuggestions();
    }

    input.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const searchTerm = this.value.trim();
        highlightedIndex = -1;
        status.textContent = '';

        // Manual edits invalidate a previously selected student record
        card.querySelector('.person-student-id').value = '';

        if (searchTerm.length < 2) {
            hideSuggestions();
            return;
        }

        searchTimeout = setTimeout(() => {
            searchStudentsForCard(card, searchTerm, input, status, listEl);
        }, 300);
    });

    input.addEventListener('keydown', function(e) {
        const items = Array.from(listEl.querySelectorAll('.suggestion-item'));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
            updateSuggestionHighlight(items, highlightedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            updateSuggestionHighlight(items, highlightedIndex);
        } else if (e.key === 'Enter') {
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                e.preventDefault();
                applySuggestion(items[highlightedIndex]);
            }
        } else if (e.key === 'Tab' || e.key === 'ArrowRight') {
            // Only auto-fill when the user explicitly highlighted a match
            // with the arrow keys — never silently on a bare Tab, which is
            // what previously let a plain "move to the next field" keypress
            // overwrite a typed name with an unrelated first search result.
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                e.preventDefault();
                applySuggestion(items[highlightedIndex]);
            }
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(hideSuggestions, 200);
    });
}

function updateSuggestionHighlight(items, idx) {
    items.forEach((item, i) => {
        item.classList.toggle('is-highlighted', i === idx);
    });
}

// Search for students, restricted to the teacher's own school
function searchStudentsForCard(card, searchTerm, inputField, statusEl, listEl) {
    const user = getCurrentUser();

    let teacherSchool = user?.school_attended;
    if (!teacherSchool) {
        teacherSchool = localStorage.getItem('teacherSchool');
    }

    if (!teacherSchool || teacherSchool === 'Default School') {
        statusEl.textContent = 'No school on file — cannot look up students.';
        statusEl.style.color = '#d9534f';
        listEl.innerHTML = '';
        return;
    }

    statusEl.textContent = 'Searching school records...';
    statusEl.style.color = '#666';

    const apiUrl = `../../api/get-students?school=${encodeURIComponent(teacherSchool)}&search=${encodeURIComponent(searchTerm)}&limit=8`;

    fetch(apiUrl)
        .then(r => r.json())
        .then(result => {
            if (!result.success) {
                statusEl.textContent = 'Unable to check student records.';
                statusEl.style.color = '#d66';
                listEl.innerHTML = '';
                return;
            }

            listEl.innerHTML = '';

            if (result.data && result.data.length > 0) {
                result.data.forEach(student => {
                    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
                    const gradeLabel = student.grade_name || '';
                    const row = document.createElement('div');
                    row.className = 'suggestion-item';
                    row.innerHTML = `<div class="suggestion-item-name">${escapeHtml(fullName)}</div><div class="suggestion-item-grade">${escapeHtml(gradeLabel)}</div>`;
                    // Each row carries its own exact match data so keyboard
                    // selection (Enter/Tab on the highlighted row) and mouse
                    // selection always resolve to the same student — never
                    // silently substituting a different match.
                    row._studentData = Object.assign({}, student, { fullName });
                    row.addEventListener('mousedown', (ev) => {
                        ev.preventDefault();
                        inputField.value = fullName;
                        populateStudentFromSearch(card, row._studentData);
                        statusEl.textContent = `Selected: ${fullName}`;
                        statusEl.style.color = 'green';
                        listEl.innerHTML = '';
                    });
                    listEl.appendChild(row);
                });

                statusEl.textContent = `Found ${result.data.length} match${result.data.length > 1 ? 'es' : ''}`;
                statusEl.style.color = 'green';
            } else {
                statusEl.textContent = 'No matching student found in school records.';
                statusEl.style.color = '#d9534f';
                listEl.innerHTML = '';
            }
        })
        .catch(error => {
            console.error('Error searching students:', error);
            statusEl.textContent = 'Error checking student records.';
            statusEl.style.color = '#d66';
        });
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

// Populate one person card with the selected student's data
function populateStudentFromSearch(card, student) {
    const fullName = student.fullName || `${student.first_name || ''} ${student.last_name || ''}`.trim();

    // Set name and ACCOUNT ID (not LRN)
    card.querySelector('.person-name').value = fullName;

    const studentIdField = card.querySelector('.person-student-id');
    if (studentIdField) {
        studentIdField.value = student.id; // This is accounts.id
    }

    // Grade — student.grade_name (from api/get-students) is always the
    // real, elementary-aware label already, so this local map is only a
    // last-resort fallback if that field is ever missing. It intentionally
    // stops at 4->10: that's the old secondary-only shorthand this app used
    // before grades were stored as literal numbers, and it never had a 5/6
    // code — an elementary student's raw "5"/"6" is already the literal
    // grade, not a legacy code, so mapping it to Grade 11/12 here would
    // reintroduce the exact bug api/get-students's formatGradeLabel()
    // was just fixed for.
    const gradeMap = {
        '1': 'Grade 7',
        '2': 'Grade 8',
        '3': 'Grade 9',
        '4': 'Grade 10'
    };

    const gradeEl = card.querySelector('.person-grade');
    if (gradeEl) {
        const gradeLabel = student.grade_name || gradeMap[String(student.grade_id)] || '';
        if (gradeLabel && Array.from(gradeEl.options).some(o => o.value === gradeLabel)) {
            gradeEl.value = gradeLabel;
        }
    }

    // Gender
    const genderEl = card.querySelector('.person-gender');
    const sexValue = student.sex || student.Sex;
    if (genderEl && sexValue) {
        const genderMap = { 'M': 'Male', 'F': 'Female', 'Male': 'Male', 'Female': 'Female' };
        genderEl.value = genderMap[sexValue] || sexValue;
    }

    // Age — always computed from the student's date of birth as of today,
    // never typed in (the field is readonly). Falls back to whatever Age
    // value is already on file for the student if no usable birth date
    // came back with the search result.
    const ageEl = card.querySelector('.person-age');
    if (ageEl) {
        const dob = student.date_of_birth || student.DateOfBirth;
        const computedAge = calculateAge(dob);
        ageEl.value = computedAge !== '' ? computedAge : (student.age || student.Age || '');
    }
}

// The Grade & Level dropdown on each person card must offer Grade 1-6 for
// an elementary school (East/West/South) and Grade 7-12 for Secondary — a
// hardcoded Grade 7-12 list (the old markup) left no valid option to select
// for an elementary student's real grade, and even silently failed to
// pre-fill it from a search result since the value wouldn't match any
// <option>. Fetched once and cached/shared across every person card
// (api/school-config's getGrades, the same endpoint
// student/student-information.js's loadGrades() already uses).
let gradeOptionsPromise = null;

function loadGradeOptionsOnce() {
    if (gradeOptionsPromise) {
        return gradeOptionsPromise;
    }

    const user = getCurrentUser();
    const school = (user && user.school_attended) || localStorage.getItem('teacherSchool') || '';

    gradeOptionsPromise = fetch(`../../api/school-config?action=getGrades&school=${encodeURIComponent(school)}`)
        .then(r => r.json())
        .then(result => {
            if (result.success && Array.isArray(result.grades) && result.grades.length) {
                return result.grades.map(g => g.grade_name);
            }
            throw new Error('No grades returned');
        })
        .catch(error => {
            // Falls back to the old fixed secondary range so the form still
            // works rather than being left with an empty dropdown.
            console.error('Error loading grade options, falling back to Grade 7-12:', error);
            return ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
        });

    return gradeOptionsPromise;
}

function populateGradeOptions(card, grades) {
    const select = card.querySelector('.person-grade');
    if (!select) return;

    // Preserves whatever's already selected (e.g. populateStudentFromSearch
    // ran first and this resolved late) instead of always resetting to blank.
    const currentValue = select.value;
    select.innerHTML = '<option value="">Select Grade</option>' +
        grades.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    if (currentValue && grades.includes(currentValue)) {
        select.value = currentValue;
    }
}

// Populate teacher's school information
function populateTeacherSchool() {
    const user = getCurrentUser();

    // Get teacher's school from user object (from login)
    const teacherSchool = user?.school_attended;

    if (!teacherSchool) {
        console.warn('⚠️ WARNING: user.school_attended is not set in user object');
    }

    // Store in localStorage for later use
    if (teacherSchool) {
        localStorage.setItem('teacherSchool', teacherSchool);
    }

    // Populate the school field in the form
    const schoolField = document.getElementById('studentSchool');
    if (schoolField) {
        schoolField.value = teacherSchool || 'Default School';
    }

    const teacherNameField = document.getElementById('teacherName');
    if (teacherNameField) {
        teacherNameField.value = user?.name || user?.first_name || user?.email || 'Teacher';
    }

    const teacherDesignationField = document.getElementById('teacherDesignation');
    if (teacherDesignationField) {
        teacherDesignationField.value = user?.type || user?.role || 'Teacher';
    }

    // Editable (not readonly) — pre-fill from the account if a number is on
    // file, but the teacher can type/correct their own number either way.
    const teacherContactField = document.getElementById('teacherContact');
    if (teacherContactField) {
        teacherContactField.value = user?.contact || user?.phone || user?.contact_number || '';
    }
}

function submitReferralForm(e) {
    e.preventDefault();

    const referralReason = collectReferralReason();
    if (!referralReason) {
        showErrorMessage('Please select at least one reason for referral.');
        return;
    }

    const descriptionInput = document.getElementById('referralDescription');
    const description = descriptionInput.value.trim();
    if (!description) {
        showErrorMessage('Please describe the incident or concern before submitting.');
        descriptionInput.focus();
        return;
    }

    const interventionAttemptsInput = document.getElementById('interventionAttempts');
    const interventionAttempts = interventionAttemptsInput.value.trim();
    if (!interventionAttempts) {
        showErrorMessage('Please enter the initial actions taken before submitting.');
        interventionAttemptsInput.focus();
        return;
    }

    const teacherContactInput = document.getElementById('teacherContact');
    const teacherContact = teacherContactInput.value.trim();
    if (!teacherContact) {
        showErrorMessage('Please enter a contact number before submitting.');
        teacherContactInput.focus();
        return;
    }

    const people = collectPeopleFromForm();
    if (!people) return;

    const user = getCurrentUser();
    const teacherSchool = user.school_attended || localStorage.getItem('teacherSchool') || 'Default School';
    const studentSchool = document.getElementById('studentSchool').value || teacherSchool;

    // Fields shared by the whole incident, merged onto every person's own
    // record below — each person still becomes its own full referral row.
    const shared = {
        referral_reason: referralReason,
        description: description,
        intervention_attempts: interventionAttempts,
        teacher_id: user.id || null,
        teacher_name: user.name || user.email,
        teacher_contact: teacherContact,
        school_attended: teacherSchool,
        student_school: studentSchool,
        stage: 1, // Stage 1: Interview/Background
        status: 'pending'
    };

    const payload = people.map(person => Object.assign({}, shared, person));
    // A single person still posts as a plain object — same shape the API
    // (and the counselor's separate walk-in referral form) has always sent;
    // only 2+ people switches to the array/batch form.
    const body = payload.length === 1 ? payload[0] : payload;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    fetch('../../api/referral', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        if (result.success) {
            const count = payload.length;
            showSuccessMessage(count > 1
                ? `${count} referrals submitted successfully! Students have been notified.`
                : 'Referral submitted successfully! Student has been notified.');
            setTimeout(() => {
                // Redirect to the teacher referral status page to see the submitted referral
                window.location.href = 'referral-status';
            }, 1500);
        } else {
            showErrorMessage(result.message || 'Failed to submit referral');
        }
    })
    .catch(error => {
        console.error('Error submitting referral:', error);
        showErrorMessage('Error submitting referral. Please try again.');
    })
    .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
    });
}

function createReferralNotification(referral) {

}

function showSuccessMessage(message) {
    // Create a temporary success message
    const success = document.createElement('div');
    success.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        font-weight: 500;
    `;
    success.textContent = message;
    document.body.appendChild(success);

    setTimeout(() => success.remove(), 3000);
}

function showErrorMessage(message) {
    // Create a temporary error message
    const error = document.createElement('div');
    error.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        font-weight: 500;
    `;
    error.textContent = message;
    document.body.appendChild(error);

    setTimeout(() => error.remove(), 3000);
}


// Initialize on page load
document.addEventListener('DOMContentLoaded', initReferralForm);
