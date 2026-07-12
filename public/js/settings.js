/**
 * public/js/settings.js
 * -------------------------------------------------
 * Front-end logic for the Settings & RBAC page.
 *
 * Responsibilities:
 *   1. Auth guard — redirect to login if no token.
 *   2. Load user info and apply RBAC sidebar gating.
 *   3. Fetch depot settings and RBAC role data from the API.
 *   4. Pre-fill the General settings form with current values.
 *   5. Handle the Save Changes form with inline validation.
 *   6. Build the RBAC permission matrix table from role data.
 *   7. Mobile hamburger sidebar toggle.
 * -------------------------------------------------
 */

// --- auth guard ---
const token    = localStorage.getItem('transitops_token');
const userData = localStorage.getItem('transitops_user');

if (!token || !userData) {
    window.location.href = '/';
}

const API_BASE = window.location.origin + '/api';


// ============================================================
// Initialisation
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadSettings();
    setupFormEvents();
    setupSidebarToggle();
    setupLogout();
});


// ============================================================
// User Info & RBAC
// ============================================================

/**
 * Reads the stored user object, fills the top-bar name and role badge,
 * then dims any sidebar links the current role can't access.
 */
function loadUserInfo() {
    try {
        const user = JSON.parse(userData);

        const nameEl = document.getElementById('userName');
        if (nameEl) {
            const parts = (user.fullName || 'User').split(' ');
            nameEl.textContent = parts.length > 1
                ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
                : parts[0];
        }

        const badgeEl = document.getElementById('roleBadge');
        if (badgeEl) {
            badgeEl.textContent = formatRoleName(user.role || '');
        }

        // dim nav links the role can't see
        if (user.permissions) {
            document.querySelectorAll('.nav-link[data-module]').forEach(link => {
                const mod = link.getAttribute('data-module');
                if (mod !== 'dashboard' && user.permissions[mod] === false) {
                    link.style.opacity       = '0.3';
                    link.style.pointerEvents = 'none';
                    link.title               = 'You do not have access to this module';
                }
            });
        }

    } catch (err) {
        console.error('Failed to parse user info, redirecting to login:', err);
        logout();
    }
}


// ============================================================
// Settings Fetch & Render
// ============================================================

/**
 * Loads the current settings and role permissions from the API,
 * then pre-fills the form and builds the RBAC table.
 */
