/**
 * public/js/trips.js
 * -------------------------------------------------
 * Front-end logic for the Trip Dispatcher page.
 * 
 * Handles:
 *  1. Authentication validation & RBAC setup.
 *  2. Fetching available vehicles and drivers for dropdowns.
 *  3. Dynamic weight capacity validations:
 *     - If cargo weight exceeds vehicle capacity (Tons -> kg),
 *       displays a custom alert box and blocks dispatch.
 *  4. Submitting/dispatching a new trip to the backend.
 *  5. Fetching and rendering the Live Board list (with ETA).
 *  6. Trip state management: completing or cancelling active trips.
 * -------------------------------------------------
 */

// Authenticated user check
const token = localStorage.getItem('transitops_token');
const userData = localStorage.getItem('transitops_user');

if (!token || !userData) {
    window.location.href = '/';
}

const API_BASE = window.location.origin + '/api';

// state variables
let availableVehicles = [];
let availableDrivers = [];
let tripsList = [];


// ---- Initialization ----
document.addEventListener('DOMContentLoaded', async () => {
    await refreshUserFromServer();
    loadUserInfo();
    loadDropdowns();
    loadLiveBoard();
    setupFormEvents();
    setupSidebarToggle();
    setupLogout();
});


async function refreshUserFromServer() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('transitops_token');
            localStorage.removeItem('transitops_user');
            window.location.href = '/';
            return;
        }
        const result = await res.json();
        if (result.success && result.user) {
            localStorage.setItem('transitops_user', JSON.stringify({
                id:          result.user.id,
                fullName:    result.user.fullName,
                email:       result.user.email,
                role:        result.user.role,
                permissions: result.user.permissions
            }));
        }
    } catch (_) { /* network error — proceed with cached data */ }
}


/**
 * Load user name and role badge into the topbar.
 * Restricts sidebar menu items based on user permissions.
 */
function loadUserInfo() {
    try {
        const user = JSON.parse(userData);

        // name display
        const nameEl = document.getElementById('userName');
        if (nameEl) {
            const parts = (user.fullName || 'User').split(' ');
            const shortName = parts.length > 1
                ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
                : parts[0];
            nameEl.textContent = shortName;
        }

        // role badge display
        const badgeEl = document.getElementById('roleBadge');
        if (badgeEl) {
            badgeEl.textContent = formatRoleName(user.role || '');
        }

        // RBAC navigation gating
        if (user.permissions) {
            const navLinks = document.querySelectorAll('.nav-link[data-module]');
            navLinks.forEach(link => {
                const module = link.getAttribute('data-module');
                if (module !== 'dashboard' && user.permissions[module] === false) {
                    link.style.opacity = '0.3';
                    link.style.pointerEvents = 'none';
                    link.title = 'You do not have access to this module';
                }
            });
        }

    } catch (err) {
        console.error('Failed to load user info:', err);
    }
}


/**
 * Fetch available vehicles & drivers and populate dropdown select elements.
 */
