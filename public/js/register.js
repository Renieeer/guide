// This file is loaded from both root-level pages (register.php, at depth 0)
// and pages/<role>/*.php (depth 2), so a relative "../../api/" path can't
// work for both. Derive the app's base URL from this script's own
// <script src> instead — correct whether the app is served from a
// subfolder (http://localhost/guidancemanagement/) or its own vhost root
// (http://guidancemanagement.test/).
const API_BASE = (function () {
    const src = document.currentScript && document.currentScript.src;
    if (src) {
        return src.replace(/\/js\/[^/]+\.js(?:[?#].*)?$/, '');
    }
    return window.location.origin;
})();

// Password validation and strength checker
function validatePassword(password) {
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    const requirements = {
        length: password.length >= minLength,
        uppercase: hasUppercase,
        lowercase: hasLowercase,
        number: hasNumber,
        special: hasSpecialChar,
        valid: password.length >= minLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar
    };
    
    return requirements;
}

// Validate email format
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

async function loadSchoolOptions() {
    const schoolSelect = document.getElementById('school');
    if (!schoolSelect) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/school-config?action=list`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Unable to load schools');
        }

        const schools = Array.isArray(data.schools) ? data.schools : [];
        schoolSelect.innerHTML = '<option value="">Choose your school...</option>';

        schools.forEach((school) => {
            const option = document.createElement('option');
            option.value = school.school_name || school.schoolName || school.label || '';
            option.textContent = school.school_name || school.schoolName || school.label || option.value;
            schoolSelect.appendChild(option);
        });

        if (!schools.length) {
            schoolSelect.innerHTML = '<option value="">No schools available</option>';
            schoolSelect.disabled = true;
            showError('No schools are available yet. Please contact the SDO.');
        } else {
            schoolSelect.disabled = false;
        }
    } catch (error) {
        schoolSelect.innerHTML = '<option value="">Choose your school...</option>';
        schoolSelect.disabled = false;
        console.error('Failed to load school list:', error);
    }
}

// Show password requirements
function showPasswordRequirements(password) {
    const requirements = validatePassword(password);
    const items = document.querySelectorAll('.requirement-item');
    
    items.forEach((item, index) => {
        const met = index === 0 ? requirements.length : 
                    index === 1 ? requirements.uppercase :
                    index === 2 ? requirements.lowercase :
                    index === 3 ? requirements.number :
                    index === 4 ? requirements.special : false;
        
        if (met) {
            item.classList.add('met');
            item.querySelector('.requirement-icon').style.color = '#10b981';
        } else {
            item.classList.remove('met');
            item.querySelector('.requirement-icon').style.color = '#ef4444';
        }
    });
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

document.getElementById('toggleConfirmPassword')?.addEventListener('click', function(e) {
    e.preventDefault();
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const icon = this.querySelector('i');
    
    if (confirmPasswordInput.type === 'password') {
        confirmPasswordInput.type = 'text';
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
    } else {
        confirmPasswordInput.type = 'password';
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
    }
});

// Password requirements modal
const passwordModal = document.getElementById('passwordModal');
const passwordHelpBtn = document.getElementById('passwordHelpBtn');
const closePasswordModal = document.getElementById('closePasswordModal');

passwordHelpBtn?.addEventListener('click', function(e) {
    e.preventDefault();
    passwordModal.classList.add('show');
});

closePasswordModal?.addEventListener('click', function(e) {
    e.preventDefault();
    passwordModal.classList.remove('show');
});

// Close modal when clicking outside
passwordModal?.addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.remove('show');
    }
});

// Real-time password validation feedback
document.getElementById('password')?.addEventListener('input', function(e) {
    showPasswordRequirements(this.value);
});

loadSchoolOptions();

// Handle registration form submission
document.getElementById('registerForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Clear previous messages
    document.getElementById('registerError').textContent = '';
    document.getElementById('registerSuccess').textContent = '';
    clearErrorMessages();

    // Get form data
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const school = document.getElementById('school').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const role = document.getElementById('role').value;

    // Validate all fields
    let hasError = false;

    if (!firstName) {
        showFieldError('firstName', 'First name is required');
        hasError = true;
    }

    if (!lastName) {
        showFieldError('lastName', 'Last name is required');
        hasError = true;
    }

    if (!email) {
        showFieldError('email', 'Email is required');
        hasError = true;
    } else if (!validateEmail(email)) {
        showFieldError('email', 'Please enter a valid email address');
        hasError = true;
    }

    if (!school) {
        showFieldError('school', 'School attended is required');
        hasError = true;
    }

    if (!password) {
        showFieldError('password', 'Password is required');
        hasError = true;
    } else {
        const requirements = validatePassword(password);
        if (!requirements.valid) {
            let missing = [];
            if (!requirements.length) missing.push('at least 8 characters');
            if (!requirements.uppercase) missing.push('an uppercase letter');
            if (!requirements.lowercase) missing.push('a lowercase letter');
            if (!requirements.number) missing.push('a number');
            if (!requirements.special) missing.push('a special character (!@#$%^&*)');
            
            showFieldError('password', 'Password needs: ' + missing.join(', '));
            hasError = true;
        }
    }

    if (password !== confirmPassword) {
        showFieldError('confirmPassword', 'Passwords do not match');
        hasError = true;
    }

    if (!role) {
        showFieldError('role', 'Please select a role');
        hasError = true;
    }

    if (hasError) {
        showError('Please fix the errors above and try again');
        return;
    }

    // Disable submit button
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    try {
        // Send registration data to backend
        const response = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                firstName: firstName,
                lastName: lastName,
                email: email,
                school: school,
                password: password,
                role: role
            })
        });

        const data = await response.json();

        if (data.success) {
            if (data.needsVerification) {
                showSuccess(data.message || 'Account created! Please verify your email.');
                if (typeof showOtpModal === 'function') {
                    showOtpModal(data.email || email, {
                        onVerified: () => {
                            window.location.href = 'login';
                        }
                    });
                }
            } else {
                showSuccess('Account created successfully! Redirecting to login...');
                setTimeout(() => {
                    window.location.href = './';
                }, 2000);
            }
        } else {
            // Show detailed error message
            let errorMsg = data.message || 'An error occurred during registration';
            
            // Handle specific error cases
            if (errorMsg.includes('already registered')) {
                showFieldError('email', 'This email is already registered. Please login instead.');
            } else if (errorMsg.includes('security requirements')) {
                showFieldError('password', 'Password does not meet security requirements');
            } else {
                showError(errorMsg);
            }
            
            console.error('Registration error details:', data);
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Network error. Please check your connection and try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    const wrapper = field.parentElement;
    const errorText = wrapper.querySelector('.error-text') || wrapper.parentElement.querySelector('.error-text');
    
    if (errorText) {
        errorText.textContent = message;
        errorText.style.display = 'block';
    }
    
    if (field.classList) {
        field.classList.add('error');
    }
}

function clearErrorMessages() {
    const errorTexts = document.querySelectorAll('.error-text');
    errorTexts.forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
    const inputs = document.querySelectorAll('.error');
    inputs.forEach(el => {
        el.classList.remove('error');
    });
}

function showError(message) {
    const errorDiv = document.getElementById('registerError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        // Scroll to error
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Auto-hide error after 5 seconds
        setTimeout(() => {
            errorDiv.classList.remove('show');
        }, 5000);
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('registerSuccess');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.classList.add('show');
    }
}

