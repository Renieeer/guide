// Account Management Script for Coordinator

let currentEditingAccountId = null;
let allAccounts = [];
// Grade filter + pagination — applied client-side on top of whatever
// loadSchoolAccounts()/searchAccounts() last fetched. 'all' page size
// disables paging entirely.
let currentGradeFilter = '';
let pageSize = 20;
let currentPage = 1;
// Deactivated students are excluded server-side by default (see
// api/manage-accounts) — this only decides whether we ask for them.
let showInactive = false;
// Whether this school is elementary (school_level East/West/South, grades
// 1-6) or secondary (7-12) — decides which range gradeScopeToList()/
// gradeScopeLabel() accept when reading a student's Grade, and which
// options the grade filter dropdown offers. Detected once on load; defaults
// to secondary (matching the dropdown's original hardcoded 7-12 markup)
// until that lookup resolves.
let isElementarySchool = false;

async function detectSchoolLevel() {
    try {
        const res = await fetch(`../../api/school-config?action=getGrades&school=${encodeURIComponent(getCurrentSchool())}`).then(r => r.json());
        if (!res.success) return;
        isElementarySchool = !!res.isElementary;

        const gradeFilter = document.getElementById('gradeFilter');
        if (gradeFilter && Array.isArray(res.grades)) {
            const previousValue = gradeFilter.value;
            gradeFilter.innerHTML = '<option value="">All Grades</option>' +
                res.grades.map(g => `<option value="${g.id}">${escapeHtml(g.grade_name)}</option>`).join('');
            // Keep whatever was selected if it's still a valid option for this
            // school's level; otherwise fall back to "All Grades" rather than
            // silently filtering on a grade number that no longer applies.
            gradeFilter.value = res.grades.some(g => String(g.id) === previousValue) ? previousValue : '';
            currentGradeFilter = gradeFilter.value;
        }
    } catch (err) {
        // Network hiccup — keep the secondary-range default rather than blocking the page.
    }
}

async function initAccountPage() {
    initPage();
    await detectSchoolLevel();
    loadSchoolAccounts();

    // Setup search
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchAccounts();
        }
    });

    document.getElementById('gradeFilter').addEventListener('change', (e) => {
        currentGradeFilter = e.target.value;
        currentPage = 1;
        applyFiltersAndRender();
    });

    document.getElementById('showInactiveFilter').addEventListener('change', (e) => {
        showInactive = e.target.checked;
        currentPage = 1;
        searchAccounts();
    });

    document.getElementById('pageSizeFilter').addEventListener('change', (e) => {
        pageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value, 10);
        currentPage = 1;
        applyFiltersAndRender();
    });

    document.getElementById('accountsPagination').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        currentPage = btn.getAttribute('data-page') === 'next' ? currentPage + 1 : currentPage - 1;
        applyFiltersAndRender();
    });

    // Setup edit form
    document.getElementById('editAccountForm').addEventListener('submit', saveAccountChanges);

    initIssueCodeModal();
    initImportAccountsModal();
}

// Coordinator-issued teacher access codes — see api/issue-teacher-access-code.php.
// The code is emailed straight to the teacher's inbox. It's only shown here
// as a fallback if that email couldn't be sent (e.g. mail is disabled).
function initIssueCodeModal() {
    const openBtn = document.getElementById('openIssueCodeModalBtn');
    const modal = document.getElementById('issueCodeModal');
    const form = document.getElementById('issueCodeForm');
    const copyBtn = document.getElementById('copyIssueCodeBtn');

    if (!openBtn || !modal || !form) {
        return;
    }

    openBtn.addEventListener('click', () => {
        resetIssueCodeModal();
        modal.classList.add('show');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeIssueCodeModal();
        }
    });

    form.addEventListener('submit', issueTeacherAccessCode);

    copyBtn?.addEventListener('click', () => {
        const codeEl = document.getElementById('issueCodeValue');
        const code = codeEl ? codeEl.textContent : '';
        if (!code) return;
        navigator.clipboard?.writeText(code).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        }).catch(() => {});
    });
}

function resetIssueCodeModal() {
    const form = document.getElementById('issueCodeForm');
    const errorDiv = document.getElementById('issueCodeError');
    const resultDiv = document.getElementById('issueCodeResult');
    if (form) {
        form.reset();
        form.style.display = 'block';
    }
    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.classList.remove('show');
    }
    if (resultDiv) {
        resultDiv.style.display = 'none';
    }
}

