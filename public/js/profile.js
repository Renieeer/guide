// "My Profile" page script — shared by every role's pages/<role>/profile
// (student, teacher, counselor, coordinator, other-school, sdo). Loaded
// after auth.js and utils.js, the same way dashboard.js etc. are.

function initProfilePage() {
    initPage();
    loadProfile();

    document.getElementById('changePhotoBtn')?.addEventListener('click', () => {
        document.getElementById('avatarInput').click();
    });
    document.getElementById('avatarInput')?.addEventListener('change', onAvatarSelected);
    document.getElementById('removePhotoBtn')?.addEventListener('click', removePhoto);
    document.getElementById('profileForm')?.addEventListener('submit', saveProfileInfo);
}

function getProfileId() {
    const user = getCurrentUser();
    return user ? user.id : null;
}

// formatProfileRole() lives in js/utils.js — also used by the sidebar's "My
// Profile" popup (js/sidebar-active.js).

// url is the account's own REAL uploaded photo (or null) — its truthiness
// still decides whether "Remove Photo" shows. When there's no real photo,
// this falls back to the role's default seal (displayAvatarUrl/
// defaultAvatarUrl in js/utils.js) instead of jumping straight to initials.
function renderAvatarPreview(url) {
    const el = document.getElementById('profileAvatar');
    const removeBtn = document.getElementById('removePhotoBtn');
    if (!el) return;

    if (url) {
        el.innerHTML = `<img src="${url}" alt="">`;
        if (removeBtn) removeBtn.style.display = '';
        return;
    }

    if (removeBtn) removeBtn.style.display = 'none';
    const fallbackUrl = defaultAvatarUrl(getCurrentUser());
    if (fallbackUrl) {
        el.innerHTML = `<img src="${fallbackUrl}" alt="">`;
    } else {
        el.textContent = userInitials(getCurrentUser());
    }
}

function loadProfile() {
    const id = getProfileId();
    if (!id) return;

    fetch(`../../api/profile?id=${encodeURIComponent(id)}`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success || !result.data) {
                throw new Error(result.message || 'Failed to load profile');
            }

            const data = result.data;
            document.getElementById('profileFirstName').value = data.firstName || '';
            document.getElementById('profileLastName').value = data.lastName || '';
            document.getElementById('profileEmail').value = data.email || '';

            const nameEl = document.getElementById('profileName');
            const roleEl = document.getElementById('profileRoleLine');
            if (nameEl) nameEl.textContent = data.name || '';
            if (roleEl) roleEl.textContent = data.school ? `${formatProfileRole(data.role)} · ${data.school}` : formatProfileRole(data.role);

            renderAvatarPreview(data.profileImage ? `../../${data.profileImage}` : null);
            syncStoredUser({
                first_name: data.firstName,
                last_name: data.lastName,
                name: data.name,
                profile_image: data.profileImage || null
            });
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'));
}

// syncStoredUser() lives in js/utils.js — also used by the sidebar's "My
// Profile" popup edit form (js/sidebar-active.js).

function onAvatarSelected(e) {
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
    renderAvatarPreview(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append('id', getProfileId());
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
            renderAvatarPreview(result.data.profileImage ? `../../${result.data.profileImage}` : null);
            syncStoredUser({ profile_image: result.data.profileImage || null });
        })
        .catch(error => {
            showAlert('Error: ' + error.message, 'error');
            loadProfile();
        })
        .finally(() => { e.target.value = ''; });
}

function removePhoto() {
    const id = getProfileId();
    if (!id) return;

    const formData = new FormData();
    formData.append('id', id);
    formData.append('remove_image', '1');

    fetch('../../api/profile', { method: 'POST', body: formData })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(result => {
            if (!result.success) throw new Error(result.message || 'Failed to remove photo');
            showAlert('Profile photo removed.', 'success');
            renderAvatarPreview(null);
            syncStoredUser({ profile_image: null });
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'));
}

function saveProfileInfo(e) {
    e.preventDefault();

    const firstName = document.getElementById('profileFirstName').value.trim();
    const lastName = document.getElementById('profileLastName').value.trim();
    // Students don't have password fields on this page (self-service password
    // change is disabled for them) — fall back to '' rather than assuming
    // the elements exist.
    const password = (document.getElementById('profilePassword')?.value || '').trim();
    const passwordConfirm = (document.getElementById('profilePasswordConfirm')?.value || '').trim();

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
    formData.append('id', getProfileId());
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
            const passwordEl = document.getElementById('profilePassword');
            const passwordConfirmEl = document.getElementById('profilePasswordConfirm');
            if (passwordEl) passwordEl.value = '';
            if (passwordConfirmEl) passwordConfirmEl.value = '';

            const nameEl = document.getElementById('profileName');
            if (nameEl) nameEl.textContent = result.data.name || '';

            syncStoredUser({
                first_name: result.data.firstName,
                last_name: result.data.lastName,
                name: result.data.name
            });
        })
        .catch(error => showAlert('Error: ' + error.message, 'error'));
}

document.addEventListener('DOMContentLoaded', initProfilePage);
