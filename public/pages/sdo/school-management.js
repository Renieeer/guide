// School Management — overview of every school and its assigned staff.
// Defaults to a read-only view; clicking "Edit" (top-right) switches on
// per-card controls (assign/save/revoke, Add School) without leaving the page.
// Clicking a folder card opens its details in a floating modal (rather than
// expanding in place) so editing one school doesn't disturb the grid.
const SCHOOL_STAFF_ENDPOINT = '../../api/sdo-school-staff';

// Module state for the folder grid — kept outside render functions so
// search/filter changes and data reloads don't reset the view.
let allAssignments = [];
let currentFilter = 'all';
let currentSearch = '';
let editMode = false;
let openSchoolCode = null;

// Set while the "Add School" modal is open for a "Replace Account" click
// (as opposed to a fresh add, or "+ Assign an account" on an empty slot) —
// read by handleSchoolAssignmentSubmit() so the old account gets
// deactivated (not deleted) once the replacement is created.
let pendingReplaceAccountId = null;

// "Existing account" picker in each role card of the assignment form
// (resources/views/sdo/partials/account-source.blade.php): lets the SDO add
// a person who already has an account to one more school instead of making
// a second login. Every coordinator/counselor/combined account and its
// schools, loaded the first time a picker is used.
const ACCOUNT_SOURCE_PREFIXES = ['coordinator', 'counselor', 'combined'];
let staffAccounts = null;
let staffAccountsLoading = null;

// Paginates the folder grid once the filtered result grows past one page —
// short lists (the common case) never show pagination controls at all.
const SCHOOL_FOLDER_PAGE_SIZE = 16;
let schoolFolderPage = 1;

const EDIT_MODE_DESC = 'Add schools, assign coordinator/counselor accounts, and manage staff access.';
const VIEW_MODE_DESC = "A read-only overview of every school in the division and who's assigned to it. Click Edit to add a school or change staff assignments.";

function initSidebarActive() {
    const url = window.location.href;
    const menuLinks = document.querySelectorAll('.sidebar-menu a');

    menuLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');

        if (href && url.includes(href)) {
            link.classList.add('active');
        }
    });
}

function initSchoolManagementPage() {
    initPage();
    initSidebarActive();

    const form = document.getElementById('schoolAssignmentForm');
    const assignType = document.getElementById('assignType');

    if (form && assignType) {
        assignType.addEventListener('change', toggleAssignmentFields);
        form.addEventListener('submit', handleSchoolAssignmentSubmit);
        toggleAssignmentFields();
    }

    initSchoolAssignmentModal();
    initSchoolDetailModal();
    initSchoolFoldersToolbar();
    initEditModeToggle();
    initGradeCheckboxGroups();
    initAccountSourcePickers();

    loadSchoolAssignments();
}

/* ---------- New vs. existing account (assignment form) ---------- */

function accountMode(prefix) {
    const checked = document.querySelector(`input[name="${prefix}AccountMode"]:checked`);
    return checked && checked.value === 'existing' ? 'existing' : 'new';
}

function roleCardShown(prefix) {
    const card = document.getElementById(`${prefix}Fields`);
    return Boolean(card) && card.style.display !== 'none';
}

function initAccountSourcePickers() {
    ACCOUNT_SOURCE_PREFIXES.forEach(prefix => {
        document.querySelectorAll(`input[name="${prefix}AccountMode"]`).forEach(radio => {
            radio.addEventListener('change', () => applyAccountMode(prefix, true));
        });

        const search = document.getElementById(`${prefix}ExistingSearch`);
        const results = document.getElementById(`${prefix}ExistingResults`);
        const picker = document.querySelector(`[data-existing-picker="${prefix}"]`);
        if (!search || !results || !picker) return;

        search.addEventListener('input', () => renderExistingAccountResults(prefix));
        search.addEventListener('focus', () => renderExistingAccountResults(prefix));
        search.addEventListener('blur', () => setTimeout(() => hideExistingResults(prefix), 150));
        search.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideExistingResults(prefix);
            if (e.key === 'Enter') {
                // Enter picks the first selectable match instead of submitting the form.
                e.preventDefault();
                const first = results.querySelector('[data-account-id][aria-disabled="false"]');
                if (first) selectExistingAccount(prefix, Number(first.dataset.accountId));
            }
        });
        // mousedown (not click) so the search box's blur doesn't close the list first.
        results.addEventListener('mousedown', (e) => {
            const option = e.target.closest('[data-account-id]');
            if (!option) return;
            e.preventDefault();
            if (option.getAttribute('aria-disabled') === 'true') return;
            selectExistingAccount(prefix, Number(option.dataset.accountId));
        });
        picker.addEventListener('click', (e) => {
            if (e.target.closest('[data-change-existing]')) clearExistingAccount(prefix, true);
        });
    });
}

function loadStaffAccounts() {
    if (staffAccounts) return Promise.resolve(staffAccounts);
    if (!staffAccountsLoading) {
        staffAccountsLoading = fetch(`${SCHOOL_STAFF_ENDPOINT}?action=accounts`)
            .then(r => r.json())
            .then(data => {
                if (!data.success) throw new Error(data.message || 'Failed to load staff accounts.');
                staffAccounts = data.accounts || [];
                return staffAccounts;
            })
            .finally(() => { staffAccountsLoading = null; });
    }
    return staffAccountsLoading;
}

// Shows the picker or the new-account fields. Name/email/password are only
// required for a brand-new account.
function applyAccountMode(prefix, focusSearch = false) {
    const existing = accountMode(prefix) === 'existing';
    const picker = document.querySelector(`[data-existing-picker="${prefix}"]`);
    const newFields = document.querySelector(`[data-new-account="${prefix}"]`);
    if (picker) picker.hidden = !existing;
    if (newFields) newFields.hidden = existing;

    const shown = roleCardShown(prefix);
    ['FirstName', 'LastName', 'Email', 'Password'].forEach(suffix => {
        const field = document.getElementById(`${prefix}${suffix}`);
        if (field) field.required = shown && !existing;
    });

    if (existing) {
        loadStaffAccounts().catch(err => showSchoolAssignmentAlert(err.message, 'error'));
        if (focusSearch) document.getElementById(`${prefix}ExistingSearch`)?.focus();
    }
}