function closeIssueCodeModal() {
    document.getElementById('issueCodeModal')?.classList.remove('show');
}

async function issueTeacherAccessCode(e) {
    e.preventDefault();

    const emailInput = document.getElementById('issueCodeEmail');
    const errorDiv = document.getElementById('issueCodeError');
    const submitBtn = document.getElementById('issueCodeSubmitBtn');
    const email = emailInput.value.trim();

    errorDiv.textContent = '';
    errorDiv.classList.remove('show');

    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';

    try {
        const currentUser = getCurrentUser() || {};
        const response = await fetch('../../api/issue-teacher-access-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                role: currentUser.role || currentUser.user_type || '',
                school: getCurrentSchool(),
                issuerId: currentUser.id || null
            })
        });
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Failed to generate access code.');
        }

        document.getElementById('issueCodeForm').style.display = 'none';

        const statusEl = document.getElementById('issueCodeStatus');
        const fallbackEl = document.getElementById('issueCodeFallback');
        if (data.emailSent) {
            statusEl.textContent = `Access code emailed to ${email}.`;
            fallbackEl.style.display = 'none';
        } else {
            statusEl.textContent = "Couldn't email the code — copy it and give it to the teacher directly:";
            document.getElementById('issueCodeValue').textContent = data.code;
            fallbackEl.style.display = 'flex';
        }

        const expiryEl = document.getElementById('issueCodeExpiry');
        if (expiryEl && data.expiresAt) {
            const expiryDate = new Date(data.expiresAt.replace(' ', 'T'));
            expiryEl.textContent = `Expires ${expiryDate.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })} — single use only.`;
        }
        document.getElementById('issueCodeResult').style.display = 'flex';
    } catch (error) {
        errorDiv.textContent = error.message || 'Network error. Please try again.';
        errorDiv.classList.add('show');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function getCurrentSchool() {
    const user = getCurrentUser();
    if (user.school || user.school_attended) {
        return user.school || user.school_attended;
    }
    
    try {
        const fallback = JSON.parse(localStorage.getItem('currentUser') || '{}');
        return fallback.school || fallback.school_attended || '';
    } catch (err) {
        return '';
    }
}

function formatUserType(type) {
    const typeMap = {
        'student': 'Student',
        'teacher': 'Teacher',
        'counselor': 'Counselor',
        'coordinator': 'Coordinator',
        'sdo': 'SDO',
        'other-school': 'Other School'
    };
    return typeMap[String(type || '').toLowerCase()] || type;
}

function getUserTypeBadgeClass(type) {
    const typeStr = String(type || '').toLowerCase();
    if (typeStr === 'student') return 'badge-student';
    if (typeStr === 'teacher') return 'badge-teacher';
    if (typeStr === 'counselor') return 'badge-counselor';
    if (typeStr === 'coordinator') return 'badge-coordinator';
    return 'badge-student';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function loadSchoolAccounts() {
    const school = getCurrentSchool();
    
    if (!school) {
        showAlert('School information not found', 'error');
        return;
    }

    let apiUrl = `../../api/manage-accounts?school=${encodeURIComponent(school)}`;
    if (showInactive) {
        apiUrl += '&include_inactive=1';
    }

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success || !result.data) {
                throw new Error(result.message || 'Failed to load accounts');
            }

            allAccounts = result.data;
            currentPage = 1;
            applyFiltersAndRender();
        })
        .catch(error => {
            console.error('Error loading accounts:', error);
            const tbody = document.getElementById('accountsTableBody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" class="no-accounts"><i class="bi bi-exclamation-triangle"></i> <p>Error: ${error.message}</p></td></tr>`;
            }
        });
}

function searchAccounts() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    const school = getCurrentSchool();

    if (!school) {
        showAlert('School information not found', 'error');
        return;
    }

    let apiUrl = `../../api/manage-accounts?school=${encodeURIComponent(school)}`;
    if (searchTerm) {
        apiUrl += `&search=${encodeURIComponent(searchTerm)}`;
    }
    if (showInactive) {
        apiUrl += '&include_inactive=1';
    }

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success || !result.data) {
                throw new Error(result.message || 'Failed to search accounts');
            }

            allAccounts = result.data;
            currentPage = 1;
            applyFiltersAndRender();
        })
        .catch(error => {
            console.error('Error searching accounts:', error);
            showAlert('Error: ' + error.message, 'error');
        });
}

