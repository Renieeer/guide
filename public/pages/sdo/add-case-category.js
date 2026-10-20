// SDO Case Management — Add Case Category
// Categories hang off a section (case_category.SectionID -> section.SectionID).
// The same api/get-case-section?action=sections payload used by the
// counselor case workflow is flattened here into one row per category for
// the section dropdown and the table below.
const CASE_SECTION_ENDPOINT = '../../api/get-case-section';

let caseSections = [];
let allCategories = [];
let categorySearchTerm = '';
let categoryCurrentPage = 1;
let categoriesPageSize = 10;

function initAddCaseCategoryPage() {
    initPage();
    loadCaseSections();

    document.getElementById('addCaseCategoryForm').addEventListener('submit', handleAddCaseCategorySubmit);
    document.getElementById('confirmAddCategoryYesBtn').addEventListener('click', confirmAddCaseCategory);

    document.getElementById('categorySearchInput').addEventListener('input', (e) => {
        categorySearchTerm = e.target.value.trim().toLowerCase();
        categoryCurrentPage = 1;
        renderCategories();
    });

    document.getElementById('categoriesPageSizeSelect').addEventListener('change', (e) => {
        categoriesPageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
        categoryCurrentPage = 1;
        renderCategories();
    });

    document.getElementById('categoriesPagination').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        categoryCurrentPage += btn.dataset.page === 'next' ? 1 : -1;
        renderCategories();
    });

    document.getElementById('categoriesTableBody').addEventListener('click', (e) => {
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
            if (!result.success) throw new Error(result.message || 'Failed to load sections');

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
            document.getElementById('categoriesTableBody').innerHTML =
                `<tr><td colspan="4" class="no-accounts"><i class="bi bi-exclamation-triangle"></i> <p>Unable to load case categories</p></td></tr>`;
        });
}

function renderSectionOptions() {
    ['categorySectionSelect', 'editCategorySectionSelect'].forEach(id => {
        const select = document.getElementById(id);
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select a section</option>' +
            caseSections.map(s => `<option value="${s.SectionID}">${escapeHtml(s.SectionName)}</option>`).join('');
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
            if (!result.success) throw new Error(result.message || 'Failed to add case category');
            showAlert('Case category added successfully!', 'success');
            nameInput.value = '';
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
            if (!result.success) throw new Error(result.message || 'Failed to update case category');
            showAlert('Case category updated successfully!', 'success');
            loadCaseSections();
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'));
}

// confirmAction() (js/utils.js) is the shared CSS-styled Yes/No modal used
// across the app instead of the browser's plain native confirm().
function handleDeleteCaseCategory(caseId, categoryName) {
    confirmAction(`Are you sure you want to delete this case category${categoryName ? ` ("${categoryName}")` : ''}?`, () => {
        fetch(CASE_SECTION_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_case_category', caseId })
        })
            .then(response => response.json().then(result => ({ ok: response.ok, result })))
            .then(({ result }) => {
                if (!result.success) throw new Error(result.message || 'Failed to delete case category');
                showAlert('Case category deleted successfully!', 'success');
                loadCaseSections();
            })
            // The API returns the same "existing case data" message whether
            // it's blocked (409) or failed outright — either way this is
            // the CSS-styled .alert panel the rest of the page already uses
            // for feedback, so it needs no special-casing here.
            .catch(error => showAlert(error.message, 'error'));
    }, { title: 'Delete Case Category', confirmLabel: 'Yes, Delete' });
}

function renderCategories() {
    const filtered = categorySearchTerm
        ? allCategories.filter(c =>
            String(c.CategoryName || '').toLowerCase().includes(categorySearchTerm) ||
            String(c.SectionName || '').toLowerCase().includes(categorySearchTerm))
        : allCategories;

    const totalPages = Math.max(1, Math.ceil(filtered.length / categoriesPageSize));
    if (categoryCurrentPage > totalPages) categoryCurrentPage = totalPages;
    if (categoryCurrentPage < 1) categoryCurrentPage = 1;

    const startIdx = categoriesPageSize === Infinity ? 0 : (categoryCurrentPage - 1) * categoriesPageSize;
    const endIdx = categoriesPageSize === Infinity ? filtered.length : Math.min(startIdx + categoriesPageSize, filtered.length);
    const pageRows = filtered.slice(startIdx, endIdx);

    const tbody = document.getElementById('categoriesTableBody');
    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="no-accounts"><i class="bi bi-inbox"></i> <p>No case categories found</p></td></tr>`;
    } else {
        tbody.innerHTML = pageRows.map((cat, i) => `
            <tr>
                <td>${startIdx + i + 1}</td>
                <td>${escapeHtml(cat.SectionName)}</td>
                <td><strong>${escapeHtml(cat.CategoryName)}</strong></td>
                <td class="text-center">
                    <div class="action-buttons" style="justify-content: center;">
                        <button type="button" class="btn-edit" data-edit-id="${cat.CaseId}">
                            <i class="bi bi-pencil-square"></i> Edit
                        </button>
                        <button type="button" class="btn btn-danger btn-sm" data-delete-id="${cat.CaseId}" data-delete-name="${escapeHtml(cat.CategoryName)}">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderCategoriesPagination(filtered.length, startIdx, endIdx, totalPages);
}

function renderCategoriesPagination(totalFiltered, startIdx, endIdx, totalPages) {
    const el = document.getElementById('categoriesPagination');

    if (totalFiltered === 0 || categoriesPageSize === Infinity || totalPages <= 1) {
        el.innerHTML = '';
        return;
    }

    el.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${categoryCurrentPage <= 1 ? 'disabled' : ''}>
            <i class="bi bi-chevron-left"></i> Prev
        </button>
        <span class="accounts-page-info">Showing ${startIdx + 1}&ndash;${endIdx} of ${totalFiltered} &middot; Page ${categoryCurrentPage} of ${totalPages}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${categoryCurrentPage >= totalPages ? 'disabled' : ''}>
            Next <i class="bi bi-chevron-right"></i>
        </button>`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', initAddCaseCategoryPage);
