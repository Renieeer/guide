// SDO Case Management — Add Case Category
// Categories hang off a section (case_category.SectionID -> section.SectionID).
// The same api/get-case-section?action=sections payload used by the
// counselor case workflow is flattened here into one row per category for
// the section dropdown and the table below.
const CASE_SECTION_ENDPOINT = '../../api/get-case-section';

let caseSections = [];
let allCategories = [];
let categorySearchTerm = '';
// Sections the user has opened in the accordion (SectionID strings). Kept
// across reloads after an add/edit/delete so the list doesn't snap shut.
const openSectionIds = new Set();

function initAddCaseCategoryPage() {
    initPage();
    loadCaseSections();

    document.getElementById('addCaseCategoryForm').addEventListener('submit', handleAddCaseCategorySubmit);
    document.getElementById('confirmAddCategoryYesBtn').addEventListener('click', confirmAddCaseCategory);

    document.getElementById('categorySearchInput').addEventListener('input', (e) => {
        categorySearchTerm = e.target.value.trim().toLowerCase();
        renderCategories({ openMatches: true });
    });

    document.getElementById('expandAllSectionsBtn').addEventListener('click', () => {
        caseSections.forEach(s => openSectionIds.add(String(s.SectionID)));
        renderCategories();
    });
    document.getElementById('collapseAllSectionsBtn').addEventListener('click', () => {
        openSectionIds.clear();
        renderCategories();
    });

    document.getElementById('categoryAccordion').addEventListener('click', (e) => {
        const header = e.target.closest('button[data-section-toggle]');
        if (header) { toggleSection(header.dataset.sectionToggle); return; }

        const editBtn = e.target.closest('button[data-edit-id]');
        if (editBtn) { openEditCaseCategoryModal(editBtn.dataset.editId); return; }

        const deleteBtn = e.target.closest('button[data-delete-id]');
        if (deleteBtn) { handleDeleteCaseCategory(deleteBtn.dataset.deleteId, deleteBtn.dataset.deleteName); return; }
    });

    document.getElementById('editCaseCategoryForm').addEventListener('submit', handleEditCaseCategorySubmit);
    document.getElementById('confirmEditCaseCategoryYesBtn').addEventListener('click', confirmEditCaseCategory);
}

function loadCaseSections() {
    fetch(`${CASE_SECTION_ENDPOINT}?action=sections`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to load categories');

            caseSections = (result.sections || []).slice().sort((a, b) => a.SectionID - b.SectionID);
            renderSectionOptions();

            allCategories = [];
            caseSections.forEach(section => {
                (section.categories || []).forEach(cat => {
                    allCategories.push({
                        CaseId: cat.CaseId,
                        SectionID: section.SectionID,
                        SectionName: section.SectionName,
                        CategoryName: cat.CategoryName
                    });
                });
            });
            allCategories.sort((a, b) => (parseInt(a.CaseId, 10) || 0) - (parseInt(b.CaseId, 10) || 0));
            renderCategories();
        })
        .catch(error => {
            console.error('Error loading case categories:', error);
            document.getElementById('categoryAccordion').innerHTML =
                `<div class="no-accounts"><i class="bi bi-exclamation-triangle"></i> <p>Unable to load violations</p></div>`;
        });
}

function renderSectionOptions() {
    ['categorySectionSelect', 'editCategorySectionSelect'].forEach(id => {
        const select = document.getElementById(id);
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select a category</option>' +
            caseSections.map(s => `<option value="${escapeHtml(s.SectionID)}">${escapeHtml(s.SectionName)}</option>`).join('');
        if (currentValue) select.value = currentValue;
    });
}

// Just validates and shows the confirmation panel — the actual add happens
// in confirmAddCaseCategory() once the user picks "Yes" there.
function handleAddCaseCategorySubmit(e) {
    e.preventDefault();

    const sectionId = document.getElementById('categorySectionSelect').value;
    const categoryName = document.getElementById('categoryNameInput').value.trim();
    if (!sectionId || !categoryName) return;

    openModal('confirmAddCategoryModal');
}

