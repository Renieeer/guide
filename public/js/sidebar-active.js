// Global sidebar active state handler
function initSidebarActive() {
    const path = window.location.pathname.replace(/\/+$/, '');
    const menuLinks = document.querySelectorAll('.sidebar-menu a');

    menuLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (!href || href === '#') return;
        // Exact path match — /counselor/referral must not also light up
        // /counselor/referral-status.
        const linkPath = new URL(href, window.location.href).pathname.replace(/\/+$/, '');
        if (linkPath === path) {
            link.classList.add('active');
        }
    });
}

// Collapsible nav groups (e.g. "School Control" on the SDO sidebar).
// Collapsed by default; clicking the label toggles it, and it opens itself
// automatically if one of its own links is the current page. No-ops on
// sidebars with no .sidebar-group elements.
function initSidebarGroups() {
    document.querySelectorAll('.sidebar-group').forEach(group => {
        if (group.querySelector('.sidebar-submenu a.active')) {
            group.classList.add('is-open');
        }

        const toggle = group.querySelector('.sidebar-group-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                group.classList.toggle('is-open');
            });
        }
    });
}

// Mobile hamburger toggle: opens/closes the off-canvas sidebar by flipping
// a class on <body> (see the .sidebar-toggle / body.sidebar-open rules in
// style.css). No-ops on pages without a .sidebar-toggle button.
function initSidebarToggle() {
    const toggle = document.querySelector('.sidebar-toggle');
    const overlay = document.querySelector('.sidebar-overlay');
    if (!toggle) return;

    const closeSidebar = () => document.body.classList.remove('sidebar-open');

    toggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-open');
    });

    overlay?.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSidebar();
    });

    // Close automatically after tapping a nav link (the link navigation
    // itself unloads the page, but this avoids a flash of the drawer
    // staying open on back/forward-cache restores).
    document.querySelectorAll('.sidebar-menu a').forEach((link) => {
        link.addEventListener('click', closeSidebar);
    });

    // Don't leave the drawer stuck "open" if the window is resized past
    // the mobile breakpoint while it was open.
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) closeSidebar();
    });
}

// "My Profile" popup (see #profileSummaryModal in includes/sidebar-*.php):
// the sidebar avatar opens a quick summary card, and its "Edit Profile"
// button swaps the same popup into an edit form in place (name, password,
// photo) — it never navigates to a separate page. Relies on
// getCurrentUser()/openModal()/closeModal()/userAvatarUrl()/userInitials()/
// formatProfileRole()/syncStoredUser()/showAlert() from js/auth.js + js/
// utils.js — those load after this script on every page, but everything
// here only runs on DOMContentLoaded or later, by which point they've
// already executed. No-ops on sidebars without the popup markup.
function initSidebarProfilePopup() {
    const modal = document.getElementById('profileSummaryModal');
    if (!modal) return;

    document.querySelectorAll('[data-profile-popup-trigger]').forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            showProfilePopupView();
            openModal('profileSummaryModal');
        });
    });

    document.getElementById('closeProfileSummaryModal')?.addEventListener('click', () => closeModal('profileSummaryModal'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('profileSummaryModal');
    });

    document.getElementById('profileSummaryEditBtn')?.addEventListener('click', showProfilePopupEdit);
    document.getElementById('profileEditCancelBtn')?.addEventListener('click', showProfilePopupView);
    document.getElementById('profileEditForm')?.addEventListener('submit', saveProfilePopupForm);

    document.getElementById('profileEditPhotoBtn')?.addEventListener('click', () => {
        document.getElementById('profileEditAvatarInput').click();
    });
    document.getElementById('profileEditAvatarInput')?.addEventListener('change', onProfilePopupAvatarSelected);
    document.getElementById('profileEditRemovePhotoBtn')?.addEventListener('click', removeProfilePopupPhoto);
}

function renderProfilePopupAvatar(elementId, photoUrl, user) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (photoUrl) {
        el.innerHTML = `<img src="${photoUrl}" alt="">`;
    } else {
        el.textContent = userInitials(user);
    }
}

// Switches the popup back to the read-only summary — the default view on
// open, and where Cancel/a successful save return to.
// .modal-footer sets `display: flex` unconditionally, which as an author
// rule beats the UA stylesheet's `[hidden]{display:none}` — so hiding a
// footer needs an explicit inline display, not the `hidden` attribute.
function setFooterVisible(elementId, visible) {
    document.getElementById(elementId).style.display = visible ? '' : 'none';
}

// Some browsers scroll a form's password field into view on their own
// (autofill/"save password" heuristics) as soon as it's unhidden, which cut
// the avatar off behind the modal header. Force the body back to the top
// whenever the popup's content is swapped.
function resetProfilePopupScroll() {
    const body = document.querySelector('#profileSummaryModal .modal-body');
    if (body) body.scrollTop = 0;
}

function showProfilePopupView() {
    document.getElementById('profileSummaryTitle').textContent = 'My Profile';
    document.getElementById('profileSummaryView').hidden = false;
    document.getElementById('profileEditForm').hidden = true;
    setFooterVisible('profileViewFooter', true);
    setFooterVisible('profileEditFooter', false);

    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user) return;

    const nameEl = document.getElementById('profileSummaryName');
    const roleEl = document.getElementById('profileSummaryRole');
    const emailEl = document.getElementById('profileSummaryEmail');

    if (nameEl) nameEl.textContent = user.name || '';
    if (roleEl) {
        const roleLabel = formatProfileRole(user.role);
        roleEl.textContent = user.school_attended ? `${roleLabel} · ${user.school_attended}` : roleLabel;
    }
    if (emailEl) emailEl.textContent = user.email || '';

    renderProfilePopupAvatar('profileSummaryAvatar', displayAvatarUrl(user), user);
    resetProfilePopupScroll();
}

