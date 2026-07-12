/**
 * public/js/fuel-expenses.js
 * -------------------------------------------------
 * Front-end logic for the Fuel & Expenses page.
 *
 * Responsibilities:
 *   1. Auth guard — redirect to login if no JWT present.
 *   2. Render user name + role badge in the top bar.
 *   3. Apply RBAC sidebar gating from stored permissions.
 *   4. Load vehicle list into the modal dropdowns.
 *   5. Fetch and render the Fuel Logs table.
 *   6. Fetch and render the Other Expenses table.
 *   7. Fetch the auto-calculated total operational cost.
 *   8. Handle "+ Log Fuel" modal — form validation, submit, refresh.
 *   9. Handle "+ Add Expense" modal — form validation, submit, refresh.
 *  10. Global search input to filter both tables simultaneously.
 *  11. Wire mobile hamburger sidebar toggle.
 * -------------------------------------------------
 */

// --- auth guard ---
const token    = localStorage.getItem('transitops_token');
const userData = localStorage.getItem('transitops_user');

if (!token || !userData) {
    window.location.href = '/';
}

const API_BASE = window.location.origin + '/api';

// local state — kept so we can re-filter without hitting the API again
let vehiclesList  = [];
let fuelLogs      = [];
let expensesList  = [];


// ============================================================
// Initialisation — refresh permissions from the server first,
// then boot the page so RBAC is never stale
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Always fetch the latest permissions from the server before
    // applying RBAC — this prevents stale-token issues where a role
    // permission was updated after the user last logged in.
    await refreshUserFromServer();

    // Check module access with the freshly-updated permissions
    try {
        const freshUser = JSON.parse(localStorage.getItem('transitops_user') || '{}');
        if (freshUser.permissions && freshUser.permissions['fuel_expenses'] === false) {
            window.location.href = '/dashboard';
            return;
        }
    } catch (_) {
        window.location.href = '/';
        return;
    }

    loadUserInfo();
    loadVehicles();
    loadFuelLogs();
    loadExpenses();
    loadTotalOperationalCost();
    setupModals();
    setupSearch();
    setupSidebarToggle();
    setupLogout();
});


/**
 * Calls GET /api/auth/me and syncs the stored user object in
 * localStorage with the latest permissions from the database.
 * This ensures RBAC sidebar gating is always current even when
 * role permissions are changed without requiring a re-login.
 */
async function refreshUserFromServer() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            // token is invalid or expired — force re-login
            localStorage.removeItem('transitops_token');
            localStorage.removeItem('transitops_user');
            window.location.href = '/';
            return;
        }

        const result = await res.json();
        if (result.success && result.user) {
            // Overwrite the cached user object with fresh data from DB
            localStorage.setItem('transitops_user', JSON.stringify({
                id:          result.user.id,
                fullName:    result.user.fullName,
                email:       result.user.email,
                role:        result.user.role,
                permissions: result.user.permissions
            }));
        }
    } catch (_) {
        // Network error — proceed with cached data rather than blocking the page
    }
}


// ============================================================
// User Info & RBAC
// ============================================================

/**
 * Reads the stored user object, populates the top-bar name and
 * role badge, then dims any sidebar nav links the user can't use.
 */
function loadUserInfo() {
    try {
        const user = JSON.parse(userData);

        // show a shortened name like "Ranya K."
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

        // RBAC: visually disable nav items the role can't access
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
        console.error('Corrupted user data, redirecting to login:', err);
        logout();
    }
}


// ============================================================
// Vehicle Dropdown
// ============================================================

/**
 * Fetches vehicles from the API and fills both modal dropdowns
 * (fuel modal and expense modal) with options.
 */