function selectedExistingIds(exceptPrefix) {
    return ACCOUNT_SOURCE_PREFIXES
        .filter(p => p !== exceptPrefix && roleCardShown(p) && accountMode(p) === 'existing')
        .map(p => Number(document.getElementById(`${p}ExistingId`)?.value || 0))
        .filter(Boolean);
}

function accountSchoolsText(account) {
    return account.schools.length
        ? account.schools.map(s => `${s.schoolName} (${s.roleLabel})`).join(', ')
        : 'No school yet';
}

function renderExistingAccountResults(prefix) {
    const search = document.getElementById(`${prefix}ExistingSearch`);
    const results = document.getElementById(`${prefix}ExistingResults`);
    if (!search || !results) return;

    const open = () => { results.classList.add('is-open'); search.setAttribute('aria-expanded', 'true'); };

    if (!staffAccounts) {
        results.innerHTML = '<div class="existing-account-empty">Loading accounts…</div>';
        open();
        loadStaffAccounts()
            .then(() => { if (document.activeElement === search) renderExistingAccountResults(prefix); })
            .catch(err => { results.innerHTML = `<div class="existing-account-empty">${escapeHtml(err.message)}</div>`; });
        return;
    }

    const term = search.value.trim().toLowerCase();
    const schoolName = (document.getElementById('schoolName')?.value || '').trim().toLowerCase();
    const takenElsewhere = selectedExistingIds(prefix);
    const matches = staffAccounts
        .filter(a => !term || a.name.toLowerCase().includes(term) || String(a.email || '').toLowerCase().includes(term))
        .slice(0, 8);

    if (!matches.length) {
        results.innerHTML = `<div class="existing-account-empty">${term ? 'No coordinator or counselor account matches that name or email.' : 'No coordinator or counselor accounts yet.'}</div>`;
        open();
        return;
    }

    results.innerHTML = matches.map(a => {
        const atThisSchool = schoolName && a.schools.some(s => s.schoolName.toLowerCase() === schoolName);
        const reason = !a.active ? 'Deactivated'
            : atThisSchool ? 'Already at this school'
            : takenElsewhere.includes(a.accountId) ? 'Chosen for the other role'
            : '';
        return `
            <div class="existing-account-option${reason ? ' is-disabled' : ''}" role="option" data-account-id="${escapeHtml(a.accountId)}" aria-disabled="${reason ? 'true' : 'false'}">
                <div class="existing-account-name">${escapeHtml(a.name)}${reason ? ` <span class="existing-account-flag">${escapeHtml(reason)}</span>` : ''}</div>
                <div class="existing-account-meta">${escapeHtml(a.email || '')}</div>
                <div class="existing-account-meta"><i class="bi bi-building"></i> ${escapeHtml(accountSchoolsText(a))}</div>
            </div>`;
    }).join('');
    open();
}

function hideExistingResults(prefix) {
    document.getElementById(`${prefix}ExistingResults`)?.classList.remove('is-open');
    document.getElementById(`${prefix}ExistingSearch`)?.setAttribute('aria-expanded', 'false');
}

function selectExistingAccount(prefix, accountId) {
    const account = (staffAccounts || []).find(a => a.accountId === accountId);
    const picker = document.querySelector(`[data-existing-picker="${prefix}"]`);
    if (!account || !picker) return;

    document.getElementById(`${prefix}ExistingId`).value = String(accountId);
    const initials = account.name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
    const selected = picker.querySelector('[data-existing-selected]');
    selected.innerHTML = `
        <span class="existing-account-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
        <div class="existing-account-selected-text">
            <div class="existing-account-name">${escapeHtml(account.name)}</div>
            <div class="existing-account-meta">${escapeHtml(account.email || '')}</div>
            <div class="existing-account-meta"><i class="bi bi-building"></i> Works at: ${escapeHtml(accountSchoolsText(account))}</div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-change-existing>Change</button>`;
    selected.hidden = false;
    picker.classList.add('has-selection');
    hideExistingResults(prefix);
}

function clearExistingAccount(prefix, focusSearch = false) {
    const picker = document.querySelector(`[data-existing-picker="${prefix}"]`);
    const idField = document.getElementById(`${prefix}ExistingId`);
    const search = document.getElementById(`${prefix}ExistingSearch`);
    if (idField) idField.value = '';
    if (picker) {
        picker.classList.remove('has-selection');
        const selected = picker.querySelector('[data-existing-selected]');
        if (selected) { selected.hidden = true; selected.innerHTML = ''; }
    }
    if (search) {
        search.value = '';
        if (focusSearch) search.focus();
    }
}

function resetAccountSource(prefix) {
    const newRadio = document.querySelector(`input[name="${prefix}AccountMode"][value="new"]`);
    if (newRadio) newRadio.checked = true;
    clearExistingAccount(prefix);
    hideExistingResults(prefix);
    applyAccountMode(prefix);
}

function initSchoolDetailModal() {
    const modal = document.getElementById('schoolDetailModal');
    const closeBtn = document.getElementById('closeSchoolDetailModal');
    if (!modal || !closeBtn) return;

    closeBtn.addEventListener('click', () => {
        closeModal('schoolDetailModal');
        openSchoolCode = null;
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal('schoolDetailModal');
            openSchoolCode = null;
        }
    });
}

function openSchoolDetailModal(schoolCode) {
    const item = allAssignments.find(a => a.schoolCode === schoolCode);
    if (!item) return;

    openSchoolCode = schoolCode;
    renderSchoolDetailModal(item);
    openModal('schoolDetailModal');
}

function renderSchoolDetailModal(item) {
    const titleEl = document.getElementById('schoolDetailTitle');
    const bodyEl = document.getElementById('schoolDetailBody');
    if (!titleEl || !bodyEl) return;

    titleEl.textContent = item.schoolName;
    bodyEl.innerHTML = buildSchoolDetailContent(item);
    wireSchoolDetailEvents(bodyEl);
}