// Swaps the popup's appearance into the editable form, pre-filled from the
// session's current values.
function showProfilePopupEdit() {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user) return;

    document.getElementById('profileSummaryTitle').textContent = 'Edit Profile';
    document.getElementById('profileSummaryView').hidden = true;
    document.getElementById('profileEditForm').hidden = false;
    setFooterVisible('profileViewFooter', false);
    setFooterVisible('profileEditFooter', true);

    document.getElementById('profileEditFirstName').value = user.first_name || '';
    document.getElementById('profileEditLastName').value = user.last_name || '';
    document.getElementById('profileEditEmail').value = user.email || '';
    document.getElementById('profileEditPassword').value = '';
    document.getElementById('profileEditPasswordConfirm').value = '';

    // Students (Secondary and Elementary East/West/South alike) don't get
    // self-service password changes here — hide the section entirely rather
    // than just disabling it, since saveProfilePopupForm() below only skips
    // sending a password when the fields are left blank anyway.
    const passwordSection = document.getElementById('profileEditPasswordSection');
    if (passwordSection) passwordSection.hidden = String(user.role || '').toLowerCase() === 'student';

    const photoUrl = userAvatarUrl(user); // real uploaded photo only — decides Remove Photo's visibility
    renderProfilePopupAvatar('profileEditAvatar', displayAvatarUrl(user), user);
    const removeBtn = document.getElementById('profileEditRemovePhotoBtn');
    if (removeBtn) removeBtn.hidden = !photoUrl;

    resetProfilePopupScroll();
    // Some browsers nudge the scroll position on the next frame once the
    // password fields are actually visible/laid out — catch that too.
    requestAnimationFrame(resetProfilePopupScroll);
}

function onProfilePopupAvatarSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showAlert('Please choose a JPG, PNG, GIF, or WEBP image.', 'error');
        e.target.value = '';
        return;
    }
    if (file.size > 3 * 1024 * 1024) {
        showAlert('Image is too large. Maximum size is 3 MB.', 'error');
        e.target.value = '';
        return;
    }

    // Instant local preview while the upload is in flight.
    renderProfilePopupAvatar('profileEditAvatar', URL.createObjectURL(file), null);

    const user = getCurrentUser();
    const formData = new FormData();
    formData.append('id', user.id);
    formData.append('image', file);

    fetch('../../api/profile', { method: 'POST', body: formData })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success || !result.data) {
                throw new Error(result.message || 'Failed to upload photo');
            }
            showAlert('Profile photo updated!', 'success');
            syncStoredUser({ profile_image: result.data.profileImage || null });

            const updatedUser = getCurrentUser();
            const photoUrl = userAvatarUrl(updatedUser);
            renderProfilePopupAvatar('profileEditAvatar', photoUrl, updatedUser);
            const removeBtn = document.getElementById('profileEditRemovePhotoBtn');
            if (removeBtn) removeBtn.hidden = !photoUrl;
        })
        .catch(error => {
            showAlert('Error: ' + error.message, 'error');
            const user = getCurrentUser();
            renderProfilePopupAvatar('profileEditAvatar', displayAvatarUrl(user), user);
        })
        .finally(() => { e.target.value = ''; });
}

function removeProfilePopupPhoto() {
    const user = getCurrentUser();
    if (!user) return;

    const formData = new FormData();
    formData.append('id', user.id);
    formData.append('remove_image', '1');

    fetch('../../api/profile', { method: 'POST', body: formData })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to remove photo');
            showAlert('Profile photo removed.', 'success');
            syncStoredUser({ profile_image: null });

            renderProfilePopupAvatar('profileEditAvatar', displayAvatarUrl(getCurrentUser()), getCurrentUser());
            const removeBtn = document.getElementById('profileEditRemovePhotoBtn');
            if (removeBtn) removeBtn.hidden = true;
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'));
}

function saveProfilePopupForm(e) {
    e.preventDefault();

    const user = getCurrentUser();
    if (!user) return;

    const firstName = document.getElementById('profileEditFirstName').value.trim();
    const lastName = document.getElementById('profileEditLastName').value.trim();
    const password = document.getElementById('profileEditPassword').value.trim();
    const passwordConfirm = document.getElementById('profileEditPasswordConfirm').value.trim();

    if (!firstName || !lastName) {
        showAlert('First name and last name are required', 'error');
        return;
    }

    if (password || passwordConfirm) {
        if (password !== passwordConfirm) {
            showAlert('Passwords do not match', 'error');
            return;
        }
        if (password.length < 6) {
            showAlert('Password must be at least 6 characters', 'error');
            return;
        }
    }

    const formData = new FormData();
    formData.append('id', user.id);
    formData.append('first_name', firstName);
    formData.append('last_name', lastName);
    if (password) {
        formData.append('password', password);
        formData.append('password_confirm', passwordConfirm);
    }

    fetch('../../api/profile', { method: 'POST', body: formData })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success || !result.data) {
                throw new Error(result.message || 'Failed to save changes');
            }

            showAlert('Profile updated successfully!', 'success');
            syncStoredUser({
                first_name: result.data.firstName,
                last_name: result.data.lastName,
                name: result.data.name
            });
            showProfilePopupView();
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'));
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarActive);
    document.addEventListener('DOMContentLoaded', initSidebarGroups);
    document.addEventListener('DOMContentLoaded', initSidebarToggle);
    document.addEventListener('DOMContentLoaded', initSidebarProfilePopup);
} else {
    initSidebarActive();
    initSidebarGroups();
    initSidebarToggle();
    initSidebarProfilePopup();
}