async function loadSettings() {
    try {
        const res    = await fetch(`${API_BASE}/settings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }

        const result = await res.json();

        if (result.success) {
            // fill the general form with whatever is saved
            prefillForm(result.settings);
            // build the RBAC table from the roles array
            renderRBACTable(result.roles);
        } else {
            showBanner('error', 'Could not load settings.');
        }

    } catch (err) {
        console.error('Failed to load settings:', err);
        showBanner('error', 'Network error — settings could not be loaded.');
    }
}


/**
 * Fills the three form inputs with values from the database.
 *
 * @param {Object} settings - { depot_name, currency, distance_unit }
 */
function prefillForm(settings) {
    const depotNameInput   = document.getElementById('depotName');
    const currencyInput    = document.getElementById('currency');
    const distanceUnitInput = document.getElementById('distanceUnit');

    if (depotNameInput)    depotNameInput.value    = settings.depot_name    || '';
    if (currencyInput)     currencyInput.value     = settings.currency      || '';
    if (distanceUnitInput) distanceUnitInput.value = settings.distance_unit || '';
}


// ============================================================
// RBAC Permission Matrix Table
// ============================================================

/*
 * The columns shown in the matrix — these map directly to the
 * permission keys stored in the roles.permissions JSONB column.
 */
const RBAC_COLUMNS = [
    { key: 'vehicles',      label: 'Fleet'       },
    { key: 'drivers',       label: 'Drivers'     },
    { key: 'trips',         label: 'Trips'       },
    { key: 'fuel_expenses', label: 'Fuel/Exp'    },
    { key: 'reports',       label: 'Analytics'   }
];

/*
 * Human-readable role names for the first column.
 */
const ROLE_DISPLAY_NAMES = {
    fleet_manager:     'Fleet Manager',
    dispatcher:        'Dispatcher',
    safety_officer:    'Safety Officer',
    financial_analyst: 'Financial Analyst'
};


/**
 * Builds the RBAC matrix table from the roles array returned by the API.
 * Each row is a role; each column is a module permission.
 *
 * Cell values:
 *   true  → ✓ (green)
 *   false → — (muted dash)
 *
 * @param {Array} roles - [{ name, description, permissions }, ...]
 */
function renderRBACTable(roles) {
    const container = document.getElementById('rbacTableWrap');
    if (!container || !roles || roles.length === 0) {
        if (container) container.innerHTML = '<div class="loading-text">No role data available.</div>';
        return;
    }

    // build the header row — "ROLE" label + one column per module
    const headerCells = RBAC_COLUMNS.map(col =>
        `<th>${col.label}</th>`
    ).join('');

    // build one row per role
    const bodyRows = roles.map(role => {
        const displayName = ROLE_DISPLAY_NAMES[role.name] || role.name;
        const perms       = role.permissions || {};

        // build the permission cell for each module column
        const cells = RBAC_COLUMNS.map(col => {
            const allowed = perms[col.key];
            if (allowed === true) {
                return `<td><span class="perm-yes" title="Full access">✓</span></td>`;
            } else {
                return `<td><span class="perm-no" title="No access">—</span></td>`;
            }
        }).join('');

        return `
            <tr>
                <td>${displayName}</td>
                ${cells}
            </tr>
        `;
    }).join('');

    // assemble the full table
    container.innerHTML = `
        <table class="rbac-table">
            <thead>
                <tr>
                    <th>ROLE</th>
                    ${headerCells}
                </tr>
            </thead>
            <tbody>
                ${bodyRows}
            </tbody>
        </table>
    `;
}


// ============================================================
// Form Submission & Validation
// ============================================================

/**
 * Wires the settings form submit handler.
 * Validates all three fields before sending to the API.
 */
function setupFormEvents() {
    const form    = document.getElementById('settingsForm');
    const saveBtn = document.getElementById('btnSaveSettings');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        saveBtn.disabled    = true;
        saveBtn.textContent = 'Saving…';

        const data = {
            depot_name:    document.getElementById('depotName').value.trim(),
            currency:      document.getElementById('currency').value.trim(),
            distance_unit: document.getElementById('distanceUnit').value.trim()
        };

        try {
            const res    = await fetch(`${API_BASE}/settings`, {
                method:  'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type':  'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success) {
                showBanner('success', 'Settings saved successfully.');
            } else {
                showBanner('error', result.message || 'Could not save settings.');
            }

        } catch (err) {
            console.error('Error saving settings:', err);
            showBanner('error', 'Network error — please check your connection and retry.');
        } finally {
            saveBtn.disabled    = false;
            saveBtn.textContent = 'Save Changes';
        }
    });
}


/**
 * Validates the three general settings fields.
 * Returns true only when all are filled in.
 */
function validateForm() {
    let ok = true;

    const depot   = document.getElementById('depotName');
    const errD    = document.getElementById('errDepotName');
    if (!depot.value.trim()) {
        setFieldError(depot, errD, 'Depot name is required.');
        ok = false;
    } else {
        clearFieldError(depot, errD);
    }

    const currency = document.getElementById('currency');
    const errC     = document.getElementById('errCurrency');
    if (!currency.value.trim()) {
        setFieldError(currency, errC, 'Currency is required.');
        ok = false;
    } else {
        clearFieldError(currency, errC);
    }

    const dist  = document.getElementById('distanceUnit');
    const errDU = document.getElementById('errDistanceUnit');
    if (!dist.value.trim()) {
        setFieldError(dist, errDU, 'Distance unit is required.');
        ok = false;
    } else {
        clearFieldError(dist, errDU);
    }

    return ok;
}


// ============================================================
// Mobile Sidebar Toggle
// ============================================================

function setupSidebarToggle() {
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebarOverlay');
    const toggleBtn = document.getElementById('menuToggleBtn');

    if (!toggleBtn || !sidebar || !overlay) return;

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('visible');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
    });
}


// ============================================================
// Logout
// ============================================================

function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

function logout() {
    localStorage.removeItem('transitops_token');
    localStorage.removeItem('transitops_user');
    window.location.href = '/';
}


// ============================================================
// Helpers
// ============================================================

/**
 * Shows the page-level feedback banner.
 * Auto-hides after 4 seconds.
 */
function showBanner(type, message) {
    const banner = document.getElementById('pageBanner');
    if (!banner) return;

    banner.className   = `settings-banner show-${type}`;
    banner.textContent = message;

    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => {
        banner.className   = 'settings-banner';
        banner.textContent = '';
    }, 4000);
}

function setFieldError(input, span, message) {
    input.classList.add('invalid');
    if (span) span.textContent = message;
}

function clearFieldError(input, span) {
    input.classList.remove('invalid');
    if (span) span.textContent = '';
}

/**
 * Maps role keys to short display labels for the top-bar badge.
 */
function formatRoleName(role) {
    const map = {
        fleet_manager:     'Fleet Mgr',
        dispatcher:        'Dispatcher',
        safety_officer:    'Safety Off.',
        financial_analyst: 'Finance'
    };
    return map[role] || role.split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
