/**
 * public/js/maintenance.js
 * -------------------------------------------------
 * Front-end logic for the Maintenance page.
 *
 * Responsibilities:
 *   1. Check the user is authenticated (JWT in localStorage)
 *      and redirect to login if not.
 *   2. Apply RBAC — grey-out sidebar links the current role
 *      doesn't have permission to access.
 *   3. Populate the vehicle dropdown from the API.
 *   4. Load and render the service record log table.
 *   5. Handle the "Log Service Record" form submission with
 *      proper inline validation (no browser alert() boxes).
 *   6. Filter the service log via the global search input.
 *   7. Wire up the mobile hamburger menu toggle.
 * -------------------------------------------------
 */

// --- auth guard: redirect to login immediately if no token ---
const token    = localStorage.getItem('transitops_token');
const userData = localStorage.getItem('transitops_user');

if (!token || !userData) {
    window.location.href = '/';
}

// base URL for all API calls — adapts to whatever host the app runs on
const API_BASE = window.location.origin + '/api';

// in-memory list of records so we can re-filter without extra API calls
let serviceRecords = [];


// ============================================================
// Initialisation — runs after the DOM is ready
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadVehicles();
    loadServiceLog();
    setupFormEvents();
    setupSidebarToggle();
});


// ============================================================
// User Info & RBAC
// ============================================================

/**
 * Reads the stored user object, shows their name in the top bar,
 * sets the role badge, and dims any nav links they can't access.
 */
function loadUserInfo() {
    try {
        const user = JSON.parse(userData);

        // show a short name like "Ranya K." in the top bar
        const nameEl = document.getElementById('userName');
        if (nameEl) {
            const parts = (user.fullName || 'User').split(' ');
            nameEl.textContent = parts.length > 1
                ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
                : parts[0];
        }

        // show the role label in the badge
        const badgeEl = document.getElementById('roleBadge');
        if (badgeEl) {
            badgeEl.textContent = formatRoleName(user.role || '');
        }

        // dim any sidebar links the user doesn't have permission to see
        if (user.permissions) {
            const navLinks = document.querySelectorAll('.nav-link[data-module]');
            navLinks.forEach(link => {
                const mod = link.getAttribute('data-module');
                if (mod !== 'dashboard' && user.permissions[mod] === false) {
                    link.style.opacity       = '0.3';
                    link.style.pointerEvents = 'none';
                    link.title               = 'You do not have access to this module';
                }
            });
        }

    } catch (err) {
        // corrupted user data — treat it as logged out
        console.error('Failed to parse user info, redirecting to login:', err);
        logout();
    }
}


// ============================================================
// Vehicles Dropdown
// ============================================================

/**
 * Fetches the vehicle list from the API and populates the
 * "VEHICLE" select in the service form.
 */
async function loadVehicles() {
    const select = document.getElementById('serviceVehicle');
    if (!select) return;

    try {
        const res = await fetch(`${API_BASE}/vehicles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // session expired
        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }

        const result = await res.json();
        if (result.success && result.data.length > 0) {
            // clear loading placeholder, then add one option per vehicle
            select.innerHTML = '<option value="" disabled selected>Select vehicle...</option>';
            result.data.forEach(v => {
                const opt       = document.createElement('option');
                opt.value       = v.id;
                opt.textContent = `${v.model} (${v.registration_no})`;
                select.appendChild(opt);
            });
        } else {
            select.innerHTML = '<option value="" disabled selected>No vehicles found</option>';
        }

    } catch (err) {
        console.error('Could not load vehicles:', err);
        select.innerHTML = '<option value="" disabled selected>Failed to load vehicles</option>';
    }
}


// ============================================================
// Service Log Table
// ============================================================

/**
 * Fetches all maintenance records from the API and renders them
 * in the SERVICE LOG table on the right side of the page.
 */
async function loadServiceLog() {
    const tbody = document.getElementById('serviceTableBody');
    if (!tbody) return;

    // show a loading row while we wait for the request
    tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Loading records...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/maintenance`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }

        const result = await res.json();
        if (result.success) {
            serviceRecords = result.data;
            renderServiceTable(serviceRecords);
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Could not load service records.</td></tr>';
        }

    } catch (err) {
        console.error('Failed to load service log:', err);
        tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Network error — please refresh.</td></tr>';
    }
}


