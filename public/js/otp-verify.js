// Shared "enter the 6-digit code we emailed you" modal, used by both the
// registration flow (register.js) and the login flow (auth.js) — a login
// attempt on an unverified account gets the same modal as registration
// does, just with a different next step after success. Reuses the existing
// .password-modal-overlay/.password-modal-content styles from style.css
// rather than adding new CSS, since it's the same generic modal shell.
const OTP_API_BASE = (function () {
    const src = document.currentScript && document.currentScript.src;
    if (src) {
        return src.replace(/\/js\/[^/]+\.js(?:[?#].*)?$/, '');
    }
    return window.location.origin;
})();

let otpOverlay = null;
let otpResendTimer = null;

function buildOtpModal() {
    if (otpOverlay) {
        return otpOverlay;
    }

    otpOverlay = document.createElement('div');
    otpOverlay.className = 'password-modal-overlay';
    otpOverlay.id = 'otpModalOverlay';
    otpOverlay.innerHTML = `
        <div class="password-modal-content">
            <div class="modal-header">
                <h3>Verify Your Email</h3>
                <button type="button" class="modal-close" id="otpModalClose"><i class="bi bi-x"></i></button>
            </div>
            <div class="modal-body">
                <p id="otpModalIntro" style="margin-top:0;"></p>
                <div class="form-group">
                    <label>6-digit code</label>
                    <div class="otp-digit-group" id="otpDigitGroup">
                        <input type="text" class="otp-digit-input" inputmode="numeric" pattern="[0-9]" maxlength="1" autocomplete="one-time-code" data-otp-index="0">
                        <input type="text" class="otp-digit-input" inputmode="numeric" pattern="[0-9]" maxlength="1" data-otp-index="1">
                        <input type="text" class="otp-digit-input" inputmode="numeric" pattern="[0-9]" maxlength="1" data-otp-index="2">
                        <input type="text" class="otp-digit-input" inputmode="numeric" pattern="[0-9]" maxlength="1" data-otp-index="3">
                        <input type="text" class="otp-digit-input" inputmode="numeric" pattern="[0-9]" maxlength="1" data-otp-index="4">
                        <input type="text" class="otp-digit-input" inputmode="numeric" pattern="[0-9]" maxlength="1" data-otp-index="5">
                    </div>
                </div>
                <div id="otpModalError" class="error-alert"></div>
                <div id="otpModalSuccess" class="success-alert"></div>
                <button type="button" class="btn btn-auth-primary btn-block" id="otpVerifyBtn">Verify</button>
                <p class="text-muted" style="text-align:center; margin-top: 16px; font-size: 13px;">
                    Didn't get a code? <a href="#" class="auth-link" id="otpResendLink">Resend code</a>
                </p>
            </div>
        </div>
    `;
    document.body.appendChild(otpOverlay);

    otpOverlay.querySelector('#otpModalClose').addEventListener('click', hideOtpModal);
    otpOverlay.addEventListener('click', function (e) {
        if (e.target === otpOverlay) {
            hideOtpModal();
        }
    });

    setupOtpDigitBoxes();

    return otpOverlay;
}

// Wires the 6 single-digit boxes to behave like one field: typing a digit
// advances to the next box, backspace on an empty box goes back to the
// previous one, and pasting a 6-digit code (e.g. from a phone keyboard's
// "from SMS/clipboard" suggestion) spreads it across all six at once.
function setupOtpDigitBoxes() {
    const boxes = Array.from(document.querySelectorAll('.otp-digit-input'));

    boxes.forEach((box, index) => {
        box.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 1);
            if (this.value && index < boxes.length - 1) {
                boxes[index + 1].focus();
            }
        });

        box.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && !this.value && index > 0) {
                boxes[index - 1].focus();
            }
        });

        box.addEventListener('paste', function (e) {
            const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            if (!pasted) {
                return;
            }
            e.preventDefault();
            const digits = pasted.slice(0, boxes.length).split('');
            digits.forEach((digit, i) => {
                if (boxes[i]) {
                    boxes[i].value = digit;
                }
            });
            const nextEmpty = boxes[digits.length] || boxes[boxes.length - 1];
            nextEmpty.focus();
        });
    });
}

function getOtpDigitsValue() {
    return Array.from(document.querySelectorAll('.otp-digit-input')).map(box => box.value).join('');
}