// Applies the grade filter (client-side, on top of whatever the last
// fetch returned) and pagination, then renders the current page.
// gradeScopeToList (utils.js) parses a Grade cell whether it's a single
// student grade ("10") or a comma-scoped staff list ("7,8,9,10"), so one
// check covers both — an account matches if the selected grade is
// anywhere in its Grade value.
function applyFiltersAndRender() {
    const filtered = currentGradeFilter
        ? allAccounts.filter(a => gradeScopeToList(a.Grade, isElementarySchool).includes(parseInt(currentGradeFilter, 10)))
        : allAccounts;

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
    const endIdx = pageSize === Infinity ? filtered.length : Math.min(startIdx + pageSize, filtered.length);

    renderAccountsTable(filtered.slice(startIdx, endIdx));
    renderPagination(filtered.length, startIdx, endIdx, totalPages);
}

function renderPagination(totalFiltered, startIdx, endIdx, totalPages) {
    const el = document.getElementById('accountsPagination');
    if (!el) return;

    if (totalFiltered === 0 || pageSize === Infinity || totalPages <= 1) {
        el.innerHTML = '';
        return;
    }

    el.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="bi bi-chevron-left"></i> Prev
        </button>
        <span class="accounts-page-info">Showing ${startIdx + 1}&ndash;${endIdx} of ${totalFiltered} &middot; Page ${currentPage} of ${totalPages}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${currentPage >= totalPages ? 'disabled' : ''}>
            Next <i class="bi bi-chevron-right"></i>
        </button>`;
}

function renderAccountsTable(accounts) {
    const tbody = document.getElementById('accountsTableBody');

    if (!accounts || accounts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="no-accounts"><i class="bi bi-inbox"></i> <p>No accounts found</p></td></tr>`;
        return;
    }

    tbody.innerHTML = accounts.map(account => {
        // is_active only applies to student accounts here — staff status is
        // an SDO-only concern (see account-status.php), so anything else
        // always reads as Active on this page.
        const isStudent = String(account.Type || '').toLowerCase() === 'student';
        const isActive = account.is_active !== 0 && account.is_active !== '0';
        const statusBadge = isStudent
            ? `<span class="user-type-badge ${isActive ? 'badge-completed' : 'badge-rejected'}">${isActive ? 'Active' : 'Inactive'}</span>`
            : '&mdash;';
        const toggleBtn = isStudent
            ? `<button class="btn ${isActive ? 'btn-danger' : 'btn-success'} btn-sm" onclick="toggleStudentActive(${account.id}, ${isActive ? 'true' : 'false'})">
                    <i class="bi ${isActive ? 'bi-person-dash' : 'bi-person-check'}"></i> ${isActive ? 'Deactivate' : 'Activate'}
                </button>`
            : '';

        return `
        <tr>
            <td><strong>${account.First_name} ${account.Last_name}</strong></td>
            <td>${account.email}</td>
            <td>
                <span class="user-type-badge ${getUserTypeBadgeClass(account.Type)}">
                    ${formatUserType(account.Type)}
                </span>
            </td>
            <td>${gradeScopeLabel(account.Grade, isElementarySchool) || '&mdash;'}</td>
            <td>${statusBadge}</td>
            <td>${formatDate(account.created_at)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-edit" onclick="openEditModal(${account.id}, '${account.First_name}', '${account.Last_name}', '${account.email}', '${account.Type}')">
                        <i class="bi bi-pencil-square"></i> Edit
                    </button>
                    ${toggleBtn}
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

// Coordinator can deactivate a student's account once they've left the
// school (transferred, graduated, dropped out) so it stops showing up in
// this list and can no longer log in (login.php gates on is_active) —
// without deleting the student's history/records. Reactivating brings it
// back into the default (non-"Show inactive") view.
function toggleStudentActive(id, currentlyActive) {
    const nextActive = !currentlyActive;
    const confirmMessage = nextActive
        ? 'Reactivate this student account? They will be able to log in again.'
        : 'Deactivate this student account? They will no longer be able to log in, and the account will be hidden from this list unless "Show inactive students" is checked.';
    if (!window.confirm(confirmMessage)) {
        return;
    }

    const school = getCurrentSchool();

    fetch('../../api/manage-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setActive', id, active: nextActive, school })
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success) {
                throw new Error(result.message || 'Failed to update account status');
            }
            showAlert(nextActive ? 'Student account activated.' : 'Student account deactivated.', 'success');
            loadSchoolAccounts();
        })
        .catch(error => {
            console.error('Error toggling account status:', error);
            showAlert('Error: ' + error.message, 'error');
        });
}

function openEditModal(id, firstName, lastName, email, type) {
    currentEditingAccountId = id;
    
    document.getElementById('editFirstName').value = firstName;
    document.getElementById('editLastName').value = lastName;
    document.getElementById('editEmail').value = email;
    document.getElementById('editUserType').value = formatUserType(type);
    document.getElementById('editPassword').value = '';
    document.getElementById('editPasswordConfirm').value = '';
    
    document.getElementById('editAccountModal').classList.add('show');
}

function closeEditModal() {
    document.getElementById('editAccountModal').classList.remove('show');
    currentEditingAccountId = null;
    document.getElementById('editAccountForm').reset();
}

function saveAccountChanges(e) {
    e.preventDefault();
    
    if (!currentEditingAccountId) {
        showAlert('No account selected', 'error');
        return;
    }

    const firstName = document.getElementById('editFirstName').value.trim();
    const lastName = document.getElementById('editLastName').value.trim();
    const password = document.getElementById('editPassword').value.trim();
    const passwordConfirm = document.getElementById('editPasswordConfirm').value.trim();

    if (!firstName || !lastName) {
        showAlert('First name and last name are required', 'error');
        return;
    }

    if (password && passwordConfirm) {
        if (password !== passwordConfirm) {
            showAlert('Passwords do not match', 'error');
            return;
        }
        if (password.length < 6) {
            showAlert('Password must be at least 6 characters', 'error');
            return;
        }
    }

    const school = getCurrentSchool();
    
    const updateData = {
        id: currentEditingAccountId,
        first_name: firstName,
        last_name: lastName,
        school: school,
        password: password || ''
    };

    fetch('../../api/manage-accounts', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(result => {
        if (result.success) {
            showAlert('Account updated successfully!', 'success');
            closeEditModal();
            loadSchoolAccounts();
        } else {
            throw new Error(result.message || 'Failed to update account');
        }
    })
    .catch(error => {
        console.error('Error saving account:', error);
        showAlert('Error: ' + error.message, 'error');
    });
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function ensureExcelModal() {
    if (document.getElementById('excelPreviewModal')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="excelPreviewModal" class="modal">
        <div class="modal-content" style="max-width:900px; width:95%; height:82vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2><i class="bi bi-file-earmark-excel"></i> <span id="excelPreviewTitle">Excel Preview</span></h2>
                <button type="button" class="modal-close" id="excelPreviewCloseX">&times;</button>
            </div>
            <div class="modal-body" style="flex:1; overflow:auto;">
                <div class="table-container"><table><tbody id="excelPreviewTbody"></tbody></table></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="excelPreviewCloseBtn">Close</button>
                <button type="button" class="btn btn-success" id="excelDownloadBtn"><i class="bi bi-download"></i> Download</button>
            </div>
        </div>
    </div>`);
    document.getElementById('excelPreviewCloseX').addEventListener('click', () => closeModal('excelPreviewModal'));
    document.getElementById('excelPreviewCloseBtn').addEventListener('click', () => closeModal('excelPreviewModal'));
}