async function loadVehicles() {
    const fuelSelect    = document.getElementById('fuelVehicle');
    const expenseSelect = document.getElementById('expenseVehicle');
    if (!fuelSelect || !expenseSelect) return;

    try {
        const res = await fetch(`${API_BASE}/vehicles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }

        const result = await res.json();
        if (result.success) {
            vehiclesList = result.data;

            const placeholder = '<option value="" disabled selected>Select vehicle...</option>';
            fuelSelect.innerHTML    = placeholder;
            expenseSelect.innerHTML = placeholder;

            vehiclesList.forEach(v => {
                const opt       = document.createElement('option');
                opt.value       = v.id;
                opt.textContent = `${v.model} (${v.registration_no})`;
                // clone into both selects
                fuelSelect.appendChild(opt.cloneNode(true));
                expenseSelect.appendChild(opt);
            });
        }

    } catch (err) {
        console.error('Could not load vehicles:', err);
    }
}


// ============================================================
// Fuel Logs
// ============================================================

/**
 * Fetches all fuel log entries and renders them in the FUEL LOGS table.
 */
async function loadFuelLogs() {
    const tbody = document.getElementById('fuelTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Loading fuel logs...</td></tr>';

    try {
        const res    = await fetch(`${API_BASE}/fuel`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.success) {
            fuelLogs = result.data;
            renderFuelTable(fuelLogs);
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Could not load fuel logs.</td></tr>';
        }

    } catch (err) {
        console.error('Failed to load fuel logs:', err);
        tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Network error — please refresh.</td></tr>';
    }
}


/**
 * Renders an array of fuel log objects into the table body.
 * Extracted into its own function so the search filter can call it too.
 *
 * @param {Array} logs
 */
function renderFuelTable(logs) {
    const tbody = document.getElementById('fuelTableBody');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-text">No refueling entries found.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(l => {
        const vehicle = l.vehicle_model || l.registration_no || '—';
        const liters  = parseFloat(l.quantity_liters || 0).toFixed(0);
        const cost    = Number(l.total_cost || 0).toLocaleString('en-IN');
        const date    = formatDate(l.fill_date);

        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-primary);">${vehicle}</td>
                <td>${date}</td>
                <td style="font-weight: 500;">${liters} L</td>
                <td style="font-weight: 600;">₹${cost}</td>
            </tr>
        `;
    }).join('');
}


// ============================================================
// Other Expenses
// ============================================================

/**
 * Fetches all expense entries (tolls, fines, parking, etc.)
 * and renders them in the OTHER EXPENSES table.
 */