/**
 * Renders an array of service records into the table body.
 * Called both on initial load and every time the search input changes.
 *
 * @param {Array} records - array of maintenance record objects from the API
 */
function renderServiceTable(records) {
    const tbody = document.getElementById('serviceTableBody');
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-text">No service records found.</td></tr>';
        return;
    }

    tbody.innerHTML = records.map(r => {
        // vehicle column: model name if we have it, registration as fallback
        const vehicleText = r.vehicle_model || r.registration_no || '—';

        // format the cost as Indian locale number (e.g. "3,500")
        const costText = r.cost != null
            ? Number(r.cost).toLocaleString('en-IN')
            : '0';

        // status badge CSS class and readable label
        const badgeClass = getStatusBadgeClass(r.status);
        const badgeLabel = formatStatusLabel(r.status);

        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-primary);">${vehicleText}</td>
                <td>${r.maintenance_type}</td>
                <td style="font-weight: 500;">₹${costText}</td>
                <td><span class="badge-maint ${badgeClass}">${badgeLabel}</span></td>
            </tr>
        `;
    }).join('');
}


// ============================================================
// Form Submission & Validation
// ============================================================

/**
 * Wires up the service log form submit handler plus the global
 * search input filter. Both live here so they share the same
 * serviceRecords array without needing globals in two places.
 */
function setupFormEvents() {
    const form      = document.getElementById('serviceForm');
    const dateInput = document.getElementById('serviceDate');
    const saveBtn   = document.getElementById('btnSaveService');

    // default the date field to today so users don't have to pick it manually
    if (dateInput) {
        dateInput.value = todayISOString();
    }

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // run client-side validation first, bail if anything is wrong
        if (!validateServiceForm()) return;

        // disable the save button to prevent double-submits
        saveBtn.disabled   = true;
        saveBtn.textContent = 'Saving…';

        const data = {
            vehicle_id:       parseInt(document.getElementById('serviceVehicle').value),
            maintenance_type: document.getElementById('serviceType').value,
            cost:             parseFloat(document.getElementById('serviceCost').value) || 0,
            scheduled_date:   document.getElementById('serviceDate').value,
            status:           document.getElementById('serviceStatus').value
        };

        try {
            const res = await fetch(`${API_BASE}/maintenance`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type':  'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await res.json();

            if (result.success) {
                form.reset();
                // put today's date back after reset
                if (dateInput) dateInput.value = todayISOString();
                // reload the log to show the new record
                loadServiceLog();
                showBanner('maint', 'success', 'Service record logged. Vehicle status updated.');
            } else {
                showBanner('maint', 'error', result.message || 'Could not save the service record.');
            }

        } catch (err) {
            console.error('Error submitting service record:', err);
            showBanner('maint', 'error', 'Network error — please check your connection and try again.');
        } finally {
            // always re-enable the button so the user can retry
            saveBtn.disabled    = false;
            saveBtn.textContent = 'Save';
        }
    });


    // ---- Global search filter ----
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            // filter against vehicle model, registration, and service type
            const filtered = serviceRecords.filter(r =>
                (r.vehicle_model    && r.vehicle_model.toLowerCase().includes(query))    ||
                (r.registration_no  && r.registration_no.toLowerCase().includes(query))  ||
                (r.maintenance_type && r.maintenance_type.toLowerCase().includes(query))
            );
            renderServiceTable(filtered);
        });
    }


    // ---- Logout button ----
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}


/**
 * Validates the service log form fields and sets inline error messages.
 * Returns true only if every required field is valid.
 */
function validateServiceForm() {
    let isValid = true;

    // ---- Vehicle ----
    const vehicle   = document.getElementById('serviceVehicle');
    const errVehicle = document.getElementById('errVehicle');
    if (!vehicle.value) {
        setFieldError(vehicle, errVehicle, 'Please select a vehicle.');
        isValid = false;
    } else {
        clearFieldError(vehicle, errVehicle);
    }

    // ---- Service Type ----
    const serviceType    = document.getElementById('serviceType');
    const errServiceType  = document.getElementById('errServiceType');
    if (!serviceType.value) {
        setFieldError(serviceType, errServiceType, 'Please select a service type.');
        isValid = false;
    } else {
        clearFieldError(serviceType, errServiceType);
    }

    // ---- Cost (optional, but must be non-negative if provided) ----
    const cost    = document.getElementById('serviceCost');
    const errCost = document.getElementById('errCost');
    if (cost.value !== '' && parseFloat(cost.value) < 0) {
        setFieldError(cost, errCost, 'Cost cannot be a negative number.');
        isValid = false;
    } else {
        clearFieldError(cost, errCost);
    }

    return isValid;
}


// ============================================================
// Mobile Sidebar Toggle
// ============================================================

/**
 * Wires the hamburger button (☰) to slide the sidebar in/out
 * on small screens, and closes it when the dark backdrop is tapped.
 */
function setupSidebarToggle() {
    const menuBtn  = document.getElementById('menuToggleBtn');
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');

    if (menuBtn && sidebar && overlay) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('visible');
        });

        // tapping the backdrop closes the sidebar
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('visible');
        });
    }
}


// ============================================================
// Helpers
// ============================================================

/**
 * Shows the page-level feedback banner with the given type and message.
 * Auto-hides after 4 seconds.
 *
 * @param {'maint'} prefix  - CSS class prefix ('maint' → .maint-banner)
 * @param {'success'|'error'} type
 * @param {string} message
 */
function showBanner(prefix, type, message) {
    const banner = document.getElementById('pageBanner');
    if (!banner) return;

    // remove any existing type classes then add the new one
    banner.className = `${prefix}-banner show-${type}`;
    banner.textContent = message;

    // auto-dismiss
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => {
        banner.className = `${prefix}-banner`;
        banner.textContent = '';
    }, 4000);
}


/**
 * Marks a form field as invalid: adds .invalid class and sets the error span.
 */
function setFieldError(input, errorSpan, message) {
    input.classList.add('invalid');
    if (errorSpan) errorSpan.textContent = message;
}


/**
 * Clears an invalid state: removes .invalid class and empties the error span.
 */
function clearFieldError(input, errorSpan) {
    input.classList.remove('invalid');
    if (errorSpan) errorSpan.textContent = '';
}


/**
 * Maps a DB status value to the badge CSS class used in maintenance.css.
 */
function getStatusBadgeClass(status) {
    const map = {
        in_progress: 'in-shop',
        completed:   'completed',
        pending:     'pending',
        overdue:     'overdue'
    };
    return map[status] || 'pending';
}


/**
 * Converts a DB status string into a user-readable label.
 */
function formatStatusLabel(status) {
    const map = {
        in_progress: 'In Shop',
        completed:   'Completed',
        pending:     'Pending',
        overdue:     'Overdue'
    };
    return map[status] || 'Unknown';
}


/**
 * Shortens role names for the top-bar badge (e.g. "fleet_manager" → "Fleet Mgr").
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


/**
 * Returns today's date in YYYY-MM-DD format for date input defaults.
 */
function todayISOString() {
    return new Date().toISOString().slice(0, 10);
}


/**
 * Clears auth data and redirects to the login page.
 */
function logout() {
    localStorage.removeItem('transitops_token');
    localStorage.removeItem('transitops_user');
    window.location.href = '/';
}