// After a mutation (save grade, toggle active, save district, revoke) the
// data is reloaded from the server — if the detail modal is still open for
// that school, refresh its content in place instead of closing it.
function refreshOpenSchoolDetail() {
    if (!openSchoolCode) return;

    const item = allAssignments.find(a => a.schoolCode === openSchoolCode);
    if (!item) {
        closeModal('schoolDetailModal');
        openSchoolCode = null;
        return;
    }

    renderSchoolDetailModal(item);
}

// Single Edit / Done toggle: swaps the description text, shows/hides the
// Add School button, and re-renders the folder grid with (or without)
// per-card mutation controls.
function initEditModeToggle() {
    const toggleBtn = document.getElementById('editModeToggleBtn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => setEditMode(!editMode));
}

function setEditMode(next) {
    editMode = next;

    const addBtn = document.getElementById('openSchoolAssignmentModalBtn');
    const toggleBtn = document.getElementById('editModeToggleBtn');
    const desc = document.getElementById('schoolManagementDesc');

    if (addBtn) {
        addBtn.hidden = !editMode;
    }

    if (toggleBtn) {
        toggleBtn.innerHTML = editMode
            ? '<i class="bi bi-check2"></i> Done Editing'
            : '<i class="bi bi-pencil-square"></i> Edit';
    }

    if (desc) {
        desc.textContent = editMode ? EDIT_MODE_DESC : VIEW_MODE_DESC;
    }

    renderFolderGrid();
    refreshOpenSchoolDetail();
}

function initSchoolAssignmentModal() {
    const modal = document.getElementById('schoolAssignmentModal');
    const openBtn = document.getElementById('openSchoolAssignmentModalBtn');
    const closeBtn = document.getElementById('closeSchoolAssignmentModal');

    if (!modal || !openBtn || !closeBtn) {
        return;
    }

    openBtn.addEventListener('click', () => {
        resetAssignmentModal();
        openModal('schoolAssignmentModal');
    });
    closeBtn.addEventListener('click', () => closeModal('schoolAssignmentModal'));

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal('schoolAssignmentModal');
        }
    });

    const schoolLevelSelect = document.getElementById('schoolLevel');
    if (schoolLevelSelect) {
        schoolLevelSelect.addEventListener('change', refreshAssignmentGradeOptions);
    }
}

function initSchoolFoldersToolbar() {
    const searchInput = document.getElementById('schoolSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentSearch = searchInput.value.trim().toLowerCase();
            schoolFolderPage = 1;
            renderFolderGrid();
        });
    }

    const filterGroup = document.getElementById('schoolFilterGroup');
    if (filterGroup) {
        filterGroup.addEventListener('click', (event) => {
            const btn = event.target.closest('.school-filter-btn');
            if (!btn) return;

            filterGroup.querySelectorAll('.school-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter') || 'all';
            schoolFolderPage = 1;
            renderFolderGrid();
        });
    }
}

function toggleAssignmentFields() {
    const assignType = document.getElementById('assignType')?.value || '';

    const showCoordinator = assignType === 'coordinator' || assignType === 'both';
    const showCounselor = assignType === 'counselor' || assignType === 'both';
    const showCombined = assignType === 'combined';

    const coordinatorFields = document.getElementById('coordinatorFields');
    const counselorFields = document.getElementById('counselorFields');
    const combinedFields = document.getElementById('combinedFields');
    const roleHint = document.getElementById('assignmentRoleHint');

    if (coordinatorFields) {
        coordinatorFields.style.display = showCoordinator ? 'block' : 'none';
    }

    if (counselorFields) {
        counselorFields.style.display = showCounselor ? 'block' : 'none';
    }

    if (combinedFields) {
        combinedFields.style.display = showCombined ? 'block' : 'none';
    }

    if (roleHint) {
        roleHint.style.display = (showCoordinator || showCounselor || showCombined) ? 'none' : 'flex';
    }

    setRoleFieldsRequired('coordinator', showCoordinator);
    setRoleFieldsRequired('counselor', showCounselor);
    setRoleFieldsRequired('combined', showCombined);
}

function setRoleFieldsRequired(rolePrefix, isRequired) {
    const ids = ['FirstName', 'LastName', 'Email', 'Password'];

    // A hidden role card goes back to "New account" with nothing picked.
    if (!isRequired) {
        resetAccountSource(rolePrefix);
    }

    ids.forEach(suffix => {
        const element = document.getElementById(`${rolePrefix}${suffix}`);
        if (element) {
            // Only a brand-new account needs these filled in.
            element.required = isRequired && accountMode(rolePrefix) === 'new';
            if (!isRequired) {
                element.value = '';
            }
        }
    });

    // Grade checkboxes aren't required (none checked = no restriction), but
    // reset them back to default when the role block is hidden.
    const gradeGroup = document.getElementById(`${rolePrefix}Grade`);
    if (gradeGroup && !isRequired) {
        gradeGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
    }
}

function getRolePayload(rolePrefix) {
    const checkedGrades = Array.from(
        document.querySelectorAll(`#${rolePrefix}Grade input[type="checkbox"]:checked:not([data-select-all])`)
    ).map(cb => cb.value);

    return {
        mode: accountMode(rolePrefix),
        accountId: Number(document.getElementById(`${rolePrefix}ExistingId`)?.value || 0),
        firstName: document.getElementById(`${rolePrefix}FirstName`)?.value.trim() || '',
        lastName: document.getElementById(`${rolePrefix}LastName`)?.value.trim() || '',
        email: document.getElementById(`${rolePrefix}Email`)?.value.trim() || '',
        password: document.getElementById(`${rolePrefix}Password`)?.value || '',
        grade: checkedGrades.join(',')
    };
}