// sheet.aoa (array-of-arrays) is the exact same shape written to the
// worksheet, so what's previewed is what's downloaded. Row 0 is the sheet
// title (shown as a heading, not a table row); a blank row (`[]`) marks the
// row right after it as the column-header row (rendered as <th>).
function showExcelPreview(filename, sheets, onDownload) {
    ensureExcelModal();
    document.getElementById('excelPreviewTitle').textContent = sheets.length === 1
        ? String((sheets[0].aoa[0] && sheets[0].aoa[0][0]) || 'Excel Preview')
        : 'Excel Preview';

    document.getElementById('excelPreviewTbody').innerHTML = sheets.map((sheet, sheetIndex) => {
        const title = String((sheet.aoa[0] && sheet.aoa[0][0]) || sheet.name);
        const heading = `<tr><td colspan="20" style="border:none; padding:${sheetIndex === 0 ? '0' : '24px'} 0 8px; font-weight:700; font-size:15px;">${escapeHtml(title)}</td></tr>`;

        let afterBlank = false;
        const body = sheet.aoa.slice(1).map(row => {
            if (row.length === 0) { afterBlank = true; return '<tr><td style="height:10px; border:none; padding:0;"></td></tr>'; }
            const cellTag = afterBlank ? 'th' : 'td';
            afterBlank = false;
            return `<tr>${row.map(cell => `<${cellTag}>${escapeHtml(cell == null ? '' : cell)}</${cellTag}>`).join('')}</tr>`;
        }).join('');

        return heading + body;
    }).join('');

    document.getElementById('excelDownloadBtn').onclick = onDownload;
    openModal('excelPreviewModal');
}

