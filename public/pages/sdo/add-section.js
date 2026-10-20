// SDO Case Management — Add Section
// Sections are the top-level grouping used across the whole case-report
// workflow (api/get-case-section.php, api/case-report). SectionID/
// SectionCode have no DB auto-increment, so new rows are assigned the next
// free id/letter server-side (see get-case-section.php's add_section action).
const CASE_SECTION_ENDPOINT = '../../api/get-case-section';

let allSections = [];
let sectionSearchTerm = '';
let sectionCurrentPage = 1;
let sectionsPageSize = 10;

function initAddSectionPage() {
    initPage();
    loadSections();

    document.getElementById('addSectionForm').addEventListener('submit', handleAddSectionSubmit);
    document.getElementById('confirmAddSectionYesBtn').addEventListener('click', confirmAddSection);

    document.getElementById('sectionSearchInput').addEventListener('input', (e) => {
        sectionSearchTerm = e.target.value.trim().toLowerCase();
        sectionCurrentPage = 1;
        renderSections();
    });

    document.getElementById('sectionsPageSizeSelect').addEventListener('change', (e) => {
        sectionsPageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
        sectionCurrentPage = 1;
        renderSections();
    });

    document.getElementById('sectionsPagination').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        sectionCurrentPage += btn.dataset.page === 'next' ? 1 : -1;
        renderSections();
    });

    document.getElementById('sectionsTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-edit-id]');
        if (!btn) return;
        openEditSectionModal(btn.dataset.editId);
    });

    document.getElementById('editSectionForm').addEventListener('submit', handleEditSectionSubmit);
    document.getElementById('confirmEditSectionYesBtn').addEventListener('click', confirmEditSection);
}

function loadSections() {
    fetch(`${CASE_SECTION_ENDPOINT}?action=sections`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to load sections');
            allSections = (result.sections || []).slice().sort((a, b) => a.SectionID - b.SectionID);
            renderSections();
        })
        .catch(error => {
            console.error('Error loading sections:', error);
            document.getElementById('sectionsTableBody').innerHTML =
                `<tr><td colspan="3" class="no-accounts"><i class="bi bi-exclamation-triangle"></i> <p>Unable to load sections</p></td></tr>`;
        });
}

// Just validates and shows the confirmation panel — the actual add happens
// in confirmAddSection() once the user picks "Yes" there.
function handleAddSectionSubmit(e) {
    e.preventDefault();

    const sectionName = document.getElementById('sectionNameInput').value.trim();
    if (!sectionName) return;

    openModal('confirmAddSectionModal');
}

function closeConfirmAddSectionModal() {
    closeModal('confirmAddSectionModal');
}

function confirmAddSection() {
    closeConfirmAddSectionModal();

    const input = document.getElementById('sectionNameInput');
    const sectionName = input.value.trim();
    if (!sectionName) return;

    const submitBtn = document.getElementById('addSectionSubmitBtn');
    submitBtn.disabled = true;

    fetch(CASE_SECTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_section', sectionName })
    })
        .then(response => response.json())
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to add section');
            showAlert('Section added successfully!', 'success');
            input.value = '';
            loadSections();
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'))
        .finally(() => { submitBtn.disabled = false; });
}

function openEditSectionModal(sectionId) {
    const section = allSections.find(s => String(s.SectionID) === String(sectionId));
    if (!section) return;

    document.getElementById('editSectionId').value = section.SectionID;
    document.getElementById('editSectionNameInput').value = section.SectionName;
    openModal('editSectionModal');
}

function closeEditSectionModal() {
    closeModal('editSectionModal');
}

// Just validates and shows the confirmation panel — the actual save
// happens in confirmEditSection() once the user picks "Yes" there.
function handleEditSectionSubmit(e) {
    e.preventDefault();

    const sectionId = document.getElementById('editSectionId').value;
    const sectionName = document.getElementById('editSectionNameInput').value.trim();
    if (!sectionId || !sectionName) return;

    closeEditSectionModal();
    openModal('confirmEditSectionModal');
}

function closeConfirmEditSectionModal() {
    closeModal('confirmEditSectionModal');
}

// "No" backs out to the edit form (values still filled in) rather than
// dropping the whole thing.
function cancelConfirmEditSection() {
    closeConfirmEditSectionModal();
    openModal('editSectionModal');
}

function confirmEditSection() {
    closeConfirmEditSectionModal();

    const sectionId = document.getElementById('editSectionId').value;
    const sectionName = document.getElementById('editSectionNameInput').value.trim();
    if (!sectionId || !sectionName) return;

    fetch(CASE_SECTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit_section', sectionId, sectionName })
    })
        .then(response => response.json())
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to update section');
            showAlert('Section updated successfully!', 'success');
            loadSections();
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'));
}

function renderSections() {
    const filtered = sectionSearchTerm
        ? allSections.filter(s => String(s.SectionName || '').toLowerCase().includes(sectionSearchTerm))
        : allSections;

    const totalPages = Math.max(1, Math.ceil(filtered.length / sectionsPageSize));
    if (sectionCurrentPage > totalPages) sectionCurrentPage = totalPages;
    if (sectionCurrentPage < 1) sectionCurrentPage = 1;

    const startIdx = sectionsPageSize === Infinity ? 0 : (sectionCurrentPage - 1) * sectionsPageSize;
    const endIdx = sectionsPageSize === Infinity ? filtered.length : Math.min(startIdx + sectionsPageSize, filtered.length);
    const pageRows = filtered.slice(startIdx, endIdx);

    const tbody = document.getElementById('sectionsTableBody');
    if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="no-accounts"><i class="bi bi-inbox"></i> <p>No sections found</p></td></tr>`;
    } else {
        tbody.innerHTML = pageRows.map((section, i) => `
            <tr>
                <td>${startIdx + i + 1}</td>
                <td><strong>${escapeHtml(section.SectionName)}</strong></td>
                <td class="text-center">
                    <div class="action-buttons" style="justify-content: center;">
                        <button type="button" class="btn-edit" data-edit-id="${section.SectionID}">
                            <i class="bi bi-pencil-square"></i> Edit
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderSectionsPagination(filtered.length, startIdx, endIdx, totalPages);
}

function renderSectionsPagination(totalFiltered, startIdx, endIdx, totalPages) {
    const el = document.getElementById('sectionsPagination');

    if (totalFiltered === 0 || sectionsPageSize === Infinity || totalPages <= 1) {
        el.innerHTML = '';
        return;
    }

    el.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${sectionCurrentPage <= 1 ? 'disabled' : ''}>
            <i class="bi bi-chevron-left"></i> Prev
        </button>
        <span class="accounts-page-info">Showing ${startIdx + 1}&ndash;${endIdx} of ${totalFiltered} &middot; Page ${sectionCurrentPage} of ${totalPages}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${sectionCurrentPage >= totalPages ? 'disabled' : ''}>
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

document.addEventListener('DOMContentLoaded', initAddSectionPage);