// Puts the "Add School" modal back into its default create-a-new-school
// state. Used both when opening it fresh and after "+ Assign an account"
// on a folder left it scoped to one school/role.
function resetAssignmentModal() {
    pendingReplaceAccountId = null;

    const form = document.getElementById('schoolAssignmentForm');
    if (form) {
        form.reset();
    }

    const schoolNameInput = document.getElementById('schoolName');
    if (schoolNameInput) {
        schoolNameInput.readOnly = false;
    }

    const assignType = document.getElementById('assignType');
    if (assignType) {
        assignType.disabled = false;
    }

    const schoolLevelSelect = document.getElementById('schoolLevel');
    if (schoolLevelSelect) {
        schoolLevelSelect.disabled = false;
    }
    refreshAssignmentGradeOptions();

    const intro = document.getElementById('schoolAssignmentIntro');
    if (intro) {
        intro.textContent = 'Add a school and assign a coordinator, counselor, or both. A person who already has an account can be added here too; choose "Existing account".';
    }

    ACCOUNT_SOURCE_PREFIXES.forEach(resetAccountSource);
    toggleAssignmentFields();
}

// Opens the "Add School" modal pre-scoped to one existing school/role, so
// "+ Assign an account" on an empty folder role doesn't require re-typing
// the school name or picking the assignment type.
function openAssignRoleModal(btn) {
    const role = btn.getAttribute('data-assign-role');
    const schoolName = btn.getAttribute('data-school-name') || '';
    const schoolLevel = btn.getAttribute('data-school-level') || '';
    const replaceAccountId = btn.getAttribute('data-replace-account-id') || '';

    // This button can live inside the school detail modal — close it first
    // so the two floating panels don't stack.
    closeModal('schoolDetailModal');

    resetAssignmentModal();
    pendingReplaceAccountId = replaceAccountId || null;

    const schoolNameInput = document.getElementById('schoolName');
    if (schoolNameInput) {
        schoolNameInput.value = schoolName;
        schoolNameInput.readOnly = true;
    }

    const assignType = document.getElementById('assignType');
    if (assignType && role) {
        assignType.value = role;
        assignType.disabled = true;
    }

    // The school already has a level set — lock it here so assigning an
    // additional account to it can't accidentally reset it back to the
    // default (Secondary) on submit.
    const schoolLevelSelect = document.getElementById('schoolLevel');
    if (schoolLevelSelect && schoolLevel) {
        schoolLevelSelect.value = schoolLevel;
        schoolLevelSelect.disabled = true;
        refreshAssignmentGradeOptions();
    }

    const intro = document.getElementById('schoolAssignmentIntro');
    if (intro) {
        const roleLabel = role === 'combined' ? 'a combined coordinator/focalperson & counselor'
            : role === 'coordinator' ? 'a coordinator/focalperson'
            : `a ${role}`;
        intro.textContent = pendingReplaceAccountId
            ? `Replace the ${roleLabel} account for ${schoolName}. The previous account is taken off this school; if this was its only school, it's deactivated and kept on record, not deleted.`
            : `Assign ${roleLabel} account to ${schoolName}. Create a new account, or choose "Existing account" to give someone who already has one this school too.`;
    }

    toggleAssignmentFields();
    openModal('schoolAssignmentModal');
}