async function loadDropdowns() {
    const vehicleSelect = document.getElementById('vehicleSelect');
    const driverSelect = document.getElementById('driverSelect');

    try {
        const [vehiclesRes, driversRes] = await Promise.all([
            fetch(`${API_BASE}/trips/available/vehicles`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${API_BASE}/trips/available/drivers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        if (vehiclesRes.status === 401 || driversRes.status === 401) {
            logout();
            return;
        }

        const vehiclesData = await vehiclesRes.json();
        const driversData = await driversRes.json();

        if (vehiclesData.success && vehiclesData.data) {
            availableVehicles = vehiclesData.data;
            populateVehiclesDropdown(availableVehicles);
        }

        if (driversData.success && driversData.data) {
            availableDrivers = driversData.data;
            populateDriversDropdown(availableDrivers);
        }

    } catch (err) {
        console.error('Failed to load dropdown options:', err);
    }
}


function populateVehiclesDropdown(vehicles) {
    const select = document.getElementById('vehicleSelect');
    if (!select) return;

    // Reset dropdown keep first placeholder
    select.innerHTML = '<option value="" disabled selected>Select available vehicle...</option>';

    vehicles.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        
        // Format description for selection options
        const capacityText = formatCapacityDescription(v.capacity, v.vehicle_type);
        option.textContent = `${v.model} (${v.registration_no}) — ${capacityText}`;
        select.appendChild(option);
    });
}


function populateDriversDropdown(drivers) {
    const select = document.getElementById('driverSelect');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Select available driver...</option>';

    drivers.forEach(d => {
        const option = document.createElement('option');
        option.value = d.id;
        option.textContent = `${d.full_name} (${d.license_no})`;
        select.appendChild(option);
    });
}


/**
 * Formats capacity to readable labels for dropdowns (Tons -> kg for freight, seats for buses).
 */
function formatCapacityDescription(capacityVal, type) {
    const cap = parseFloat(capacityVal);
    if (type === 'bus') {
        return `${cap} seats capacity`;
    }
    // Convert Tons to kg
    const kg = cap * 1000;
    return `${kg} kg capacity`;
}


/**
 * Setup Real-time validators for form submissions.
 */
function setupFormEvents() {
    const form = document.getElementById('dispatchForm');
    const cargoInput = document.getElementById('cargoWeight');
    const vehicleSelect = document.getElementById('vehicleSelect');
    const validationCard = document.getElementById('validationCard');
    const btnDispatch = document.getElementById('btnDispatch');
    const btnCancel = document.getElementById('btnCancelForm');

    // Trigger check on vehicle change or cargo weight input
    const performWeightCheck = () => {
        const vId = vehicleSelect.value;
        const weight = parseFloat(cargoInput.value);

        if (!vId || isNaN(weight) || weight <= 0) {
            validationCard.classList.add('hidden');
            btnDispatch.removeAttribute('disabled');
            return;
        }

        const vehicle = availableVehicles.find(v => v.id == vId);
        if (!vehicle) return;

        // Skip validation check for buses (based on seating capacity)
        if (vehicle.vehicle_type === 'bus') {
            validationCard.classList.add('hidden');
            btnDispatch.removeAttribute('disabled');
            return;
        }

        const capacityKg = parseFloat(vehicle.capacity) * 1000;
        
        // Populate warning card details
        document.getElementById('infoVehicleCapacity').textContent = `Vehicle Capacity: ${capacityKg} kg`;
        document.getElementById('infoCargoWeight').textContent = `Cargo Weight: ${weight} kg`;

        validationCard.classList.remove('hidden');

        if (weight > capacityKg) {
            const exceeded = weight - capacityKg;
            document.getElementById('warnResult').innerHTML = `❌ Capacity exceeded by ${exceeded} kg &rarr; dispatch blocked!`;
            document.getElementById('warnResult').className = 'warn-line error-highlight';
            validationCard.classList.remove('success-mode');
            btnDispatch.setAttribute('disabled', 'true');
        } else {
            document.getElementById('warnResult').innerHTML = `✅ Weight is within limit. Eligible to dispatch.`;
            document.getElementById('warnResult').className = 'warn-line success-highlight';
            validationCard.classList.add('success-mode');
            btnDispatch.removeAttribute('disabled');
        }
    };

    if (cargoInput) cargoInput.addEventListener('input', performWeightCheck);
    if (vehicleSelect) vehicleSelect.addEventListener('change', performWeightCheck);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitTrip();
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            form.reset();
            validationCard.classList.add('hidden');
            validationCard.classList.remove('success-mode');
            btnDispatch.removeAttribute('disabled');
        });
    }
}


/**
 * Post a new trip assignment to database.
 */
