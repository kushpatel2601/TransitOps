/**
 * fleet.js — Vehicle Registry page logic
 * -------------------------------------------------
 * Handles:
 *  1. Checking authentication & token validity
 *  2. Displaying user name & role badge in top bar
 *  3. Fetching fleet registry list from API with filters
 *  4. Formatting values: Odometer, Indian Rupee format for
 *     Acquisition Cost, and Capacity suffixes (kg, Ton, seats)
 *  5. Add / Edit Vehicle modal operations (validation, submitting)
 *  6. Delete Vehicle operation with confirmation
 * -------------------------------------------------
 */

// check if user is logged in
const token = localStorage.getItem('transitops_token');
const userData = localStorage.getItem('transitops_user');

if (!token || !userData) {
    window.location.href = '/';
}

const API_BASE = window.location.origin + '/api';

// state tracking for current list of loaded vehicles
let vehiclesList = [];


// ---- Page Initialization ----

document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadVehicles();
    setupFilters();
    setupModalEvents();
    setupSidebarToggle();
});


/**
 * Load user name and role badge into top bar.
 * Restricts menu links based on RBAC roles.
 */
function loadUserInfo() {
    try {
        const user = JSON.parse(userData);

        // show user name
        const nameEl = document.getElementById('userName');
        if (nameEl) {
            const parts = (user.fullName || 'User').split(' ');
            const shortName = parts.length > 1
                ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
                : parts[0];
            nameEl.textContent = shortName;
        }

        // show role badge
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
        console.error('Error loading user info:', err);
    }
}


/**
 * Fetch vehicle registry from API using active filter dropdowns.
 */
async function loadVehicles() {
    const tbody = document.getElementById('fleetTableBody');
    if (!tbody) return;

    // get filter values
    const type = document.getElementById('filterType').value;
    const status = document.getElementById('filterStatus').value;
    const search = document.getElementById('searchRegNo').value.trim();

    // construct query parameters
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (search) params.append('search', search);

    try {
        const response = await fetch(`${API_BASE}/vehicles?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // session expired
        if (response.status === 401 || response.status === 403) {
            logout();
            return;
        }

        const result = await response.json();

        if (result.success && result.data) {
            vehiclesList = result.data;
            renderFleetTable(vehiclesList);
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-text">Could not load vehicles.</td></tr>';
        }

    } catch (err) {
        console.error('Failed to load fleet:', err);
        tbody.innerHTML = '<tr><td colspan="8" class="loading-text">Network error. Please try again.</td></tr>';
    }
}


/**
 * Populates rows in the vehicle registry table.
 */
function renderFleetTable(vehicles) {
    const tbody = document.getElementById('fleetTableBody');
    if (!tbody) return;

    if (vehicles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-text">No vehicles found matching current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = vehicles.map(vehicle => {
        // format Capacity based on vehicle type (e.g. 500 kg, 5 Ton, 40 seats)
        const capacityText = formatCapacity(vehicle.capacity, vehicle.vehicle_type);

        // format Odometer to look nice (e.g. 74,000)
        const odometerText = Number(vehicle.current_mileage || 0).toLocaleString('en-IN');

        // format Acquisition Cost in Indian numbering system (e.g. 6,20,000)
        const acqCostText = vehicle.acquisition_cost !== null && vehicle.acquisition_cost !== undefined
            ? Number(vehicle.acquisition_cost).toLocaleString('en-IN')
            : '—';

        // status badges matching wireframe colors
        const statusClass = getStatusClass(vehicle.status);
        const statusText = formatStatusText(vehicle.status);

        return `
            <tr>
                <td class="trip-id">${vehicle.registration_no}</td>
                <td>${vehicle.model || '—'}</td>
                <td style="text-transform: capitalize;">${vehicle.vehicle_type}</td>
                <td>${capacityText}</td>
                <td>${odometerText}</td>
                <td>${acqCostText}</td>
                <td><span class="badge-status ${statusClass}">${statusText}</span></td>
                <td class="text-right">
                    <div class="actions-group">
                        <button class="btn-action" onclick="openEditModal(${vehicle.id})">Edit</button>
                        <button class="btn-action delete" onclick="deleteVehicle(${vehicle.id}, '${vehicle.registration_no}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}


// ---- Helper Formatter Functions ----

/**
 * Format capacity nicely depending on the type of vehicle.
 */
function formatCapacity(val, type) {
    const num = parseFloat(val) || 0;
    if (type === 'bus') {
        return `${num} seats`;
    }
    return `${num} Ton`;
}

/**
 * Formats database status strings to look human-readable.
 */
function formatStatusText(status) {
    const statusMap = {
        'available': 'Available',
        'active': 'On Trip',
        'maintenance': 'In Shop',
        'inactive': 'Retired'
    };
    return statusMap[status] || status;
}

/**
 * Maps DB status key to style class name.
 */
function getStatusClass(status) {
    const map = {
        'available': 'available',
        'active': 'active',
        'maintenance': 'maintenance',
        'inactive': 'inactive'
    };
    return map[status] || 'available';
}

/**
 * Formats roles for badge display.
 */
function formatRoleName(role) {
    const map = {
        'fleet_manager': 'Fleet Mgr',
        'dispatcher': 'Dispatcher',
        'safety_officer': 'Safety Off.',
        'financial_analyst': 'Finance'
    };
    return map[role] || role;
}


// ---- Event Listeners & Filters ----

function setupFilters() {
    // bind filter changes to reload list
    document.getElementById('filterType').addEventListener('change', loadVehicles);
    document.getElementById('filterStatus').addEventListener('change', loadVehicles);

    // debounce input search to avoid hammering the DB
    let debounceTimer;
    document.getElementById('searchRegNo').addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadVehicles, 300);
    });
}