// Exports student accounts (Type === 'student') from whatever is currently
// loaded/filtered — respects the grade filter but not pagination, so it
// covers every matching student, not just the visible page. Age comes from
// student_table (joined in api/manage-accounts) and is blank for
// accounts that never filled out a student profile. Shows a preview modal
// (title "Student Account" above the table) before the file is downloaded.
function exportStudentAccountsToExcel() {
    if (typeof XLSX === 'undefined') {
        showAlert('Excel export library failed to load.', 'error');
        return;
    }

    const scoped = currentGradeFilter
        ? allAccounts.filter(a => gradeScopeToList(a.Grade, isElementarySchool).includes(parseInt(currentGradeFilter, 10)))
        : allAccounts;
    const students = scoped.filter(a => String(a.Type || '').toLowerCase() === 'student');

    if (students.length === 0) {
        showAlert('No student accounts to export', 'error');
        return;
    }

    const aoa = [
        ['Student Account'],
        [],
        ['First Name', 'Last Name', 'Grade', 'Age', 'Email'],
        ...students.map(s => [s.First_name, s.Last_name, gradeScopeLabel(s.Grade, isElementarySchool) || '', s.Age || '', s.email])
    ];

    const school = getCurrentSchool();
    const schoolSlug = school ? school.replace(/[^a-z0-9]+/gi, '_') : 'Export';
    const filename = `Student_Accounts_${schoolSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const sheets = [
        { name: 'Student Accounts', aoa, colWidths: [{ wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 30 }] }
    ];

    showExcelPreview(filename, sheets, () => {
        const workbook = XLSX.utils.book_new();
        sheets.forEach(sheet => {
            const worksheet = XLSX.utils.aoa_to_sheet(sheet.aoa);
            worksheet['!cols'] = sheet.colWidths;
            XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
        });
        XLSX.writeFile(workbook, filename);
        showAlert('Excel report exported successfully!', 'success');
        closeModal('excelPreviewModal');
    });
}

/* ── Import Accounts (bulk student Excel import) ──
   Download Template -> Fill Out Excel -> Upload -> Validate -> Preview ->
   Confirm Import. api/import-students owns all the actual validation
   rules (required fields, LRN/email format, grade range for this school's
   level, in-file + against-the-database duplicate checks) — this file only
   parses the spreadsheet into plain row objects and renders whatever that
   endpoint reports back, so the rules can never drift between what the
   preview shows and what actually gets imported. */
const IMPORT_TEMPLATE_COLUMNS = ['LRN', 'First Name', 'Last Name', 'Middle Name', 'Sex', 'Date of Birth', 'Age', 'Grade', 'Section', 'Email', 'Password'];
let importParsedRows = [];
let importValidationResults = [];

function initImportAccountsModal() {
    const openBtn = document.getElementById('openImportAccountsModalBtn');
    const modal = document.getElementById('importAccountsModal');
    if (!openBtn || !modal) return;

    openBtn.addEventListener('click', () => {
        resetImportAccountsModal();
        openModal('importAccountsModal');
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeImportAccountsModal(); });
    document.getElementById('importCancelBtn').addEventListener('click', closeImportAccountsModal);
    document.getElementById('downloadImportTemplateBtn').addEventListener('click', downloadImportTemplate);
    document.getElementById('importChooseAnotherFileBtn').addEventListener('click', resetImportAccountsModal);
    document.getElementById('importConfirmBtn').addEventListener('click', confirmImportAccounts);

    const dropZone = document.getElementById('importDropZone');
    const fileInput = document.getElementById('importFileInput');
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleImportFile(fileInput.files[0]); });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary-color)'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border-color)'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-color)';
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleImportFile(file);
    });
}

function closeImportAccountsModal() {
    closeModal('importAccountsModal');
}

function resetImportAccountsModal() {
    importParsedRows = [];
    importValidationResults = [];
    document.getElementById('importStepUpload').style.display = 'block';
    document.getElementById('importStepPreview').style.display = 'none';
    document.getElementById('importStepResult').style.display = 'none';
    document.getElementById('importConfirmBtn').style.display = 'none';
    const errorDiv = document.getElementById('importFileError');
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');
    document.getElementById('importFileLoading').style.display = 'none';
    document.getElementById('importFileInput').value = '';
    document.getElementById('importCancelBtn').textContent = 'Close';
}

// The example row's Grade matches this school's own level (1-6 elementary,
// 7-12 secondary) so the template isn't misleading before anyone has even
// seen the real per-school validation rule.
async function downloadImportTemplate() {
    if (typeof XLSX === 'undefined') {
        showAlert('Excel library failed to load.', 'error');
        return;
    }

    const school = getCurrentSchool();
    let exampleGrade = '7';
    try {
        const res = await fetch(`../../api/school-config?action=getGrades&school=${encodeURIComponent(school)}`).then(r => r.json());
        if (res.success) exampleGrade = String(res.isElementary ? 1 : 7);
    } catch (err) { /* keep the secondary-range default */ }

    const aoa = [
        IMPORT_TEMPLATE_COLUMNS,
        ['123456789012', 'Juan', 'Dela Cruz', 'Santos', 'Male', '2012-06-15', '13', exampleGrade, 'Sampaguita', 'juan.delacruz@example.com', '']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    // Kept as text so Excel never strips a leading zero from the example LRN.
    if (worksheet['A2']) worksheet['A2'].z = '@';
    worksheet['!cols'] = [
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
        { wch: 14 }, { wch: 6 }, { wch: 8 }, { wch: 14 }, { wch: 28 }, { wch: 14 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    XLSX.writeFile(workbook, 'Student_Import_Template.xlsx');
}

function handleImportFile(file) {
    const errorDiv = document.getElementById('importFileError');
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
        errorDiv.textContent = 'Please upload an .xlsx or .xls file.';
        errorDiv.classList.add('show');
        return;
    }

    document.getElementById('importFileLoading').style.display = 'block';

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            // raw:false + dateNF renders date-typed cells as plain
            // "yyyy-mm-dd" strings (matching what api/import-students
            // expects) instead of a locale-formatted date or an Excel serial
            // number, regardless of how the cell happens to be formatted.
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { raw: false, dateNF: 'yyyy-mm-dd', defval: '' });

            if (rawRows.length === 0) {
                throw new Error('No student rows found in that file — make sure you filled in the template below the header row.');
            }
            if (rawRows.length > 1000) {
                throw new Error('Please import 1000 students or fewer at a time.');
            }

            importParsedRows = rawRows.map(row => {
                const clean = {};
                IMPORT_TEMPLATE_COLUMNS.forEach(col => { clean[col] = row[col] != null ? String(row[col]).trim() : ''; });
                return clean;
            });

            await validateImportRows();
        } catch (err) {
            document.getElementById('importFileLoading').style.display = 'none';
            errorDiv.textContent = err.message || 'Could not read that file.';
            errorDiv.classList.add('show');
        }
    };
    reader.onerror = () => {
        document.getElementById('importFileLoading').style.display = 'none';
        errorDiv.textContent = 'Could not read that file.';
        errorDiv.classList.add('show');
    };
    reader.readAsArrayBuffer(file);
}

async function validateImportRows() {
    const errorDiv = document.getElementById('importFileError');
    const school = getCurrentSchool();

    try {
        const response = await fetch('../../api/import-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'validate', school, rows: importParsedRows })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message || 'Validation failed.');

        importValidationResults = result.results;
        renderImportPreview(result.summary);
    } catch (err) {
        errorDiv.textContent = err.message || 'Could not validate that file.';
        errorDiv.classList.add('show');
    } finally {
        document.getElementById('importFileLoading').style.display = 'none';
    }
}

const IMPORT_STATUS_LABEL = {
    valid: 'Ready to import',
    invalid: 'Invalid',
    duplicate_in_file: 'Duplicate in file',
    already_exists: 'Already exists',
    created: 'Created',
    failed: 'Failed',
};
const IMPORT_STATUS_BADGE = {
    valid: 'badge-completed',
    invalid: 'badge-rejected',
    duplicate_in_file: 'badge-pending',
    already_exists: 'badge-pending',
    created: 'badge-completed',
    failed: 'badge-rejected',
};

function renderImportPreview(summary) {
    document.getElementById('importStepUpload').style.display = 'none';
    document.getElementById('importStepPreview').style.display = 'block';

    document.getElementById('importSummaryCards').innerHTML = [
        { num: importValidationResults.length, lbl: 'Total Rows', icon: 'bi-list-ul', color: 'info' },
        { num: summary.valid, lbl: 'Ready to Import', icon: 'bi-check-circle', color: 'green' },
        { num: summary.invalid, lbl: 'Invalid', icon: 'bi-x-circle', color: 'red' },
        { num: summary.duplicate_in_file + summary.already_exists, lbl: 'Duplicate / Existing', icon: 'bi-exclamation-triangle', color: 'amber' },
    ].map(c => `<div class="stat-card"><div class="stat-icon stat-icon-${c.color}"><i class="bi ${c.icon}"></i></div><div><h3>${c.num}</h3><p>${escapeHtml(c.lbl)}</p></div></div>`).join('');

    document.getElementById('importPreviewTbody').innerHTML = importValidationResults.map(r => `
        <tr>
            <td>${r.row}</td>
            <td>${escapeHtml(r.data.firstName)} ${escapeHtml(r.data.lastName)}</td>
            <td>${escapeHtml(r.data.lrn)}</td>
            <td>${escapeHtml(r.data.email)}</td>
            <td>${r.data.grade != null ? escapeHtml(String(r.data.grade)) : '&mdash;'}</td>
            <td><span class="user-type-badge ${IMPORT_STATUS_BADGE[r.status] || 'badge-pending'}">${IMPORT_STATUS_LABEL[r.status] || r.status}</span></td>
            <td style="font-size:12.5px; color:#777;">${r.errors && r.errors.length ? escapeHtml(r.errors.join('; ')) : '&mdash;'}</td>
        </tr>
    `).join('');

    const confirmBtn = document.getElementById('importConfirmBtn');
    if (summary.valid > 0) {
        confirmBtn.style.display = 'inline-flex';
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="bi bi-cloud-upload"></i> Import ${summary.valid} Account${summary.valid === 1 ? '' : 's'}`;
    } else {
        confirmBtn.style.display = 'none';
    }
}

