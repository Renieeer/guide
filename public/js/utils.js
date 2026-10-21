// Utility functions

// Redirects to the login page the moment ANY fetch() on this page gets a
// 401 with sessionExpired:true — see includes/session-guard's
// require_api_session(). Without this, a tab left open after the same
// account logs in elsewhere (or a session that's simply been invalidated)
// would just show a silent "failed to load" for whatever it tried to
// fetch next, instead of actually landing the user back on the login
// page like a real single-session system should. Patches window.fetch
// once, here, rather than editing every individual fetch() call site
// across ~50 page scripts.
(function () {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;

    window.fetch = function (...args) {
        return originalFetch.apply(this, args).then(response => {
            if (response.status === 401) {
                // .clone() so the caller's own .json()/.text() on this same
                // response still works — a Response body can only be read
                // once, and this check must not consume it out from under
                // normal, unrelated 401 handling elsewhere in the app.
                response.clone().json().then(data => {
                    if (data && data.sessionExpired) {
                        window.location.href = '../../';
                    }
                }).catch(() => { /* not JSON, or no body — not our 401 */ });
            }
            return response;
        });
    };
})();

// Age in whole years as of today, from a birth date string — shared by
// every referral form (teacher's, counselor's and other-school's walk-in
// forms) so a student's age is always computed from their date of birth
// rather than typed in. Returns '' if the date is missing/unparseable
// rather than guessing.
function calculateAge(dob) {
    if (!dob) return '';
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return '';

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age >= 0 ? String(age) : '';
}

// Save to localStorage (mock database)
function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// Get from localStorage
function getData(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
}