// ---- Add / Edit Vehicle Modal Dialog Logic ----

function setupModalEvents() {
    const modal = document.getElementById('vehicleModal');
    const addBtn = document.getElementById('btnAddVehicle');
    const closeBtn = document.getElementById('btnModalClose');
    const cancelBtn = document.getElementById('btnCancel');
    const form = document.getElementById('vehicleForm');

    // open modal on "Add Vehicle" click
    addBtn.addEventListener('click', () => {
        document.getElementById('modalTitle').textContent = 'Add New Vehicle';
        document.getElementById('vehicleId').value = '';
        form.reset();
        
        // set default dropdown value
        document.getElementById('status').value = 'available';
        
        modal.classList.add('open');
    });

    // close modal events
    const closeModal = () => modal.classList.remove('open');
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // close on clicking modal backdrop
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // handle form submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('vehicleId').value;
        const body = {
            registration_no: document.getElementById('regNo').value.trim(),
            model: document.getElementById('vehicleModel').value.trim(),
            vehicle_type: document.getElementById('vehicleType').value,
            capacity: parseFloat(document.getElementById('capacity').value),
            current_mileage: parseFloat(document.getElementById('odometer').value),
            acquisition_cost: parseFloat(document.getElementById('acqCost').value),
            status: document.getElementById('status').value,
            fuel_type: document.getElementById('fuelType').value
        };

        const url = id ? `${API_BASE}/vehicles/${id}` : `${API_BASE}/vehicles`;
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                closeModal();
                loadVehicles();
            } else {
                alert(data.message || 'Failed to save vehicle details.');
            }

        } catch (err) {
            console.error('Error saving vehicle:', err);
            alert('Failed to connect to the server.');
        }
    });
}


/**
 * Populates and opens the modal to edit an existing vehicle.
 */
window.openEditModal = function(id) {
    const vehicle = vehiclesList.find(v => v.id === id);
    if (!vehicle) return;

    document.getElementById('modalTitle').textContent = 'Edit Vehicle';
    document.getElementById('vehicleId').value = vehicle.id;
    document.getElementById('regNo').value = vehicle.registration_no;
    document.getElementById('vehicleModel').value = vehicle.model || '';
    document.getElementById('vehicleType').value = vehicle.vehicle_type;
    document.getElementById('capacity').value = vehicle.capacity;
    document.getElementById('odometer').value = vehicle.current_mileage;
    document.getElementById('acqCost').value = vehicle.acquisition_cost || '';
    document.getElementById('status').value = vehicle.status;
    document.getElementById('fuelType').value = vehicle.fuel_type || 'diesel';

    document.getElementById('vehicleModal').classList.add('open');
};


/**
 * Sends delete request to the API after user confirmation.
 */
window.deleteVehicle = async function(id, regNo) {
    const confirmed = confirm(`Are you sure you want to delete vehicle ${regNo} from the registry?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/vehicles/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            loadVehicles();
        } else {
            alert(data.message || 'Failed to delete vehicle.');
        }
    } catch (err) {
        console.error('Error deleting vehicle:', err);
        alert('Server connection error.');
    }
};


// ---- Mobile Sidebar Navigation Toggle ----

function setupSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggleBtn = document.getElementById('menuToggleBtn');

    if (!toggleBtn || !sidebar || !overlay) return;

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('visible');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
    });
}


// ---- Logout ----

function logout() {
    localStorage.removeItem('transitops_token');
    localStorage.removeItem('transitops_user');
    window.location.href = '/';
}
