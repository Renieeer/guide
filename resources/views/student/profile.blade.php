<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Profile - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body class="profile-page">
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-student')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-person-badge"></i> Account</div>
                    <h2 class="page-hero-title">My Profile</h2>
                    <p class="page-hero-text">Update your photo and personal details.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <div class="profile-card">
                    <div class="profile-header">
                        <div class="profile-avatar-wrap">
                            <div class="profile-avatar-lg" id="profileAvatar">U</div>
                            <button type="button" class="profile-avatar-edit-btn" id="changePhotoBtn" title="Change photo">
                                <i class="bi bi-camera-fill"></i>
                            </button>
                        </div>
                        <input type="file" id="avatarInput" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
                        <button type="button" class="profile-remove-photo-btn" id="removePhotoBtn" hidden>
                            <i class="bi bi-trash3"></i> Remove photo
                        </button>
                        <div class="profile-name" id="profileName">&nbsp;</div>
                        <div class="profile-role" id="profileRoleLine">&nbsp;</div>
                    </div>

                    <form id="profileForm">
                        <div class="form-group">
                            <label for="profileFirstName">First Name *</label>
                            <input type="text" id="profileFirstName" required>
                        </div>

                        <div class="form-group">
                            <label for="profileLastName">Last Name *</label>
                            <input type="text" id="profileLastName" required>
                        </div>

                        <div class="form-group">
                            <label for="profileEmail">Email</label>
                            <input type="email" id="profileEmail" disabled>
                        </div>

                        <div class="form-actions">
                            <button type="submit" class="btn btn-success">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('js/profile.js') }}?v={{ filemtime(public_path('js/profile.js')) }}"></script>
</body>
</html>