function closeConfirmAddCategoryModal() {
    closeModal('confirmAddCategoryModal');
}

function confirmAddCaseCategory() {
    closeConfirmAddCategoryModal();

    const sectionSelect = document.getElementById('categorySectionSelect');
    const nameInput = document.getElementById('categoryNameInput');
    const sectionId = sectionSelect.value;
    const categoryName = nameInput.value.trim();

    if (!sectionId || !categoryName) return;

    const submitBtn = document.getElementById('addCaseCategorySubmitBtn');
    submitBtn.disabled = true;

    fetch(CASE_SECTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_case_category', sectionId, categoryName })
    })
        .then(response => response.json())
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to add violation');
            showAlert('Violation added successfully!', 'success');
            nameInput.value = '';
            // Open the section it went into, so the new category is visible.
            openSectionIds.add(String(sectionId));
            loadCaseSections();
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'))
        .finally(() => { submitBtn.disabled = false; });
}

function openEditCaseCategoryModal(caseId) {
    const category = allCategories.find(c => String(c.CaseId) === String(caseId));
    if (!category) return;

    document.getElementById('editCaseId').value = category.CaseId;
    document.getElementById('editCategorySectionSelect').value = category.SectionID;
    document.getElementById('editCategoryNameInput').value = category.CategoryName;
    openModal('editCaseCategoryModal');
}

function closeEditCaseCategoryModal() {
    closeModal('editCaseCategoryModal');
}

// Just validates and shows the confirmation panel — the actual save
// happens in confirmEditCaseCategory() once the user picks "Yes" there.
function handleEditCaseCategorySubmit(e) {
    e.preventDefault();

    const caseId = document.getElementById('editCaseId').value;
    const sectionId = document.getElementById('editCategorySectionSelect').value;
    const categoryName = document.getElementById('editCategoryNameInput').value.trim();
    if (!caseId || !sectionId || !categoryName) return;

    closeEditCaseCategoryModal();
    openModal('confirmEditCaseCategoryModal');
}

function closeConfirmEditCaseCategoryModal() {
    closeModal('confirmEditCaseCategoryModal');
}

// "No" backs out to the edit form (values still filled in) rather than
// dropping the whole thing.
function cancelConfirmEditCaseCategory() {
    closeConfirmEditCaseCategoryModal();
    openModal('editCaseCategoryModal');
}

function confirmEditCaseCategory() {
    closeConfirmEditCaseCategoryModal();

    const caseId = document.getElementById('editCaseId').value;
    const sectionId = document.getElementById('editCategorySectionSelect').value;
    const categoryName = document.getElementById('editCategoryNameInput').value.trim();
    if (!caseId || !sectionId || !categoryName) return;

    fetch(CASE_SECTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit_case_category', caseId, sectionId, categoryName })
    })
        .then(response => response.json())
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to update violation');
            showAlert('Violation updated successfully!', 'success');
            // It may have moved to another section — open that one.
            openSectionIds.add(String(sectionId));
            loadCaseSections();
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'));
}

// confirmAction() (js/utils.js) is the shared CSS-styled Yes/No modal used
// across the app instead of the browser's plain native confirm().
function handleDeleteCaseCategory(caseId, categoryName) {
    confirmAction(`Are you sure you want to delete this violation${categoryName ? ` ("${categoryName}")` : ''}?`, () => {
        // Returned so the confirm dialog shows it's processing until done.
        return fetch(CASE_SECTION_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_case_category', caseId })
        })
            .then(response => response.json().then(result => ({ ok: response.ok, result })))
            .then(({ result }) => {
                if (!result.success) throw new Error(result.message || 'Failed to delete violation');
                showAlert('Violation deleted successfully!', 'success');
                loadCaseSections();
            })
            // The API returns the same "existing case data" message whether
            // it's blocked (409) or failed outright — either way this is
            // the CSS-styled .alert panel the rest of the page already uses
            // for feedback, so it needs no special-casing here.
            .catch(error => showAlert(error.message, 'error'));
    }, { title: 'Delete Violation', confirmLabel: 'Yes, Delete' });
}

