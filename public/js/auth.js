
// This file is loaded from both root-level pages (login.php, at depth 0)
// and pages/<role>/*.php (depth 2), so a relative "../../api/" path can't
// work for both. Instead, derive the app's base URL from this script's own
// <script src> — correct whether the app is served from a subfolder
// (http://localhost/guidancemanagement/) or its own vhost root
// (http://guidancemanagement.test/), unlike a hardcoded "http://localhost/guidancemanagement".
const API_BASE = (function () {
    const src = document.currentScript && document.currentScript.src;
    if (src) {
        return src.replace(/\/js\/[^/]+\.js(?:[?#].*)?$/, '');
    }
    return window.location.origin;
})();

const dashboardRoutes = {
    student: 'student/dashboard',
    teacher: 'teacher/dashboard',
    coordinator: 'coordinator/dashboard',
    counselor: 'counselor/dashboard',
    'counselor-and-coordinator': 'other-school/dashboard',
    admin: 'sdo/dashboard',
    sdo: 'sdo/dashboard'
};



document.getElementById('loginForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // Validate
    if (!email || !password) {
        showError('Please fill all fields');
        return;
    }

    // Clear all previous user data before logging in
    clearAllUserData();

    // Disable submit button to prevent multiple submissions
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
        // Try database login first
        const response = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const data = await response.json();

        if (data.success) {
            // Clear any previous user data
            clearAllUserData();
            
            // Store session with new user data
            const userData = {
                email: data.user.email,
                role: data.user.role || data.user.user_type,
                name: data.user.name || `${data.user.firstName} ${data.user.lastName}`,
                id: data.user.id,
                first_name: data.user.firstName,
                last_name: data.user.lastName,
                user_type: data.user.role || data.user.user_type,
                school_attended: data.user.school || 'Unknown',
                // Comma-separated grade numbers this counselor/coordinator is
                // scoped to (e.g. "7", "11,12"). Empty means no restriction.
                grade_scope: data.user.grade || '',
                // Root-relative path (e.g. "api/avatar?id=5&v=x.jpg") or
                // null — the photo itself lives in the database, this just
                // points at it. See userAvatarUrl() in js/utils.js.
                profile_image: data.user.profileImage || null
            };

            // Only teacher accounts sign in on staff-login.php — everyone
            // else, including coordinator/counselor/combined accounts,
            // signs in on the regular login.php.
            const STAFF_LOGIN_ROLES = ['teacher'];
            const portalType = document.body.getAttribute('data-portal');
            if (portalType === 'staff' && !STAFF_LOGIN_ROLES.includes(userData.role)) {
                showError('This is the teacher login. Please use the regular Login page for your account.');
                return;
            }
            if (portalType !== 'staff' && STAFF_LOGIN_ROLES.includes(userData.role)) {
                showError('Teacher accounts should use the Staff Login page.');
                return;
            }

            // Store in sessionStorage for current session
            sessionStorage.setItem('user', JSON.stringify(userData));
            // Optional: Store in localStorage for persistence across tabs
            localStorage.setItem('currentUser', JSON.stringify(userData));

            // Redirect to dashboard based on role
            const targetRoute = dashboardRoutes[userData.role];
            if (!targetRoute) {
                showError('Your account role has no dashboard route configured.');
                return;
            }

            window.location.href = targetRoute;
        } else if (data.needsVerification) {
            showError(data.message || 'Please verify your email before logging in.');
            if (typeof showOtpModal === 'function') {
                showOtpModal(data.email || email, {
                    onVerified: () => {
                        // Re-run this same submit handler now that the
                        // account is verified, instead of making the user
                        // re-enter their credentials.
                        document.getElementById('loginForm').requestSubmit();
                    }
                });
            }
        } else {
            showError(data.message || 'Invalid email or password');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});;

function showError(message) {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorDiv.classList.remove('show');
        }, 5000);
    }
}

// Check if user is logged in
function checkAuth() {
    const user = sessionStorage.getItem('userInfo') || sessionStorage.getItem('user');
    if (!user) {
        window.location.href = '../../';
    }
    return JSON.parse(user);
}

// Clear all user data from both sessionStorage and localStorage
function clearAllUserData() {
    // Remove from sessionStorage
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('userInfo');
    sessionStorage.removeItem('studentId');
    sessionStorage.removeItem('userName');
    
    // Remove from localStorage
    localStorage.removeItem('currentUser');
    localStorage.removeItem('teacherSchool');
    localStorage.removeItem('referrals');
    localStorage.removeItem('appointments');
    localStorage.removeItem('appointmentHistory');
    
    // Clear any form data
    sessionStorage.removeItem('formData');
    localStorage.removeItem('formData');
}

// Logout function
function logout() {
    clearAllUserData();
    // Call logout.php if you want server-side logout
    try {
        fetch(`${API_BASE}/api/logout`, {
            method: 'POST'
        }).catch(() => {
            // Ignore errors, just proceed to logout
        });
    } catch (e) {
        // Ignore
    }
    window.location.href = '../../';
}

// Toggle password visibility
document.getElementById('togglePassword')?.addEventListener('click', function(e) {
    e.preventDefault();
    const passwordInput = document.getElementById('password');
    const icon = this.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
    }
});

// Get current user
function getCurrentUser() {
    const user = sessionStorage.getItem('userInfo') || sessionStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