// Fixed top-right toast, used by pages that call showNotification(message,
// type) directly (e.g. the Documents pages) rather than showAlert(), which
// needs a .page-content container in the DOM to insert into. Reuses the
// same .alert/.alert-{type} CSS so both look identical.
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} show`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Show alert message
function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;

    // .alert is position:fixed (see css/style.css) — this container only
    // decides where the element lives in the DOM for cleanup, never its
    // on-screen position. pages/{counselor,other-school}/counseling
    // don't have a .page-content wrapper (unlike every other page), which
    // silently swallowed every showAlert() call on those two pages —
    // nothing ever threw, the alert just never made it into the document.
    // Falling back through .main-content to document.body means a missing
    // wrapper on any page, now or in the future, can't cause this again.
    const container = document.querySelector('.page-content')
        || document.querySelector('.main-content')
        || document.body;
    container.insertBefore(alert, container.firstChild);
    setTimeout(() => alert.remove(), 3000);
}

// Format date
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Generate unique ID
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Open modal
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
    }
}

// Close modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

// Reusable Yes/No confirmation dialog, built from this app's own .modal/
// .modal-content/.modal-header/.modal-footer classes (same clay-themed
// chrome as every other dialog in the app — see css/style.css) instead of
// the browser's plain native confirm(), which can't be styled at all.
// Injected into the DOM on demand, so any page that already loads
// utils.js can call this with zero markup of its own. Text is set via
// textContent (not innerHTML), so the message/labels never need escaping
// even if a caller passes something dynamic.
function confirmAction(message, onConfirm, options = {}) {
    const existing = document.getElementById('confirmActionModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirmActionModal';
    overlay.className = 'modal show';

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.maxWidth = '420px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h2');
    title.textContent = options.title || 'Please Confirm';
    const closeX = document.createElement('span');
    closeX.className = 'modal-close';
    closeX.textContent = '×';
    header.append(title, closeX);

    const body = document.createElement('div');
    body.className = 'modal-body';
    const messageEl = document.createElement('p');
    messageEl.style.margin = '0';
    messageEl.textContent = message;
    body.appendChild(messageEl);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'btn btn-secondary';
    noBtn.textContent = options.cancelLabel || 'No';
    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'btn btn-primary';
    yesBtn.textContent = options.confirmLabel || 'Yes';
    footer.append(noBtn, yesBtn);

    content.append(header, body, footer);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();
    closeX.addEventListener('click', cleanup);
    noBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    yesBtn.addEventListener('click', () => {
        cleanup();
        onConfirm();
    });
}

// Initialize date input with today's date
function setTodayDate(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        const today = new Date().toISOString().split('T')[0];
        input.value = today;
    }
}

// Validate email
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Create Badge HTML
function createBadge(status) {
    const badgeClasses = {
        'pending': 'badge-pending',
        'in-progress': 'badge-in-progress',
        'completed': 'badge-completed',
        'rejected': 'badge-rejected'
    };
    return `<span class="badge ${badgeClasses[status] || 'badge-pending'}">${status}</span>`;
}

// Renders a small Offender/Victim tag for a referral's referral_role (see
// api/referral / teacher/referral-form.js's multi-person
// submission) — empty string for a referral with no role set, so an
// ordinary single-person referral shows nothing extra.
function referralRoleBadge(role) {
    const normalized = String(role || '').toLowerCase();
    if (normalized !== 'offender' && normalized !== 'victim') return '';
    const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    return `<span class="badge badge-${normalized}">${label}</span>`;
}

// A referral's urgency as a colored badge — green / amber / red, each with
// its own icon so the level never rests on color alone. Stage 2's
// assessment sets low / medium / high; "normal" is the default before that
// (muted gray). Older "urgent" / "crisis" values render as high.
const URGENCY_LEVELS = {
    low: { label: 'Low', icon: 'bi-shield-check', tone: 'low' },
    medium: { label: 'Medium', icon: 'bi-exclamation-triangle-fill', tone: 'medium' },
    high: { label: 'High', icon: 'bi-exclamation-octagon-fill', tone: 'high' },
    urgent: { label: 'Urgent', icon: 'bi-exclamation-octagon-fill', tone: 'high' },
    crisis: { label: 'Crisis', icon: 'bi-exclamation-octagon-fill', tone: 'high' }
};

function urgencyBadge(urgency) {
    const key = String(urgency || 'normal').toLowerCase();
    const info = URGENCY_LEVELS[key];
    if (!info) {
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        const safe = label.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        return `<span class="badge badge-urgency badge-urgency-normal">${safe}</span>`;
    }
    return `<span class="badge badge-urgency badge-urgency-${info.tone}" title="${info.label} urgency"><i class="bi ${info.icon}"></i> ${info.label}</span>`;
}

// Create action buttons
function createActionButtons(id, canEdit = true, canDelete = true) {
    let html = '';
    if (canEdit) html += `<button class="btn btn-sm btn-primary" onclick="editItem('${id}')">Edit</button>`;
    if (canDelete) html += `<button class="btn btn-sm btn-danger" onclick="deleteItem('${id}')">Delete</button>`;
    return html;
}

// Referral stages — mirrors the guidance office's official 7-step case
// management flow (Interview/Background -> ... -> Student Follow-up -> Case Closing).
const referralStages = [
    { id: 1, name: 'Interview/Background', description: 'Initial interview with the student to gather background information (walk-in, or referred by the adviser, subject teacher, or student).' },
    { id: 2, name: 'Initial Risk Assessment', description: 'Initial risk assessment by the counselor using tools such as GAD-7, PHQ, Columbia Suicide Severity Rating Scale, HEEADSSS, etc.' },
    { id: 3, name: 'Parent Call-up/Consent', description: 'Parent called and consent obtained for further assessment and interventions.' },
    { id: 4, name: 'Intervention', description: 'Intervention plan carried out — support measures and coping strategies put in place.' },
    { id: 5, name: 'Counseling', description: 'Counseling sessions with the student — discussion of findings and next steps.' },
    { id: 6, name: 'Student Follow-up', description: 'Follow-up with the student at a set interval to monitor progress and well-being after intervention.' },
    { id: 7, name: 'Case Closing', description: 'Case closing acknowledgement — final status of the case on record.' }
];

// Get stage info
function getStageInfo(stageId) {
    return referralStages.find(s => s.id === stageId);
}

// Get all stages
function getAllStages() {
    return referralStages;
}

// Create stage indicator HTML
function createStageIndicator(currentStage) {
    let html = '<div class="referral-stages">';
    referralStages.forEach(stage => {
        const isActive = stage.id === currentStage;
        const isCompleted = stage.id < currentStage;
        const stageClass = isActive ? 'active' : (isCompleted ? 'completed' : '');
        html += `<div class="stage ${stageClass}">
                    <div class="stage-circle" data-stage="${stage.id}">${stage.id}</div>
                    <div class="stage-name">${stage.name}</div>
                 </div>`;
    });
    html += '</div>';
    return html;
}

// Initialize sidebar logout
function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', requestLogout);
    }
}

// Floating "are you sure?" confirmation shown before any logout button
// actually logs the user out. Builds the dialog on demand and reuses the
// app's existing .modal/.modal-content styling (css/style.css) so it looks
// native wherever it's triggered from, instead of the browser's confirm().
function ensureLogoutConfirmModal() {
    let modal = document.getElementById('logoutConfirmModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'logoutConfirmModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2>Log Out</h2>
                <button type="button" class="modal-close" id="logoutConfirmClose" aria-label="Cancel">&times;</button>
            </div>
            <div class="modal-body" style="padding: 24px 32px;">
                <p style="margin: 0;">Are you sure you want to log out?</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="logoutConfirmCancel">Cancel</button>
                <button type="button" class="btn btn-danger" id="logoutConfirmOk">Log Out</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const hide = () => modal.classList.remove('show');
    modal.querySelector('#logoutConfirmClose').addEventListener('click', hide);
    modal.querySelector('#logoutConfirmCancel').addEventListener('click', hide);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) hide();
    });
    modal.querySelector('#logoutConfirmOk').addEventListener('click', () => {
        hide();
        logout();
    });

    return modal;
}

function requestLogout(e) {
    if (e) e.preventDefault();
    ensureLogoutConfirmModal().classList.add('show');
}

const PROFILE_ROLE_LABELS = {
    student: 'Student',
    teacher: 'Teacher',
    counselor: 'Counselor',
    coordinator: 'Coordinator',
    'counselor-and-coordinator': 'Counselor & Coordinator',
    sdo: 'SDO',
    admin: 'Administrator'
};

// Human-readable role label — used on pages/<role>/profile (js/profile.js)
// and the sidebar's "My Profile" popup (js/sidebar-active.js).
function formatProfileRole(role) {
    return PROFILE_ROLE_LABELS[String(role || '').toLowerCase()] || role || '';
}

// Keeps sessionStorage/localStorage user objects in sync after a profile
// change, so the sidebar avatar/name update immediately without re-login.
// Used by pages/<role>/profile's edit form (js/profile.js) and by the
// sidebar's "My Profile" popup edit form (js/sidebar-active.js).
function syncStoredUser(patch) {
    ['user', 'userInfo'].forEach(key => {
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        try {
            const obj = Object.assign(JSON.parse(raw), patch);
            sessionStorage.setItem(key, JSON.stringify(obj));
        } catch (err) { /* ignore malformed storage */ }
    });

    const rawLocal = localStorage.getItem('currentUser');
    if (rawLocal) {
        try {
            const obj = Object.assign(JSON.parse(rawLocal), patch);
            localStorage.setItem('currentUser', JSON.stringify(obj));
        } catch (err) { /* ignore malformed storage */ }
    }

    setUserInfo();
}

// Set user info in topbar
function setUserInfo() {
    const user = getCurrentUser();
    if (user && user.name) {
        const nameEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');
        const avatarEl = document.getElementById('userAvatar');

        if (nameEl) nameEl.textContent = user.name;
        if (roleEl && user.role) {
            roleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('-', ' ');
        }
        if (avatarEl && typeof user.name === 'string') {
            const photoUrl = displayAvatarUrl(user);
            if (photoUrl) {
                avatarEl.innerHTML = `<img src="${photoUrl}" alt="">`;
            } else {
                avatarEl.textContent = userInitials(user);
            }
        }
    }

    renderSidebarAvatar();
}

// Initials fallback shown wherever a user has no profile photo yet.
function userInitials(user) {
    const name = (user && user.name) ? String(user.name) : '';
    const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase();
    return initials || 'U';
}

// `user.profile_image` (from js/auth.js on login, or refreshed by
// pages/<role>/profile after an upload) is stored root-relative, e.g.
// "api/avatar?id=5&v=x.jpg" — the photo itself lives in the database
// (see api/avatar), this is just its URL. Every page that renders this
// lives two levels down at pages/<role>/*.php, so "../../" always resolves
// correctly. Strictly reflects whether this account has a REAL uploaded
// photo — callers that decide "show the Remove Photo button" key off this
// (not displayAvatarUrl()), so it deliberately does NOT fall back to the
// role default below.
function userAvatarUrl(user) {
    if (!user || !user.profile_image) return null;
    return `../../${user.profile_image}`;
}

// Default avatar for the 4 staff-ish roles that don't otherwise pick a
// profile photo at account creation — the DepEd seal saved at
// uploads/profile-images/default-profile.jpg. Uploading a real photo (or
// still having none, for student/sdo) is unaffected: this is only ever a
// *display* fallback, layered on in displayAvatarUrl() below, never written
// to users_tables.profile_image itself.
const DEFAULT_AVATAR_ROLES = ['coordinator', 'counselor', 'teacher', 'counselor-and-coordinator'];

function defaultAvatarUrl(user) {
    if (!user || !DEFAULT_AVATAR_ROLES.includes(user.role)) return null;
    return '../../uploads/profile-images/default-profile.jpg';
}

// What to actually show for this user's avatar: their own uploaded photo if
// they have one, else their role's default seal if it has one, else null
// (the caller's own initials fallback applies — student/sdo, unchanged).
function displayAvatarUrl(user) {
    return userAvatarUrl(user) || defaultAvatarUrl(user);
}

// Fills the sidebar header's avatar circle (#sidebarAvatar) with the user's
// photo if they've uploaded one, their role's default seal if not, or their
// initials as a last resort. Runs on every page via initPage() ->
// setUserInfo() so the "whose account is this" indicator stays in sync
// everywhere, not just on the profile page itself.
function renderSidebarAvatar() {
    const el = document.getElementById('sidebarAvatar');
    if (!el) return;

    const user = getCurrentUser();
    const photoUrl = displayAvatarUrl(user);

    if (photoUrl) {
        el.innerHTML = `<img src="${photoUrl}" alt="">`;
    } else {
        el.textContent = userInitials(user);
    }
}

// Initialize common page features
function initPage() {
    checkAuth();
    setUserInfo();
    initLogout();
}

// ========== GRADE SCOPE ==========
// Mirrors api/grade-scope.php. A staff account's grade scope is a
// comma-separated list of grade numbers (e.g. "7", "11,12", "7,8,9,10")
// stored on the user object as `grade_scope`. Empty/missing means no
// restriction (the account sees every grade at its school), so accounts
// that were never assigned a scope keep working exactly as before.
const GRADE_LEGACY_CODE_MAP = { '1': 7, '2': 8, '3': 9, '4': 10, '5': 11, '6': 12 };

function getCurrentGradeScope() {
    const user = getCurrentUser();
    return (user && user.grade_scope) ? String(user.grade_scope) : '';
}

// `grade_scope` above is only ever set at login time (js/auth.js), from a
// snapshot of users_tables.Grade — there are no server sessions in this app,
// so nothing else keeps it in sync. If SDO edits a counselor/coordinator/
// combined account's grade assignment while that account is already logged
// in, its open tabs would otherwise keep reporting the OLD (or no)
// restriction until the next login. Every grade-scoped report/dashboard
// page awaits this once on load, before reading getCurrentGradeScope(), to
// pull the current value from the server first. Silently keeps the cached
// value on failure (offline, etc.) rather than blocking the page.
async function refreshGradeScope() {
    const user = getCurrentUser();
    if (!user || !user.id) return;

    try {
        const response = await fetch(`../../api/profile?id=${encodeURIComponent(user.id)}`);
        const result = await response.json();
        if (result.success && result.data) {
            syncStoredUser({ grade_scope: result.data.grade || '' });
        }
    } catch (err) {
        // Keep using the cached scope from login.
    }
}

// isElementary switches the accepted range to 1-6 (East/West/South schools);
// every existing caller omits it and keeps the original 7-12 behavior.
function gradeScopeToList(scope, isElementary = false) {
    const min = isElementary ? 1 : 7;
    const max = isElementary ? 6 : 12;
    return String(scope || '')
        .split(',')
        .map(part => parseInt(part.trim(), 10))
        .filter(num => Number.isInteger(num) && num >= min && num <= max);
}

// isElementary switches the accepted range to 1-6 (East/West/South schools)
// and turns off the legacy 1-6-code-means-grade-7-12 mapping, which only
// makes sense for secondary schools — same convention as gradeScopeToList().
// Every existing caller omits it and keeps the original 7-12 behavior.
function normalizeGradeNumber(rawGrade, isElementary = false) {
    const raw = String(rawGrade == null ? '' : rawGrade).trim();
    if (!raw) return null;

    const min = isElementary ? 1 : 7;
    const max = isElementary ? 6 : 12;

    if (/^\d+$/.test(raw)) {
        const num = parseInt(raw, 10);
        if (num >= min && num <= max) return num;
        if (!isElementary && GRADE_LEGACY_CODE_MAP[raw] !== undefined) return GRADE_LEGACY_CODE_MAP[raw];
    }

    // Free-text fields (e.g. "Grade 10 - Section Alpha") — pull the first
    // grade-shaped number out of the string rather than requiring an exact match.
    const textMatch = raw.match(/grade\s*(\d{1,2})/i);
    if (textMatch) {
        const num = parseInt(textMatch[1], 10);
        return (num >= min && num <= max) ? num : null;
    }

    return null;
}

// True if `scope` is empty (no restriction) or `rawGrade` normalizes into it.
function gradeMatchesScope(rawGrade, scope) {
    const scopeGrades = gradeScopeToList(scope);
    if (scopeGrades.length === 0) return true;

    const normalized = normalizeGradeNumber(rawGrade);
    return normalized !== null && scopeGrades.includes(normalized);
}

// Human label for a grade scope, e.g. "Grade 8" / "Grades 11-12" / "Grades 7-10".
function gradeScopeLabel(scope, isElementary = false) {
    const grades = gradeScopeToList(scope, isElementary).sort((a, b) => a - b);
    if (grades.length === 0) return '';
    if (grades.length === 1) return `Grade ${grades[0]}`;

    const isConsecutive = grades.every((g, i) => i === 0 || g === grades[i - 1] + 1);
    return isConsecutive
        ? `Grades ${grades[0]}-${grades[grades.length - 1]}`
        : `Grades ${grades.join(', ')}`;
}

// Renders a small "Grade 8 Counselor" / "Coordinator · Grades 7-10" badge
// into the given element (if present). No-op for unassigned accounts so
// schools that don't use per-grade staff splitting see nothing extra.
function renderGradeScopeBadge(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const label = gradeScopeLabel(getCurrentGradeScope());
    if (!label) {
        el.style.display = 'none';
        return;
    }

    const user = getCurrentUser() || {};
    const role = String(user.role || user.user_type || '').toLowerCase();
    const roleLabel = role === 'counselor-and-coordinator' ? 'Coordinator & Counselor' :
        role === 'coordinator' ? 'Coordinator' :
        role === 'counselor' ? 'Counselor' : '';

    el.textContent = roleLabel ? `${roleLabel} · ${label}` : label;
    el.style.display = '';
}