function toggleSection(sectionId) {
    const key = String(sectionId);
    if (openSectionIds.has(key)) {
        openSectionIds.delete(key);
    } else {
        openSectionIds.add(key);
    }
    renderCategories();
    // Re-rendering replaces the header; keep keyboard focus on it.
    const header = document.querySelector(`button[data-section-toggle="${CSS.escape(key)}"]`);
    if (header) header.focus();
}

// One accordion panel per section, in section order, each listing that
// section's categories. A search keeps only matching categories (or every
// category of a section whose name matches); openMatches (set when the
// search text changes) opens those panels, which can still be closed.
function renderCategories({ openMatches = false } = {}) {
    const container = document.getElementById('categoryAccordion');
    const searching = categorySearchTerm !== '';

    const groups = caseSections.map(section => {
        const sectionMatches = searching && String(section.SectionName || '').toLowerCase().includes(categorySearchTerm);
        const categories = allCategories.filter(c => String(c.SectionID) === String(section.SectionID));
        const shown = !searching || sectionMatches
            ? categories
            : categories.filter(c => String(c.CategoryName || '').toLowerCase().includes(categorySearchTerm));
        return { section, total: categories.length, shown };
    }).filter(g => !searching || g.shown.length > 0);

    if (groups.length === 0) {
        container.innerHTML = `<div class="no-accounts"><i class="bi bi-inbox"></i> <p>${searching ? 'No violations match your search' : 'No categories yet. Add one under All Categories first.'}</p></div>`;
        return;
    }

    if (openMatches && searching) {
        groups.forEach(g => openSectionIds.add(String(g.section.SectionID)));
    }

    container.innerHTML = groups.map(({ section, total, shown }) => {
        const key = String(section.SectionID);
        const isOpen = openSectionIds.has(key);
        const panelId = `category-section-panel-${key.replace(/[^\w-]/g, '')}`;
        const countLabel = searching && shown.length !== total
            ? `${shown.length} of ${total}`
            : `${total} ${total === 1 ? 'violation' : 'violations'}`;

        const rows = shown.length === 0
            ? `<div class="category-accordion-empty">No violations in this category yet.</div>`
            : `<table class="accounts-table category-accordion-table">
                    <thead>
                        <tr>
                            <th style="width: 60px;">#</th>
                            <th>Violation Name</th>
                            <th style="width: 190px;" class="text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shown.map((cat, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td><strong>${escapeHtml(cat.CategoryName)}</strong></td>
                            <td class="text-center">
                                <div class="action-buttons" style="justify-content: center;">
                                    <button type="button" class="btn-edit" data-edit-id="${escapeHtml(cat.CaseId)}">
                                        <i class="bi bi-pencil-square"></i> Edit
                                    </button>
                                    <button type="button" class="btn btn-danger btn-sm" data-delete-id="${escapeHtml(cat.CaseId)}" data-delete-name="${escapeHtml(cat.CategoryName)}">
                                        <i class="bi bi-trash"></i> Delete
                                    </button>
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;

        return `
            <div class="category-accordion-item${isOpen ? ' is-open' : ''}">
                <h3 class="category-accordion-heading">
                    <button type="button" class="category-accordion-header" data-section-toggle="${escapeHtml(key)}"
                            aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="${panelId}">
                        <i class="bi bi-chevron-right category-accordion-chevron" aria-hidden="true"></i>
                        <span class="category-accordion-title">${escapeHtml(section.SectionName)}</span>
                        <span class="category-accordion-count">${escapeHtml(countLabel)}</span>
                    </button>
                </h3>
                <div class="category-accordion-panel" id="${panelId}" ${isOpen ? '' : 'hidden'}>
                    ${rows}
                </div>
            </div>`;
    }).join('');
}

// escapeHtml() is the shared copy in js/utils.js.

document.addEventListener('DOMContentLoaded', initAddCaseCategoryPage);
