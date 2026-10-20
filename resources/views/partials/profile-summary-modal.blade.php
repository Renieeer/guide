<!-- My Profile popup: quick summary card opened by the sidebar avatar.
     "Edit Profile" swaps this same popup into an edit form in place — it
     never navigates to a separate page. See initSidebarProfilePopup() in
     js/sidebar-active.js. Included by every includes/sidebar-*.php. -->
<div id="profileSummaryModal" class="modal">
    <div class="modal-content" style="max-width: 420px;">
        <div class="modal-header">
            <h2 id="profileSummaryTitle">My Profile</h2>
            <button class="modal-close" id="closeProfileSummaryModal">&times;</button>
        </div>
        <div class="modal-body profile-popup-scroll" style="text-align: center;">
            <!-- View mode -->
            <div id="profileSummaryView">
                <div class="profile-avatar-lg" id="profileSummaryAvatar" style="margin: 0 auto;">U</div>
                <div class="profile-name" id="profileSummaryName">&nbsp;</div>
                <div class="profile-role" id="profileSummaryRole">&nbsp;</div>
                <div class="profile-role" id="profileSummaryEmail" style="margin-top: 8px;">&nbsp;</div>
            </div>

            <!-- Edit mode -->
            <form id="profileEditForm" hidden>
                <div class="profile-avatar-wrap" style="margin: 8px auto 0;">
                    <div class="profile-avatar-lg" id="profileEditAvatar">U</div>
                    <button type="button" class="profile-avatar-edit-btn" id="profileEditPhotoBtn" title="Change photo">
                        <i class="bi bi-camera-fill"></i>
                    </button>
                </div>
                <input type="file" id="profileEditAvatarInput" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
                <button type="button" class="profile-remove-photo-btn" id="profileEditRemovePhotoBtn" hidden>
                    <i class="bi bi-trash3"></i> Remove photo
                </button>

                <div class="form-row" style="text-align: left; margin-top: 20px; gap: 12px;">
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label for="profileEditFirstName">First Name *</label>
                        <input type="text" id="profileEditFirstName" autocomplete="given-name" required>
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label for="profileEditLastName">Last Name *</label>
                        <input type="text" id="profileEditLastName" autocomplete="family-name" required>
                    </div>
                </div>
                <div class="form-group" style="text-align: left; margin-bottom: 16px;">
                    <label for="profileEditEmail">Email</label>
                    <input type="email" id="profileEditEmail" autocomplete="email" disabled>
                </div>

                <div id="profileEditPasswordSection" style="margin-top: 4px; padding-top: 16px; border-top: 1px solid rgba(15, 42, 79, 0.08); text-align: left;">
                    <h4 style="color: #0f2a4f; font-size: 15px; font-weight: 700; margin: 0 0 4px;">Change Password</h4>
                    <p style="color: #8494a7; font-size: 12px; margin: 0 0 14px;">Leave blank to keep your current password.</p>

                    <div class="form-group" style="text-align: left; margin-bottom: 16px;">
                        <label for="profileEditPassword">New Password</label>
                        <input type="password" id="profileEditPassword" autocomplete="new-password">
                        <small>Minimum 6 characters</small>
                    </div>
                    <div class="form-group" style="text-align: left; margin-bottom: 4px;">
                        <label for="profileEditPasswordConfirm">Confirm Password</label>
                        <input type="password" id="profileEditPasswordConfirm" autocomplete="new-password">
                    </div>
                </div>
            </form>
        </div>
        <div class="modal-footer" id="profileViewFooter">
            <button type="button" class="btn btn-primary" id="profileSummaryEditBtn" style="width: 100%;">Edit Profile</button>
        </div>
        <div class="modal-footer" id="profileEditFooter" style="display: none;">
            <button type="button" class="btn btn-outline-primary" id="profileEditCancelBtn">Cancel</button>
            <button type="submit" form="profileEditForm" class="btn btn-success" id="profileEditSaveBtn">Save Changes</button>
        </div>
    </div>
</div>
