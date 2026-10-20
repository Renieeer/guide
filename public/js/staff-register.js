// Teacher self-registration (staff-register.php) — gated by a coordinator-
// issued, email-bound access code (see api/teacher-signup-request),
// followed by the usual email OTP (js/otp-verify.js). Kept separate from
// js/register.js (student registration) since the form/endpoint shapes
// differ: no school picker here (the code carries the school), and an
// access code field instead.
const API_BASE = (function () {
    const src = document.currentScript && document.currentScript.src;
    if (src) {
        return src.replace(/\/js\/[^/]+\.js(?:[?#].*)?$/, '');
    }
    return window.location.origin;
})();

function validatePassword(password) {
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    return {
        length: password.length >= minLength,
        uppercase: hasUppercase,
        lowercase: hasLowercase,
        number: hasNumber,
        special: hasSpecialChar,
        valid: password.length >= minLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar
    };
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

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

passwordModal?.addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.remove('show');
    }
});

document.getElementById('password')?.addEventListener('input', function(e) {
    showPasswordRequirements(this.value);
});

document.getElementById('registerForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    document.getElementById('registerError').textContent = '';
    document.getElementById('registerSuccess').textContent = '';
    clearErrorMessages();

    const accessCode = document.getElementById('accessCode').value.trim();
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    let hasError = false;

    if (!accessCode) {
        showFieldError('accessCode', 'Access code is required');
        hasError = true;
    }

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

    if (hasError) {
        showError('Please fix the errors above and try again');
        return;
    }

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying code...';

    try {
        const response = await fetch(`${API_BASE}/api/teacher-signup-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: accessCode,
                firstName: firstName,
                lastName: lastName,
                email: email,
                password: password
            })
        });

        const data = await response.json();

        if (data.success && data.needsVerification) {
            showSuccess(data.message || 'Please check your email for a verification code.');
            if (typeof showOtpModal === 'function') {
                showOtpModal(data.email || email, {
                    onVerified: () => {
                        window.location.href = 'staff-login';
                    }
                });
            }
        } else {
            const errorMsg = data.message || 'An error occurred during registration';
            if (errorMsg.toLowerCase().includes('access code')) {
                showFieldError('accessCode', errorMsg);
            } else {
                showError(errorMsg);
            }
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
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