async function confirmImportAccounts() {
    const confirmBtn = document.getElementById('importConfirmBtn');
    const school = getCurrentSchool();
    confirmBtn.disabled = true;
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Importing&hellip;';

    try {
        const response = await fetch('../../api/import-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'commit', school, rows: importParsedRows })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message || 'Import failed.');

        const summary = result.summary;
        document.getElementById('importStepPreview').style.display = 'none';
        document.getElementById('importStepResult').style.display = 'block';
        confirmBtn.style.display = 'none';
        document.getElementById('importCancelBtn').textContent = 'Done';

        const resultIcon = document.getElementById('importResultIcon');
        resultIcon.className = summary.created > 0 ? 'bi bi-check-circle' : 'bi bi-exclamation-triangle';
        resultIcon.style.color = summary.created > 0 ? '#1b8f59' : '#a15c00';

        document.getElementById('importResultTitle').textContent = summary.created > 0
            ? `${summary.created} student account${summary.created === 1 ? '' : 's'} created!`
            : 'No accounts were created';

        const skipped = summary.invalid + summary.duplicate_in_file + summary.already_exists + summary.failed;
        document.getElementById('importResultDetail').textContent = skipped > 0
            ? `${skipped} row${skipped === 1 ? ' was' : 's were'} skipped (invalid, duplicate, already existing, or failed) and were not imported.`
            : 'Every row in the file was imported successfully.';

        loadSchoolAccounts();
    } catch (err) {
        showAlert('Error: ' + (err.message || 'Import failed.'), 'error');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalText;
    }
}

document.addEventListener('DOMContentLoaded', initAccountPage);

