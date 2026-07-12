/**
 * auth.js — Login page logic
 * -------------------------------------------------
 * Handles form validation, login API calls, error
 * display, and token storage. Also handles the
 * "remember me" checkbox and redirect after login.
 * -------------------------------------------------
 */

// grab the DOM elements we need
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('loginEmail');
const passwordInput = document.getElementById('loginPassword');
const roleSelect = document.getElementById('loginRole');
const signInBtn = document.getElementById('signInBtn');
const authError = document.getElementById('authError');
const errorMessage = document.getElementById('errorMessage');
const rememberMe = document.getElementById('rememberMe');

// API base URL — works for both dev and production
const API_BASE = window.location.origin + '/api';


/**
 * On page load, check if we already have a valid token.
 * If so, skip the login page and go straight to the dashboard.
 */
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('transitops_token');
    if (token) {
        // verify the token is still valid before redirecting
        verifyExistingToken(token);
    }

    // Do not pre-fill email to keep the input empty on page load.
});


/**
 * Verify an existing token by calling the /me endpoint.
 * If it's still valid, redirect to dashboard. If not, clear it.
 */
async function verifyExistingToken(token) {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            // token is still good — redirect
            window.location.href = '/dashboard';
        } else {
            // token expired or invalid — clean up
            localStorage.removeItem('transitops_token');
            localStorage.removeItem('transitops_user');
        }
    } catch (err) {
        // network error — don't redirect, let them log in again
        console.warn('Token verification failed:', err.message);
    }
}


/**
 * Handle the login form submission.
 * Validates inputs, calls the API, and handles the response.
 */
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // clear any previous error
    hideError();

    // grab current values
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const role = roleSelect.value;

    // --- client-side validation ---
    if (!email) {
        showError('Please enter your email address.');
        emailInput.focus();
        return;
    }

    // basic email format check
    if (!isValidEmail(email)) {
        showError('Please enter a valid email address (e.g. raven@transitops.in).');
        emailInput.classList.add('error');
        emailInput.focus();
        return;
    }

    if (!password) {
        showError('Please enter your password.');
        passwordInput.focus();
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        passwordInput.focus();
        return;
    }

    if (!role) {
        showError('Please select a role.');
        roleSelect.focus();
        return;
    }

    // --- send the login request ---
    setLoading(true);

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            // show the server's error message
            showError(data.message || 'Login failed. Please try again.');

            // if there's an attempts remaining count, add it to the message
            if (data.attemptsRemaining !== undefined && data.attemptsRemaining > 0) {
                showError(`${data.message}`);
            }

            setLoading(false);
            return;
        }

        // login succeeded — store the token and user data
        localStorage.setItem('transitops_token', data.token);
        localStorage.setItem('transitops_user', JSON.stringify(data.user));

        // save email for "remember me" feature
        if (rememberMe.checked) {
            localStorage.setItem('transitops_email', email);
        } else {
            localStorage.removeItem('transitops_email');
        }

        // brief delay so the user sees the success state
        signInBtn.textContent = '✓ Success';
        signInBtn.style.backgroundColor = '#2ecc71';

        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 500);

    } catch (err) {
        // network error — the server might be down
        console.error('Login request failed:', err);
        showError('Could not connect to the server. Is the backend running?');
        setLoading(false);
    }
});


/**
 * Remove error styling when user starts typing again
 */
emailInput.addEventListener('input', () => {
    emailInput.classList.remove('error');
    hideError();
});

passwordInput.addEventListener('input', () => {
    hideError();
});


// ---- Helper Functions ----

/**
 * Display an error message in the error container.
 */
function showError(message) {
    errorMessage.textContent = message;
    authError.classList.add('visible');
}

/**
 * Hide the error message container.
 */
function hideError() {
    authError.classList.remove('visible');
}

/**
 * Toggle the loading state of the sign-in button.
 */
function setLoading(isLoading) {
    if (isLoading) {
        signInBtn.disabled = true;
        signInBtn.classList.add('loading');
        signInBtn.innerHTML = '<span class="spinner"></span> Signing in...';
    } else {
        signInBtn.disabled = false;
        signInBtn.classList.remove('loading');
        signInBtn.textContent = 'Sign In';
    }
}

/**
 * Basic email validation using a regex.
 * Not bulletproof, but catches obvious mistakes.
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---- Forgot Password Modal Listeners ----
const forgotLink = document.getElementById('forgotPasswordLink');
const forgotModal = document.getElementById('forgotPasswordModal');
const btnForgotClose = document.getElementById('btnForgotModalClose');
const btnForgotCancel = document.getElementById('btnForgotCancel');
const btnForgotDone = document.getElementById('btnForgotDone');
const forgotForm = document.getElementById('forgotPasswordForm');
const forgotSuccess = document.getElementById('forgotSuccessMessage');
const recoveryEmail = document.getElementById('recoveryEmail');
const btnForgotSubmit = document.getElementById('btnForgotSubmit');

if (forgotLink && forgotModal) {
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        forgotModal.classList.add('open');
        forgotForm.style.display = 'block';
        forgotSuccess.style.display = 'none';
        if (emailInput && emailInput.value) {
            recoveryEmail.value = emailInput.value;
        } else {
            recoveryEmail.value = '';
        }
        recoveryEmail.focus();
    });
}

const closeForgotModal = () => {
    if (forgotModal) {
        forgotModal.classList.remove('open');
    }
};

if (btnForgotClose) btnForgotClose.addEventListener('click', closeForgotModal);
if (btnForgotCancel) btnForgotCancel.addEventListener('click', closeForgotModal);
if (btnForgotDone) btnForgotDone.addEventListener('click', closeForgotModal);

if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = recoveryEmail.value.trim();
        
        if (!email || !isValidEmail(email)) {
            alert('Please enter a valid email address.');
            recoveryEmail.focus();
            return;
        }

        // Show loading state
        btnForgotSubmit.disabled = true;
        btnForgotSubmit.textContent = 'Sending...';

        // Mock network delay (500ms) to make it feel responsive and alive
        setTimeout(() => {
            btnForgotSubmit.disabled = false;
            btnForgotSubmit.textContent = 'Send Link';
            
            // Swap form to success state
            forgotForm.style.display = 'none';
            forgotSuccess.style.display = 'block';
            
            const successText = document.getElementById('forgotSuccessText');
            if (successText) {
                successText.innerHTML = `We've sent a password reset link to <strong>${email}</strong>.<br><br><span style="font-size: 0.85rem; color: var(--text-muted);">Demo notice: For this hackathon environment, you can sign in to any default account with the password <strong>password123</strong>.</span>`;
            }
        }, 600);
    });
}