async function handleSchoolAssignmentSubmit(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('schoolAssignmentSubmit');
    const originalBtnText = submitBtn ? submitBtn.textContent : 'Save School Assignment';

    const schoolName = document.getElementById('schoolName')?.value.trim() || '';
    const assignType = document.getElementById('assignType')?.value || '';
    const schoolLevel = document.getElementById('schoolLevel')?.value || 'Secondary';

    // An "Existing account" card needs someone picked before saving.
    const missingPick = ACCOUNT_SOURCE_PREFIXES.find(prefix =>
        roleCardShown(prefix) && accountMode(prefix) === 'existing' && !Number(document.getElementById(`${prefix}ExistingId`)?.value || 0));
    if (missingPick) {
        const label = missingPick === 'combined' ? 'combined coordinator & counselor' : missingPick;
        showSchoolAssignmentAlert(`Choose the existing ${label} account, or switch that card back to "New account".`, 'error');
        document.getElementById(`${missingPick}ExistingSearch`)?.focus();
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    try {
        const payload = {
            schoolName,
            assignType,
            schoolLevel,
            replaceAccountId: pendingReplaceAccountId || null,
            coordinator: getRolePayload('coordinator'),
            counselor: getRolePayload('counselor'),
            combined: getRolePayload('combined')
        };

        const response = await fetch(SCHOOL_STAFF_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to save school assignment.');
        }

        showSchoolAssignmentAlert(data.message || 'School assignment saved.', 'success');
        staffAccounts = null; // schools changed; reload the picker list next time
        resetAssignmentModal();
        await loadSchoolAssignments();
        closeModal('schoolAssignmentModal');
    } catch (error) {
        showSchoolAssignmentAlert(error.message || 'Failed to save school assignment.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }
}

async function loadSchoolAssignments() {
    const grid = document.getElementById('schoolFolderGrid');
    if (!grid) {
        return;
    }

    grid.classList.add('is-empty');
    grid.innerHTML = '<p class="text-center p-5 text-muted">Loading schools...</p>';

    try {
        const response = await fetch(SCHOOL_STAFF_ENDPOINT);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to load school assignments.');
        }

        allAssignments = data.assignments || [];
        renderFolderGrid();
    } catch (error) {
        grid.innerHTML = `<p class="text-center p-5 text-danger">${escapeHtml(error.message || 'Unable to load school assignments.')}</p>`;
    }
}

function schoolMatchesSearch(item, search) {
    if (!search) return true;

    const counselorTerms = (item.counselors || []).flatMap(c => [c.name, c.email]);
    const haystack = [
        item.schoolName,
        item.coordinator?.name, item.coordinator?.email,
        ...counselorTerms,
        item.combined?.name, item.combined?.email
    ].filter(Boolean).join(' ').toLowerCase();

    return haystack.includes(search);
}

function renderFolderGrid() {
    const grid = document.getElementById('schoolFolderGrid');
    if (!grid) {
        return;
    }

    const filtered = allAssignments.filter(item => {
        if (currentFilter === 'with-staff' && item.totalAssigned === 0) return false;
        if (currentFilter === 'no-staff' && item.totalAssigned > 0) return false;
        return schoolMatchesSearch(item, currentSearch);
    });

    if (!filtered.length) {
        grid.classList.add('is-empty');
        grid.innerHTML = `<p class="text-center p-5 text-muted">${allAssignments.length ? 'No schools match your search.' : 'No schools yet.'}</p>`;
        renderSchoolFolderPagination(1);
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / SCHOOL_FOLDER_PAGE_SIZE));
    if (schoolFolderPage > totalPages) schoolFolderPage = totalPages;
    if (schoolFolderPage < 1) schoolFolderPage = 1;

    const startIndex = (schoolFolderPage - 1) * SCHOOL_FOLDER_PAGE_SIZE;
    const pageItems = filtered.slice(startIndex, startIndex + SCHOOL_FOLDER_PAGE_SIZE);

    grid.classList.remove('is-empty');
    grid.innerHTML = pageItems.map(buildFolderCard).join('');

    grid.querySelectorAll('[data-open-school]').forEach(card => {
        card.addEventListener('click', () => {
            openSchoolDetailModal(card.getAttribute('data-open-school'));
        });
    });

    renderSchoolFolderPagination(totalPages);
}

// Prev/Next controls, only shown once the filtered school list actually
// spans more than one page (16 schools) — a short list never shows this.
function renderSchoolFolderPagination(totalPages) {
    const paginationEl = document.getElementById('schoolFolderPagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
        paginationEl.hidden = true;
        paginationEl.innerHTML = '';
        return;
    }

    paginationEl.hidden = false;
    paginationEl.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" id="schoolFolderPrevPage" ${schoolFolderPage <= 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> Prev</button>
        <span class="district-pagination-label">Page ${schoolFolderPage} of ${totalPages}</span>
        <button type="button" class="btn btn-secondary btn-sm" id="schoolFolderNextPage" ${schoolFolderPage >= totalPages ? 'disabled' : ''}>Next <i class="bi bi-chevron-right"></i></button>
    `;

    document.getElementById('schoolFolderPrevPage')?.addEventListener('click', () => {
        if (schoolFolderPage > 1) {
            schoolFolderPage--;
            renderFolderGrid();
        }
    });
    document.getElementById('schoolFolderNextPage')?.addEventListener('click', () => {
        schoolFolderPage++;
        renderFolderGrid();
    });
}

// East/West/South schools are elementary (grades 1-6); every other level
// (Secondary) uses the usual junior/senior high grades 7-12.
function gradeRangeForLevel(level) {
    return (level === 'East' || level === 'West' || level === 'South')
        ? [1, 2, 3, 4, 5, 6]
        : [7, 8, 9, 10, 11, 12];
}

// A grade scope is a comma-separated list of grade numbers (mirrors
// api/grade-scope's grade_scope_to_list()); empty means no restriction.
// `level` picks which range (1-6 vs 7-12) counts as valid for this school.
function parseGradeScope(grade, level) {
    const range = gradeRangeForLevel(level);
    return String(grade || '')
        .split(',')
        .map(g => parseInt(g.trim(), 10))
        .filter(g => range.includes(g));
}

// Mirrors api/grade-scope's grade_scope_label() so the read-only view
// reads naturally for any combination the checkboxes can produce, not just
// the handful of presets the old dropdown offered.
function gradeDisplayLabel(grade, level) {
    const grades = [...new Set(parseGradeScope(grade, level))].sort((a, b) => a - b);
    if (grades.length === 0) return 'All grades';
    if (grades.length === 1) return `Grade ${grades[0]}`;

    const isConsecutive = grades.every((g, i) => i === 0 || g === grades[i - 1] + 1);
    return isConsecutive
        ? `Grades ${grades[0]}-${grades[grades.length - 1]}`
        : `Grades ${grades.join(', ')}`;
}

// Delegated once for the whole page so it covers both the static
// coordinator/counselor/combined groups in the Add School form and any
// buildGradeCheckboxes() group re-rendered into the school detail modal.
function initGradeCheckboxGroups() {
    document.addEventListener('change', (event) => {
        const target = event.target;
        if (!target.matches('.grade-checkbox-group input[type="checkbox"]')) {
            return;
        }

        const group = target.closest('.grade-checkbox-group');
        const allBox = group.querySelector('[data-select-all]');
        const gradeBoxes = Array.from(group.querySelectorAll('input[type="checkbox"]:not([data-select-all])'));

        if (target.hasAttribute('data-select-all')) {
            gradeBoxes.forEach(cb => { cb.checked = target.checked; });
        } else if (allBox) {
            allBox.checked = gradeBoxes.every(cb => cb.checked);
        }
    });
}

function buildGradeCheckboxOptionsHtml(range, selected) {
    return range.map(g => `
                    <label class="grade-checkbox">
                        <input type="checkbox" value="${g}" ${selected && selected.has(g) ? 'checked' : ''}>
                        <span>${g}</span>
                    </label>`).join('');
}

function buildGradeCheckboxes(accountId, grade, level) {
    const range = gradeRangeForLevel(level);
    const selected = new Set(parseGradeScope(grade, level));
    const allSelected = range.every(g => selected.has(g));

    return `
                <div class="grade-checkbox-group" data-account-id="${escapeHtml(accountId)}">
                    <label class="grade-checkbox grade-checkbox-all">
                        <input type="checkbox" data-select-all ${allSelected ? 'checked' : ''}>
                        <span>All</span>
                    </label>
                    ${buildGradeCheckboxOptionsHtml(range, selected)}
                    <span class="grade-checkbox-hint">Leave all unchecked to allow every grade.</span>
                </div>`;
}

// Rebuilds the three static "Add School" form grade-checkbox groups
// (coordinator/counselor/combined) to match the currently selected School
// Level — 1-6 for East/West/South (elementary), 7-12 for Secondary.
function refreshAssignmentGradeOptions() {
    const level = document.getElementById('schoolLevel')?.value || 'Secondary';
    const range = gradeRangeForLevel(level);

    ['coordinatorGrade', 'counselorGrade', 'combinedGrade'].forEach(id => {
        const group = document.getElementById(id);
        if (!group) return;

        group.innerHTML = `
                    <label class="grade-checkbox grade-checkbox-all"><input type="checkbox" data-select-all><span>All</span></label>
                    ${buildGradeCheckboxOptionsHtml(range)}
                    <span class="grade-checkbox-hint">Leave all unchecked to allow every grade.</span>`;
    });
}

// One folder card per school: a compact preview (name, fill dots, account
// count). Clicking it opens the full details in a floating modal instead of
// expanding in place, so reviewing/editing one school never disturbs the grid.
function buildFolderCard(item) {
    const roleCount = [Boolean(item.coordinator), Boolean(item.counselors && item.counselors.length), Boolean(item.combined)].filter(Boolean).length;
    const dots = [0, 1, 2].map(i =>
        `<span class="school-folder-dot ${i < roleCount ? 'is-filled' : ''}"></span>`
    ).join('');
    const accountLabel = item.totalAssigned === 1 ? 'account' : 'accounts';

    const cardClasses = ['school-folder'];
    if (item.totalAssigned > 0) cardClasses.push('has-staff');

    return `
        <div class="${cardClasses.join(' ')}" data-open-school="${escapeHtml(item.schoolCode)}">
            <div class="school-folder-header">
                <div>
                    <div class="school-folder-name">
                        <span class="school-folder-icon"><i class="bi bi-building"></i></span>
                        ${escapeHtml(item.schoolName)}
                    </div>
                    <div class="school-folder-meta">
                        <span class="school-folder-dots">${dots}</span>
                        <span class="school-folder-count">${escapeHtml(item.totalAssigned)} ${accountLabel}</span>
                    </div>
                </div>
                <i class="bi bi-chevron-right school-folder-chevron"></i>
            </div>
        </div>
    `;
}

// Editable School Name + School Level (edit mode only) — lets the SDO admin
// fix/rename a school or reclassify it (e.g. Secondary -> East) after
// creation, instead of that being locked in forever at Add School time.
function buildSchoolInfoEdit(item) {
    if (!editMode) return '';

    const levels = ['Secondary', 'East', 'West', 'South'];
    const options = levels.map(lvl =>
        `<option value="${escapeHtml(lvl)}" ${item.schoolLevel === lvl ? 'selected' : ''}>${escapeHtml(lvl)}</option>`
    ).join('');

    return `
        <div class="school-info-edit">
            <div class="school-info-edit-label">School Info</div>
            <div class="form-row">
                <div class="form-group">
                    <label>Name of School</label>
                    <input type="text" data-edit-school-name value="${escapeHtml(item.schoolName || '')}" placeholder="e.g. Oriental Mindoro National High School">
                </div>
                <div class="form-group">
                    <label>School Level</label>
                    <select data-edit-school-level>${options}</select>
                </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-save-school-info data-school-code="${escapeHtml(item.schoolCode)}">Save School Info</button>
        </div>
    `;
}

// The school detail modal's body: an editable School Info section (edit
// mode only), the three role slots, plus (edit mode only) a revoke-access
// footer.
function buildSchoolDetailContent(item) {
    const revokeBtn = editMode
        ? `<button type="button" class="school-folder-revoke" data-revoke-school="${escapeHtml(item.schoolCode)}">Revoke school access</button>`
        : '';

    return `
        ${buildSchoolInfoEdit(item)}
        ${buildRoleSlot('COORDINATOR/FOCALPERSON', item.coordinator, 'coordinator', item.schoolName, item.schoolLevel, item.schoolCode)}
        ${buildCounselorRoleSlot(item.counselors, item.schoolName, item.schoolLevel, item.schoolCode)}
        ${buildRoleSlot('COMBINED', item.combined, 'combined', item.schoolName, item.schoolLevel, item.schoolCode)}
        <div class="school-folder-footer">
            <span class="school-folder-id">ID ${escapeHtml(String(item.schoolCode || '').toUpperCase())} &middot; ${escapeHtml(item.schoolLevel || 'Secondary')}</span>
            ${revokeBtn}
        </div>
    `;
}

// Wires the mutation controls inside the (freshly re-rendered) detail modal
// body. View mode renders none of these elements, so this is a no-op then.
function wireSchoolDetailEvents(container) {
    if (!editMode) return;

    container.querySelectorAll('[data-save-grade]').forEach(btn => {
        btn.addEventListener('click', () => saveInlineGrade(btn));
    });

    container.querySelectorAll('[data-toggle-active]').forEach(btn => {
        btn.addEventListener('click', () => toggleAccountActive(btn));
    });

    container.querySelectorAll('[data-assign-role]').forEach(btn => {
        btn.addEventListener('click', () => openAssignRoleModal(btn));
    });

    container.querySelectorAll('[data-revoke-school]').forEach(btn => {
        btn.addEventListener('click', () => revokeSchoolAccess(btn));
    });

    container.querySelectorAll('[data-save-school-info]').forEach(btn => {
        btn.addEventListener('click', () => saveSchoolInfo(btn));
    });

    container.querySelectorAll('[data-unassign]').forEach(btn => {
        btn.addEventListener('click', () => unassignFromSchool(btn));
    });
}

// Where else a multi-school person works, and which school they're in right
// now (they switch from their own dashboard). Nothing for single-school staff.
function personSchoolsHtml(person, schoolName) {
    const others = person.otherSchools || [];
    if (!others.length) return '';

    const currentOther = others.find(s => s.workingHere);
    const status = person.workingHere
        ? `<span class="staff-school-status is-here"><i class="bi bi-geo-alt-fill"></i> Working at ${escapeHtml(schoolName)} right now</span>`
        : `<span class="staff-school-status"><i class="bi bi-geo-alt"></i> Working at ${escapeHtml(currentOther ? currentOther.schoolName : 'another school')} right now</span>`;
    const chips = others.map(s =>
        `<span class="staff-school-chip" title="${escapeHtml(s.roleLabel)}">${escapeHtml(s.schoolName)} <span class="staff-school-chip-role">${escapeHtml(s.roleLabel)}</span></span>`
    ).join('');

    return `
        <div class="staff-schools">
            ${status}
            <div class="staff-school-chips"><span class="staff-school-chips-label">Also assigned to</span>${chips}</div>
        </div>`;
}

// Edit-mode controls shared by every staff account block in a school.
function personControlsHtml(person, roleKey, schoolName, schoolLevel, schoolCode) {
    const isActive = person.active !== false;
    const schoolCount = 1 + (person.otherSchools || []).length;
    const toggleBtnClass = isActive ? 'btn-danger' : 'btn-success';
    const toggleLabel = isActive ? 'Deactivate' : 'Activate';
    const removeBtn = schoolCount > 1
        ? `<button type="button" class="btn btn-secondary btn-sm" data-unassign data-account-id="${escapeHtml(person.accountId)}" data-school-code="${escapeHtml(schoolCode)}" data-school-name="${escapeHtml(schoolName)}" data-person-name="${escapeHtml(person.name)}" data-other-count="${schoolCount - 1}"><i class="bi bi-box-arrow-right"></i> Remove from this school</button>`
        : '';
    return `
        <div class="school-role-controls">
            ${buildGradeCheckboxes(person.accountId, person.grade || '', schoolLevel)}
            <button type="button" class="btn btn-secondary btn-sm" data-save-grade data-account-id="${escapeHtml(person.accountId)}" data-school-code="${escapeHtml(schoolCode)}">Save</button>
            <button type="button" class="btn ${toggleBtnClass} btn-sm" data-toggle-active data-account-id="${escapeHtml(person.accountId)}" data-active="${isActive ? '1' : '0'}" data-school-count="${schoolCount}">${toggleLabel}</button>
            <button type="button" class="btn btn-secondary btn-sm" data-assign-role="${escapeHtml(roleKey)}" data-school-name="${escapeHtml(schoolName)}" data-school-level="${escapeHtml(schoolLevel || 'Secondary')}" data-replace-account-id="${escapeHtml(person.accountId)}">Replace Account</button>
            ${removeBtn}
        </div>`;
}

async function unassignFromSchool(btn) {
    const name = btn.getAttribute('data-person-name') || 'This person';
    const schoolName = btn.getAttribute('data-school-name') || 'this school';
    const others = Number(btn.getAttribute('data-other-count') || 0);
    if (!window.confirm(`Remove ${name} from ${schoolName}? They keep their other ${others} school${others === 1 ? '' : 's'} and their login.`)) {
        return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Removing...';
    try {
        const response = await fetch(SCHOOL_STAFF_ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unassign', accountId: btn.getAttribute('data-account-id'), schoolCode: btn.getAttribute('data-school-code') })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to remove the account from this school.');
        }
        showSchoolAssignmentAlert(data.message || 'Account removed from this school.', 'success');
        staffAccounts = null;
        await loadSchoolAssignments();
        refreshOpenSchoolDetail();
    } catch (error) {
        showSchoolAssignmentAlert(error.message || 'Failed to remove the account from this school.', 'error');
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

// Renders one role's block inside the detail modal. View mode: plain
// read-only text. Edit mode: a grade checkbox group + activate/deactivate,
// or an "assign an account" shortcut into the Add School modal when empty.
function buildRoleSlot(label, person, roleKey, schoolName, schoolLevel, schoolCode) {
    if (!person || !person.name) {
        const assignBtn = editMode
            ? `<button type="button" class="school-role-assign-btn" data-assign-role="${escapeHtml(roleKey)}" data-school-name="${escapeHtml(schoolName)}" data-school-level="${escapeHtml(schoolLevel || 'Secondary')}">+ Assign an account</button>`
            : '';
        return `
            <div class="school-role-slot">
                <div class="school-role-slot-header">
                    <span class="school-role-label">${escapeHtml(label)}</span>
                    <span class="badge badge-empty">Empty</span>
                </div>
                <p class="school-role-empty-text">No account assigned to this role yet.</p>
                ${assignBtn}
            </div>
        `;
    }

    const isActive = person.active !== false;
    const badgeClass = isActive ? 'badge-completed' : 'badge-rejected';
    const badgeLabel = isActive ? 'Active' : 'Inactive';
    const email = person.email ? `<div class="school-role-email">${escapeHtml(person.email)}</div>` : '';

    const details = editMode
        ? personControlsHtml(person, roleKey, schoolName, schoolLevel, schoolCode)
        : `<div class="text-sm text-muted">${escapeHtml(gradeDisplayLabel(person.grade, schoolLevel))}</div>`;

    return `
        <div class="school-role-slot">
            <div class="school-role-slot-header">
                <span class="school-role-label">${escapeHtml(label)}</span>
                <span class="badge ${badgeClass}">${badgeLabel}</span>
            </div>
            <div class="school-role-name">${escapeHtml(person.name)}</div>
            ${email}
            ${personSchoolsHtml(person, schoolName)}
            ${details}
        </div>
    `;
}

// Counselor is the one role a school can have more than one active account
// for at a time (e.g. one counselor per grade band) — unlike
// coordinator/combined (buildRoleSlot above), which stay single-account.
// Renders one slot header plus one buildCounselorAccountBlock() per account,
// and an "assign"/"add another" button (edit mode only) that's available
// even when accounts already exist.
function buildCounselorRoleSlot(counselors, schoolName, schoolLevel, schoolCode) {
    const list = counselors || [];

    const assignBtn = editMode
        ? `<button type="button" class="school-role-assign-btn" data-assign-role="counselor" data-school-name="${escapeHtml(schoolName)}" data-school-level="${escapeHtml(schoolLevel || 'Secondary')}">+ ${list.length ? 'Add another counselor' : 'Assign an account'}</button>`
        : '';

    if (!list.length) {
        return `
            <div class="school-role-slot">
                <div class="school-role-slot-header">
                    <span class="school-role-label">COUNSELOR</span>
                    <span class="badge badge-empty">Empty</span>
                </div>
                <p class="school-role-empty-text">No account assigned to this role yet.</p>
                ${assignBtn}
            </div>
        `;
    }

    const activeCount = list.filter(p => p.active !== false).length;
    const countLabel = `${list.length} account${list.length === 1 ? '' : 's'}${activeCount !== list.length ? `, ${activeCount} active` : ''}`;

    return `
        <div class="school-role-slot">
            <div class="school-role-slot-header">
                <span class="school-role-label">COUNSELOR</span>
                <span class="badge badge-completed">${countLabel}</span>
            </div>
            ${list.map(person => buildCounselorAccountBlock(person, schoolName, schoolLevel, schoolCode)).join('')}
            ${assignBtn}
        </div>
    `;
}

// One counselor account's own name/email/active badge + (edit mode) its own
// grade checkboxes, Save, Activate/Deactivate, and Replace Account — mirrors
// buildRoleSlot's non-empty branch, just without the outer slot header since
// buildCounselorRoleSlot already drew one shared header above the list.
function buildCounselorAccountBlock(person, schoolName, schoolLevel, schoolCode) {
    const isActive = person.active !== false;
    const badgeClass = isActive ? 'badge-completed' : 'badge-rejected';
    const badgeLabel = isActive ? 'Active' : 'Inactive';
    const email = person.email ? `<div class="school-role-email">${escapeHtml(person.email)}</div>` : '';

    const details = editMode
        ? personControlsHtml(person, 'counselor', schoolName, schoolLevel, schoolCode)
        : `<div class="text-sm text-muted">${escapeHtml(gradeDisplayLabel(person.grade, schoolLevel))}</div>`;

    return `
        <div class="school-role-account">
            <div class="school-role-account-header">
                <div class="school-role-name">${escapeHtml(person.name)}</div>
                <span class="badge ${badgeClass}">${badgeLabel}</span>
            </div>
            ${email}
            ${personSchoolsHtml(person, schoolName)}
            ${details}
        </div>
    `;
}

async function saveInlineGrade(btn) {
    const accountId = btn.getAttribute('data-account-id');
    // Grades are per school: this school's assignment only.
    const schoolCode = btn.getAttribute('data-school-code') || '';
    const group = document.querySelector(`.grade-checkbox-group[data-account-id="${accountId}"]`);
    if (!accountId || !group) return;

    const grade = Array.from(group.querySelectorAll('input[type="checkbox"]:checked:not([data-select-all])'))
        .map(cb => cb.value)
        .join(',');

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const response = await fetch(SCHOOL_STAFF_ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'updateGrade', accountId, grade, schoolCode })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to update grade assignment.');
        }
        showSchoolAssignmentAlert('Grade assignment updated.', 'success');
        await loadSchoolAssignments();
        refreshOpenSchoolDetail();
    } catch (error) {
        showSchoolAssignmentAlert(error.message || 'Failed to update grade assignment.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function toggleAccountActive(btn) {
    const accountId = btn.getAttribute('data-account-id');
    const currentlyActive = btn.getAttribute('data-active') === '1';
    const nextActive = !currentlyActive;
    if (!accountId) return;

    // Activation is for the whole login, so it covers every school they're at.
    const schoolCount = Number(btn.getAttribute('data-school-count') || 1);
    const confirmMessage = nextActive
        ? (schoolCount > 1
            ? `Reactivate this account? The user will be able to log in again, at all ${schoolCount} of their schools.`
            : 'Reactivate this account? The user will be able to log in again.')
        : (schoolCount > 1
            ? `Deactivate this account? The user will lose access to all ${schoolCount} of their schools until reactivated. To take them off only this school, use "Remove from this school".`
            : 'Deactivate this account? The user will not be able to log in until reactivated.');
    if (!window.confirm(confirmMessage)) {
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = nextActive ? 'Activating...' : 'Deactivating...';

    try {
        const response = await fetch(SCHOOL_STAFF_ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'setActive', accountId, active: nextActive })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to update account status.');
        }
        showSchoolAssignmentAlert(nextActive ? 'Account activated.' : 'Account deactivated.', 'success');
        await loadSchoolAssignments();
        refreshOpenSchoolDetail();
    } catch (error) {
        showSchoolAssignmentAlert(error.message || 'Failed to update account status.', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function saveSchoolInfo(btn) {
    const schoolCode = btn.getAttribute('data-school-code');
    const container = btn.closest('.school-info-edit');
    if (!schoolCode || !container) return;

    const schoolLevel = container.querySelector('[data-edit-school-level]')?.value || 'Secondary';
    const schoolName = container.querySelector('[data-edit-school-name]')?.value.trim() || '';

    if (!schoolName) {
        showSchoolAssignmentAlert('School name cannot be empty.', 'error');
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const response = await fetch(SCHOOL_STAFF_ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'updateSchoolInfo', schoolCode, schoolLevel, schoolName })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to update school info.');
        }
        showSchoolAssignmentAlert('School info updated.', 'success');
        await loadSchoolAssignments();
        refreshOpenSchoolDetail();
    } catch (error) {
        showSchoolAssignmentAlert(error.message || 'Failed to update school info.', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function revokeSchoolAccess(btn) {
    const schoolCode = btn.getAttribute('data-revoke-school');
    if (!schoolCode) return;

    if (!window.confirm('Revoke access for this school? It will be removed from this list along with its staff groupings.')) {
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Revoking...';

    try {
        const response = await fetch(SCHOOL_STAFF_ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'revokeSchool', schoolCode })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to revoke school access.');
        }
        showSchoolAssignmentAlert('School access revoked.', 'success');
        await loadSchoolAssignments();
        refreshOpenSchoolDetail();
    } catch (error) {
        showSchoolAssignmentAlert(error.message || 'Failed to revoke school access.', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function showSchoolAssignmentAlert(message, type) {
    const alertBox = document.getElementById('schoolAssignAlert');
    if (!alertBox) {
        return;
    }

    alertBox.className = 'alert show';
    alertBox.classList.add(type === 'success' ? 'alert-success' : 'alert-error');
    alertBox.textContent = message;

    setTimeout(() => {
        alertBox.classList.remove('show');
    }, 4500);
}

// escapeHtml() is the shared copy in js/utils.js.

document.addEventListener('DOMContentLoaded', initSchoolManagementPage);