async function submitTrip() {
    const source      = document.getElementById('source').value.trim();
    const destination = document.getElementById('destination').value.trim();
    const vehicle_id  = document.getElementById('vehicleSelect').value;
    const driver_id   = document.getElementById('driverSelect').value;
    const cargo_weight = document.getElementById('cargoWeight').value;
    // distance_km is saved on the route record (P1 fix — spec §3.5 planned distance)
    const distance_km  = document.getElementById('distance').value || null;

    const data = {
        source,
        destination,
        vehicle_id:  parseInt(vehicle_id),
        driver_id:   parseInt(driver_id),
        cargo_weight: parseFloat(cargo_weight),
        distance_km:  distance_km ? parseFloat(distance_km) : null
        // status is always 'dispatched' — set by the backend (spec §3.5 lifecycle)
    };

    try {
        const res = await fetch(`${API_BASE}/trips`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (result.success) {
            // Reset form fields and hide the validation card
            document.getElementById('dispatchForm').reset();
            document.getElementById('validationCard').classList.add('hidden');

            // Reload the available dropdowns (vehicle + driver just became On Trip)
            // and refresh the live board so the new card appears immediately
            await loadDropdowns();
            await loadLiveBoard();
        } else {
            // Show inline error — no alert() per project rules
            const errBanner = document.getElementById('dispatchErrorBanner');
            if (errBanner) {
                errBanner.textContent = result.message || 'Failed to dispatch trip.';
                errBanner.classList.remove('hidden');
                setTimeout(() => errBanner.classList.add('hidden'), 5000);
            }
        }

    } catch (err) {
        console.error('Failed to submit trip:', err);
        const errBanner = document.getElementById('dispatchErrorBanner');
        if (errBanner) {
            errBanner.textContent = 'Network error — could not dispatch trip.';
            errBanner.classList.remove('hidden');
        }
    }
}


/**
 * Load and render all trips onto the Live Board list.
 */
async function loadLiveBoard() {
    const listContainer = document.getElementById('liveboardList');
    if (!listContainer) return;

    try {
        const res = await fetch(`${API_BASE}/trips`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }

        const result = await res.json();

        if (result.success && result.data) {
            tripsList = result.data;
            renderLiveBoard(tripsList);
        } else {
            listContainer.innerHTML = '<div class="loading-text">Could not load live board.</div>';
        }

    } catch (err) {
        console.error('Failed to fetch Live Board:', err);
        listContainer.innerHTML = '<div class="loading-text">Network error loading trips.</div>';
    }
}


/**
 * Renders the Live Board list in HTML.
 */
function renderLiveBoard(trips) {
    const container = document.getElementById('liveboardList');
    if (!container) return;

    if (trips.length === 0) {
        container.innerHTML = '<div class="loading-text">No trips booked yet.</div>';
        return;
    }

    container.innerHTML = trips.map(trip => {
        // Formatted trip ID (e.g. TR001)
        const tripCode = `TR${String(trip.id).padStart(3, '0')}`;
        
        // Vehicle/driver text info
        const vehicleInfo = trip.vehicle_model ? `${trip.vehicle_model} (${trip.vehicle_reg})` : 'Unassigned vehicle';
        const driverInfo = trip.driver_name || 'Unassigned driver';

        // dynamic status badge
        const statusBadge = getTripStatusBadge(trip.status);

        // ETA / state text
        let etaText = '—';
        if (trip.status === 'dispatched') {
            etaText = calculateTripETA(trip);
        } else if (trip.status === 'completed') {
            etaText = 'Arrived';
        } else if (trip.status === 'draft') {
            etaText = 'Awaiting dispatch';
        } else if (trip.status === 'cancelled') {
            etaText = 'Cancelled';
        }

        // Action controls — only live dispatched trips can be completed or cancelled
        let actionButtons = '';
        if (trip.status === 'dispatched') {
            actionButtons = `
                <div class="trip-actions">
                    <button class="btn-action-small complete" onclick="updateTripStatus(${trip.id}, 'completed')">Complete</button>
                    <button class="btn-action-small cancel" onclick="updateTripStatus(${trip.id}, 'cancelled')">Cancel</button>
                </div>
            `;
        }

        return `
            <div class="trip-card">
                <div class="trip-card-left">
                    <div class="trip-card-header">
                        <span class="trip-card-id">${tripCode}</span>
                        <span class="trip-card-route">${trip.start_point} &rarr; ${trip.end_point}</span>
                    </div>
                    <div class="trip-card-details">
                        🚍 ${vehicleInfo} &nbsp;&bull;&nbsp; 👤 ${driverInfo}
                    </div>
                    <div class="trip-card-eta">
                        ⏱️ ${etaText}
                    </div>
                </div>
                <div class="trip-card-right">
                    ${statusBadge}
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}


function getTripStatusBadge(status) {
    switch (status) {
        case 'draft':
            return '<span class="status-badge draft">Draft</span>';
        case 'dispatched':
            return '<span class="status-badge dispatched">Dispatched</span>';
        case 'completed':
            return '<span class="status-badge completed">Completed</span>';
        case 'cancelled':
            return '<span class="status-badge cancelled">Cancelled</span>';
        default:
            return `<span class="status-badge draft">${status}</span>`;
    }
}


function calculateTripETA(trip) {
    if (!trip.arrival_time) return '45 min'; // fallback
    const arrival = new Date(trip.arrival_time);
    const now = new Date();
    const diff = arrival - now;
    if (diff <= 0) return 'Arrived';

    const mins = Math.round(diff / 60000);
    return `${mins} min`;
}


/**
 * Change status of a trip (Complete / Cancel) and refresh board.
 */
window.updateTripStatus = async function(id, newStatus) {
    try {
        const res = await fetch(`${API_BASE}/trips/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        const result = await res.json();

        if (result.success) {
            // Refresh available dropdowns (vehicle/driver freed) and live board
            await loadDropdowns();
            await loadLiveBoard();
        } else {
            const errBanner = document.getElementById('dispatchErrorBanner');
            if (errBanner) {
                errBanner.textContent = result.message || 'Failed to update trip status.';
                errBanner.classList.remove('hidden');
                setTimeout(() => errBanner.classList.add('hidden'), 5000);
            }
        }

    } catch (err) {
        console.error('Failed to update trip status:', err);
    }
};


// ---- Sidebar toggle & navigation helper ----

function setupSidebarToggle() {
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebarOverlay');
    const toggleBtn = document.getElementById('menuToggleBtn');

    if (!toggleBtn || !sidebar || !overlay) return;

    // toggle open/close on each press of the hamburger button
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('visible');
    });

    // tapping the dark backdrop also closes the sidebar
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
    });
}


/**
 * Wire the sidebar logout button.
 * Called once during page init so the button works on every tab.
 */
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}


function formatRoleName(role) {
    const nameMap = {
        'fleet_manager': 'Fleet Mgr',
        'dispatcher': 'Dispatcher',
        'safety_officer': 'Safety Off.',
        'financial_analyst': 'Finance'
    };
    return nameMap[role] || role.split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}


function logout() {
    localStorage.removeItem('transitops_token');
    localStorage.removeItem('transitops_user');
    window.location.href = '/';
}