function clearOtpDigits() {
    const boxes = document.querySelectorAll('.otp-digit-input');
    boxes.forEach(box => { box.value = ''; });
    if (boxes[0]) {
        boxes[0].focus();
    }
}

function clearOtpMessages() {
    const err = document.getElementById('otpModalError');
    const ok = document.getElementById('otpModalSuccess');
    if (err) { err.textContent = ''; err.classList.remove('show'); }
    if (ok) { ok.textContent = ''; ok.classList.remove('show'); }
}

function showOtpError(message) {
    const el = document.getElementById('otpModalError');
    if (el) {
        el.textContent = message;
        el.classList.add('show');
    }
}

function showOtpSuccess(message) {
    const el = document.getElementById('otpModalSuccess');
    if (el) {
        el.textContent = message;
        el.classList.add('show');
    }
}

function startOtpResendCooldown(seconds) {
    const link = document.getElementById('otpResendLink');
    if (!link) {
        return;
    }
    if (otpResendTimer) {
        clearInterval(otpResendTimer);
    }
    let remaining = seconds;
    link.style.pointerEvents = 'none';
    link.style.opacity = '0.5';
    link.textContent = `Resend code (${remaining}s)`;
    otpResendTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(otpResendTimer);
            link.textContent = 'Resend code';
            link.style.pointerEvents = '';
            link.style.opacity = '';
        } else {
            link.textContent = `Resend code (${remaining}s)`;
        }
    }, 1000);
}

function showOtpModal(email, options) {
    options = options || {};
    const modal = buildOtpModal();
    clearOtpMessages();
    clearOtpDigits();
    document.getElementById('otpModalIntro').textContent =
        `We've sent a 6-digit verification code to ${email}. Enter it below to verify your account.`;
    modal.classList.add('show');

    // Rebuild the verify/resend buttons via cloneNode so old listeners from
    // a previous showOtpModal() call (a different email) don't stack up.
    const verifyBtn = document.getElementById('otpVerifyBtn');
    const resendLink = document.getElementById('otpResendLink');

    const newVerifyBtn = verifyBtn.cloneNode(true);
    verifyBtn.parentNode.replaceChild(newVerifyBtn, verifyBtn);
    const newResendLink = resendLink.cloneNode(true);
    resendLink.parentNode.replaceChild(newResendLink, resendLink);
    startOtpResendCooldown(60);

    newVerifyBtn.addEventListener('click', async function () {
        clearOtpMessages();
        const code = getOtpDigitsValue();
        if (!/^\d{6}$/.test(code)) {
            showOtpError('Enter the 6-digit code from your email.');
            return;
        }

        newVerifyBtn.disabled = true;
        const originalText = newVerifyBtn.textContent;
        newVerifyBtn.textContent = 'Verifying...';

        try {
            const response = await fetch(`${OTP_API_BASE}/api/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp: code })
            });
            const data = await response.json();

            if (data.success) {
                showOtpSuccess('Email verified!');
                setTimeout(() => {
                    hideOtpModal();
                    if (typeof options.onVerified === 'function') {
                        options.onVerified();
                    }
                }, 1000);
            } else {
                showOtpError(data.message || 'Invalid or expired code.');
            }
        } catch (error) {
            showOtpError('Network error. Please try again.');
        } finally {
            newVerifyBtn.disabled = false;
            newVerifyBtn.textContent = originalText;
        }
    });

    newResendLink.addEventListener('click', async function (e) {
        e.preventDefault();
        if (newResendLink.style.pointerEvents === 'none') {
            return;
        }
        clearOtpMessages();
        try {
            const response = await fetch(`${OTP_API_BASE}/api/resend-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await response.json();
            if (data.success) {
                showOtpSuccess(data.alreadyVerified ? data.message : 'A new code has been sent.');
                if (!data.alreadyVerified) {
                    startOtpResendCooldown(60);
                }
            } else {
                showOtpError(data.message || 'Could not resend code.');
            }
        } catch (error) {
            showOtpError('Network error. Please try again.');
        }
    });
}

function hideOtpModal() {
    if (otpOverlay) {
        otpOverlay.classList.remove('show');
    }
    if (otpResendTimer) {
        clearInterval(otpResendTimer);
    }
}