async function loadExpenses() {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading-text">Loading expenses...</td></tr>';

    try {
        const res    = await fetch(`${API_BASE}/expenses`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.success) {
            expensesList = result.data;
            renderExpensesTable(expensesList);
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-text">Could not load expenses.</td></tr>';
        }

    } catch (err) {
        console.error('Failed to load expenses:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="loading-text">Network error — please refresh.</td></tr>';
    }
}


/**
 * Renders an array of expense objects into the OTHER EXPENSES table.
 *
 * @param {Array} expenses
 */
function renderExpensesTable(expenses) {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    if (expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-text">No expenses logged.</td></tr>';
        return;
    }

    tbody.innerHTML = expenses.map(e => {
        const vehicle  = e.vehicle_model || e.registration_no || '—';
        const date     = formatDate(e.expense_date);
        const amount   = Number(e.amount || 0).toLocaleString('en-IN');
        const category = e.category
            ? e.category.charAt(0).toUpperCase() + e.category.slice(1)
            : '—';
        const desc = e.description || '—';

        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-primary);">${vehicle}</td>
                <td>${date}</td>
                <td style="font-weight: 500;">${category}</td>
                <td style="font-weight: 600;">₹${amount}</td>
                <td style="color: var(--text-muted);">${desc}</td>
            </tr>
        `;
    }).join('');
}


// ============================================================
// Total Operational Cost
// ============================================================

/**
 * Fetches the server-calculated total: fuel + maintenance + expenses.
 * Updates the summary bar at the bottom of the page.
 */
async function loadTotalOperationalCost() {
    const valEl = document.getElementById('totalOperationalCostVal');
    if (!valEl) return;

    try {
        const res    = await fetch(`${API_BASE}/fuel/total-cost`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (result.success) {
            const formatted = Number(result.data.total).toLocaleString('en-IN');
            valEl.textContent = `₹${formatted}`;
        }

    } catch (err) {
        console.error('Could not fetch total operational cost:', err);
    }
}


// ============================================================
// Modals — Fuel Log & Expense
// ============================================================

/**
 * Sets up open/close behaviour for both modals, auto-calculates
 * total fuel cost from qty × price, and handles form submissions
 * with inline validation.
 */
function setupModals() {
    // ---- element references ----
    const fuelModal    = document.getElementById('fuelModal');
    const expenseModal = document.getElementById('expenseModal');
    const fuelDate     = document.getElementById('fuelDate');
    const expenseDate  = document.getElementById('expenseDate');

    // open buttons
    document.getElementById('btnLogFuel')?.addEventListener('click', () => {
        openModal(fuelModal);
        if (fuelDate) fuelDate.value = todayISOString();
    });

    document.getElementById('btnAddExpense')?.addEventListener('click', () => {
        openModal(expenseModal);
        if (expenseDate) expenseDate.value = todayISOString();
    });

    // close buttons (× icon and "Cancel")
    document.getElementById('btnFuelModalClose')?.addEventListener('click', () => closeModal(fuelModal));
    document.getElementById('btnFuelCancel')?.addEventListener('click',      () => closeModal(fuelModal));
    document.getElementById('btnExpenseModalClose')?.addEventListener('click', () => closeModal(expenseModal));
    document.getElementById('btnExpenseCancel')?.addEventListener('click',      () => closeModal(expenseModal));

    // close either modal if the user clicks outside the content box
    [fuelModal, expenseModal].forEach(modal => {
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });


    // ---- Fuel cost auto-calculation ----
    // When the user types qty or price/liter, compute total automatically
    const fuelQty   = document.getElementById('fuelQty');
    const fuelPrice = document.getElementById('fuelPrice');
    const fuelTotal = document.getElementById('fuelTotalCost');

    const recalcTotal = () => {
        const qty   = parseFloat(fuelQty?.value)   || 0;
        const price = parseFloat(fuelPrice?.value) || 0;
        if (qty > 0 && price > 0 && fuelTotal) {
            fuelTotal.value = (qty * price).toFixed(2);
        }
    };

    fuelQty?.addEventListener('input',   recalcTotal);
    fuelPrice?.addEventListener('input', recalcTotal);


    // ---- Fuel Form submit ----
    const fuelForm   = document.getElementById('fuelForm');
    const fuelSubmit = document.getElementById('btnFuelSubmit');

    fuelForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateFuelForm()) return;

        fuelSubmit.disabled   = true;
        fuelSubmit.textContent = 'Saving…';

        const data = {
            vehicle_id:       parseInt(document.getElementById('fuelVehicle').value),
            fuel_type:        document.getElementById('fuelType').value,
            quantity_liters:  parseFloat(document.getElementById('fuelQty').value),
            cost_per_liter:   parseFloat(document.getElementById('fuelPrice').value) || 0,
            total_cost:       parseFloat(document.getElementById('fuelTotalCost').value),
            odometer_reading: parseFloat(document.getElementById('fuelOdometer').value) || null,
            fill_date:        document.getElementById('fuelDate').value || todayISOString()
        };

        try {
            const res    = await fetch(`${API_BASE}/fuel`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type':  'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success) {
                fuelForm.reset();
                closeModal(fuelModal);
                // refresh both the fuel table and the total cost figure
                loadFuelLogs();
                loadTotalOperationalCost();
                showBanner('exp', 'success', 'Fuel log entry saved successfully.');
            } else {
                showBanner('exp', 'error', result.message || 'Could not save the fuel log.');
            }

        } catch (err) {
            console.error('Error saving fuel log:', err);
            showBanner('exp', 'error', 'Network error — please check your connection and retry.');
        } finally {
            fuelSubmit.disabled    = false;
            fuelSubmit.textContent = 'Save Log';
        }
    });


    // ---- Expense Form submit ----
    const expenseForm   = document.getElementById('expenseForm');
    const expenseSubmit = document.getElementById('btnExpenseSubmit');

    expenseForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateExpenseForm()) return;

        expenseSubmit.disabled   = true;
        expenseSubmit.textContent = 'Saving…';

        const data = {
            vehicle_id:     parseInt(document.getElementById('expenseVehicle').value),
            category:       document.getElementById('expenseCategory').value,
            amount:         parseFloat(document.getElementById('expenseAmount').value),
            expense_date:   document.getElementById('expenseDate').value || todayISOString(),
            description:    document.getElementById('expenseDesc').value.trim() || null,
            // direct fleet expenses are treated as paid immediately
            payment_status: 'paid'
        };

        try {
            const res    = await fetch(`${API_BASE}/expenses`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type':  'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success) {
                expenseForm.reset();
                closeModal(expenseModal);
                loadExpenses();
                loadTotalOperationalCost();
                showBanner('exp', 'success', 'Expense logged successfully.');
            } else {
                showBanner('exp', 'error', result.message || 'Could not save the expense.');
            }

        } catch (err) {
            console.error('Error saving expense:', err);
            showBanner('exp', 'error', 'Network error — please check your connection and retry.');
        } finally {
            expenseSubmit.disabled    = false;
            expenseSubmit.textContent = 'Save Expense';
        }
    });
}


// ============================================================
// Form Validation
// ============================================================

/**
 * Validates the fuel log modal form.
 * Sets per-field error messages and returns true only if all valid.
 */
function validateFuelForm() {
    let ok = true;

    const vehicle   = document.getElementById('fuelVehicle');
    const errV      = document.getElementById('errFuelVehicle');
    if (!vehicle.value) {
        setFieldError(vehicle, errV, 'Please select a vehicle.');
        ok = false;
    } else {
        clearFieldError(vehicle, errV);
    }

    const qty   = document.getElementById('fuelQty');
    const errQ  = document.getElementById('errFuelQty');
    if (!qty.value || parseFloat(qty.value) <= 0) {
        setFieldError(qty, errQ, 'Enter a positive quantity in liters.');
        ok = false;
    } else {
        clearFieldError(qty, errQ);
    }

    const total  = document.getElementById('fuelTotalCost');
    const errT   = document.getElementById('errFuelTotal');
    if (!total.value || parseFloat(total.value) <= 0) {
        setFieldError(total, errT, 'Enter the total refueling cost.');
        ok = false;
    } else {
        clearFieldError(total, errT);
    }

    return ok;
}


/**
 * Validates the expense modal form.
 * Returns true only if all required fields are valid.
 */
function validateExpenseForm() {
    let ok = true;

    const vehicle   = document.getElementById('expenseVehicle');
    const errV      = document.getElementById('errExpVehicle');
    if (!vehicle.value) {
        setFieldError(vehicle, errV, 'Please select a vehicle.');
        ok = false;
    } else {
        clearFieldError(vehicle, errV);
    }

    const category  = document.getElementById('expenseCategory');
    const errC      = document.getElementById('errExpCategory');
    if (!category.value) {
        setFieldError(category, errC, 'Please select an expense category.');
        ok = false;
    } else {
        clearFieldError(category, errC);
    }

    const amount   = document.getElementById('expenseAmount');
    const errA     = document.getElementById('errExpAmount');
    if (!amount.value || parseFloat(amount.value) <= 0) {
        setFieldError(amount, errA, 'Enter a positive amount.');
        ok = false;
    } else {
        clearFieldError(amount, errA);
    }

    return ok;
}


// ============================================================
// Search Filter
// ============================================================

/**
 * Wires the global search bar to filter both tables at once.
 * The search is case-insensitive and runs on every keystroke.
 */
function setupSearch() {
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();

        const filteredFuel = fuelLogs.filter(f =>
            (f.vehicle_model  && f.vehicle_model.toLowerCase().includes(q))  ||
            (f.registration_no && f.registration_no.toLowerCase().includes(q))
        );
        renderFuelTable(filteredFuel);

        const filteredExpenses = expensesList.filter(e =>
            (e.vehicle_model  && e.vehicle_model.toLowerCase().includes(q))  ||
            (e.registration_no && e.registration_no.toLowerCase().includes(q)) ||
            (e.category        && e.category.toLowerCase().includes(q))        ||
            (e.description     && e.description.toLowerCase().includes(q))
        );
        renderExpensesTable(filteredExpenses);
    });
}


// ============================================================
// Mobile Sidebar Toggle
// ============================================================

/**
 * Wires the hamburger (☰) button to show/hide the sidebar on mobile.
 * The dark overlay behind the sidebar also closes it on tap.
 */
function setupSidebarToggle() {
    const menuBtn = document.getElementById('menuToggleBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (menuBtn && sidebar && overlay) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('visible');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('visible');
        });
    }
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


// ============================================================
// Utility Helpers
// ============================================================

/**
 * Adds `.open` class to a modal to make it visible.
 */
function openModal(modal) {
    if (modal) modal.classList.add('open');
}

/**
 * Removes `.open` class to hide a modal.
 */
function closeModal(modal) {
    if (modal) modal.classList.remove('open');
}


/**
 * Shows the page-level banner in success or error style.
 * Automatically clears after 4 seconds.
 *
 * @param {'exp'} prefix
 * @param {'success'|'error'} type
 * @param {string} message
 */
function showBanner(prefix, type, message) {
    const banner = document.getElementById('pageBanner');
    if (!banner) return;

    banner.className   = `${prefix}-banner show-${type}`;
    banner.textContent = message;

    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => {
        banner.className   = `${prefix}-banner`;
        banner.textContent = '';
    }, 4000);
}


/**
 * Marks a field invalid: adds .invalid class and writes the error message.
 */
function setFieldError(input, errorSpan, message) {
    input.classList.add('invalid');
    if (errorSpan) errorSpan.textContent = message;
}


/**
 * Clears an invalid field state.
 */
function clearFieldError(input, errorSpan) {
    input.classList.remove('invalid');
    if (errorSpan) errorSpan.textContent = '';
}


/**
 * Formats an ISO date string into a readable "05 Jul 2026" format.
 */
function formatDate(dateString) {
    if (!dateString) return '—';
    const d      = new Date(dateString);
    const day    = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}


/**
 * Maps role keys to short display labels for the badge.
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
 * Returns today's date as YYYY-MM-DD for populating date inputs.
 */
function todayISOString() {
    return new Date().toISOString().slice(0, 10);
}


/**
 * Removes auth data and sends the user back to the login page.
 */
function logout() {
    localStorage.removeItem('transitops_token');
    localStorage.removeItem('transitops_user');
    window.location.href = '/';
}
