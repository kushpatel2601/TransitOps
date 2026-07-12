/**
 * public/js/drivers.js
 * -------------------------------------------------
 * Front-end logic for the Drivers & Safety page.
 * 
 * Handles:
 *  1. JWT authentication check and RBAC sidebar setup.
 *  2. Fetching and listing drivers (ordered by creation date).
 *  3. Dynamic license expiry alerts (appending "EXPIRED" in red).
 *  4. Computing status based on DB status and active trips:
 *     - 'suspended' -> Suspended (orange badge)
 *     - 'on_leave' -> Off Duty (grey badge)
 *     - 'active' + in_progress/dispatched trip -> On Trip (blue badge)
 *     - 'active' + otherwise -> Available (green badge)
 *  5. Aggregating totals badges at the bottom of the table.
 *  6. Add, edit, and delete actions with a custom modal.
 *  7. Client-side search filtering.
 * -------------------------------------------------
 */

// check authentication
const token = localStorage.getItem('transitops_token');
const userData = localStorage.getItem('transitops_user');

if (!token || !userData) {
    window.location.href = '/';
}

const API_BASE = window.location.origin + '/api';

// page state
let driversList = [];
let tripsList = [];
let editingDriverId = null;


// ---- Page Initialization ----
document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadPageData();
    setupEvents();
});


/**
 * Parse logged-in user data and populate top bar name and role.
 * Restricts sidebar menu items based on user permissions.
 */
function loadUserInfo() {
    try {
        const user = JSON.parse(userData);

        // username display
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

        // RBAC sidebar gating
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
        console.error('Error parsing user info:', err);
    }
}


/**
 * Fetch drivers and trips from API concurrently, then render the table.
 * Triplist is used to check if any driver is currently "On Trip".
 */
async function loadPageData() {
    const tbody = document.getElementById('driverTableBody');
    if (!tbody) return;

    try {
        // Fetch drivers and trips in parallel
        const [driversRes, tripsRes] = await Promise.all([
            fetch(`${API_BASE}/drivers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${API_BASE}/trips`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        // check session status
        if (driversRes.status === 401 || driversRes.status === 403 || tripsRes.status === 401 || tripsRes.status === 403) {
            logout();
            return;
        }

        const driversData = await driversRes.json();
        const tripsData = await tripsRes.json();

        if (driversData.success && tripsData.success) {
            driversList = driversData.data;
            tripsList = tripsData.data;
            renderDriverTable(driversList);
            renderTotals(driversList);
        } else {
            tbody.innerHTML = '<tr><td colspan="9" class="loading-text">Could not load drivers.</td></tr>';
        }

    } catch (err) {
        console.error('Failed to load drivers page data:', err);
        tbody.innerHTML = '<tr><td colspan="9" class="loading-text">Network error. Please try again.</td></tr>';
    }
}


/**
 * Render drivers list to the HTML table.
 */
function renderDriverTable(drivers) {
    const tbody = document.getElementById('driverTableBody');
    if (!tbody) return;

    if (drivers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-text">No drivers found.</td></tr>';
        return;
    }

    tbody.innerHTML = drivers.map(driver => {
        // format license category (LMV / HMV)
        const category = driver.license_category || 'LMV';

        // format license expiry and show a red alert if expired
        const expiryText = formatLicenseExpiry(driver.license_expiry);

        // phone formatting (show seeded numbers like 9876500000)
        const phone = driver.phone || '—';

        // trip completion rate (percentage suffix)
        const completionRate = driver.trip_completion_rate !== null && driver.trip_completion_rate !== undefined
            ? `${Math.round(driver.trip_completion_rate)}%`
            : '100%';

        // safety score color highlights
        const safetyScore = parseFloat(driver.safety_score || 100);
        let safetyScoreClass = 'safety-high';
        if (safetyScore < 70) {
            safetyScoreClass = 'safety-low';
        } else if (safetyScore < 90) {
            safetyScoreClass = 'safety-mid';
        }
        const safetyScoreText = `${safetyScore}%`;

        // compute driver statuses dynamically
        const computedStatus = getComputedDriverStatus(driver);
        const statusBadge = getStatusBadgeHTML(computedStatus);
        
        // Safety column displays driver state too (Available/On Trip/Suspended)
        const safetyBadge = getSafetyBadgeHTML(computedStatus);

        return `
            <tr data-id="${driver.id}">
                <td style="font-weight: 600; color: var(--text-primary);">${driver.full_name}</td>
                <td>${driver.license_no}</td>
                <td style="font-weight: 500;">${category}</td>
                <td>${expiryText}</td>
                <td>${phone}</td>
                <td style="font-weight: 500;">${completionRate}</td>
                <td>${safetyBadge}</td>
                <td>${statusBadge}</td>
                <td class="text-right">
                    <button class="btn-edit-row" onclick="editDriver(${driver.id})" title="Edit Profile">✏️</button>
                    <button class="btn-delete-row" onclick="confirmDeleteDriver(${driver.id}, '${driver.full_name.replace(/'/g, "\\'")}')" title="Remove Driver">❌</button>
                </td>
            </tr>
        `;
    }).join('');
}


/**
 * Helper to compute status of a driver based on status field and current trip bookings.
 */
function getComputedDriverStatus(driver) {
    if (driver.status === 'suspended') return 'suspended';
    if (driver.status === 'on_leave') return 'on_leave';

    // check if driver is currently assigned to an active trip
    const activeTrip = tripsList.find(t => 
        t.driver_id === driver.id && 
        (t.status === 'in_progress' || t.status === 'dispatched')
    );

    return activeTrip ? 'on_trip' : 'active';
}


/**
 * Render dynamic badge for the main STATUS column.
 */
function getStatusBadgeHTML(status) {
    switch (status) {
        case 'active':
            return '<span class="status-badge badge-available">Available</span>';
        case 'on_trip':
            return '<span class="status-badge badge-on-trip">On Trip</span>';
        case 'on_leave':
            return '<span class="status-badge badge-off-duty">Off Duty</span>';
        case 'suspended':
            return '<span class="status-badge badge-suspended">Suspended</span>';
        default:
            return '<span class="status-badge badge-off-duty">Off Duty</span>';
    }
}


/**
 * Render dynamic badge for the SAFETY compliance column.
 * Matches wireframe badges: John -> Suspended, Priya -> On Trip, Suresh/Alex -> Available.
 */
function getSafetyBadgeHTML(status) {
    switch (status) {
        case 'active':
        case 'on_leave':
            return '<span class="status-badge badge-available">Available</span>';
        case 'on_trip':
            return '<span class="status-badge badge-on-trip">On Trip</span>';
        case 'suspended':
            return '<span class="status-badge badge-suspended">Suspended</span>';
        default:
            return '<span class="status-badge badge-available">Available</span>';
    }
}


/**
 * Formats license expiry dates to look clean and shows red warning text if expired.
 */
function formatLicenseExpiry(dateString) {
    if (!dateString) return '—';
    
    const expiryDate = new Date(dateString);
    const now = new Date();
    
    // Format to MM/YYYY (e.g. 12/2029)
    const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
    const year = expiryDate.getFullYear();
    const formatted = `${month}/${year}`;

    // check if expiry is in past
    if (expiryDate < now) {
        return `<span class="license-expired">${formatted} EXPIRED</span>`;
    }
    return `<span class="license-valid">${formatted}</span>`;
}


/**
 * Calculate counts for status totals badges shown at the bottom of the page.
 */
function renderTotals(drivers) {
    const container = document.getElementById('totalsRow');
    if (!container) return;

    const counts = {
        available: 0,
        on_trip: 0,
        off_duty: 0,
        suspended: 0
    };

    drivers.forEach(driver => {
        const computed = getComputedDriverStatus(driver);
        if (computed === 'active') counts.available++;
        else if (computed === 'on_trip') counts.on_trip++;
        else if (computed === 'on_leave') counts.off_duty++;
        else if (computed === 'suspended') counts.suspended++;
    });

    container.innerHTML = `
        <span class="totals-label">TOGGLE STAT</span>
        <span class="totals-badge badge-available">Available: ${counts.available}</span>
        <span class="totals-badge badge-on-trip">On Trip: ${counts.on_trip}</span>
        <span class="totals-badge badge-off-duty">Off Duty: ${counts.off_duty}</span>
        <span class="totals-badge badge-suspended">Suspended: ${counts.suspended}</span>
    `;
}


// ---- Modal & CRUD Logic ----

function setupEvents() {
    const btnAdd = document.getElementById('btnAddDriver');
    const modal = document.getElementById('driverModal');
    const btnClose = document.getElementById('btnModalClose');
    const btnCancel = document.getElementById('btnCancel');
    const form = document.getElementById('driverForm');
    const searchInput = document.getElementById('globalSearch');

    if (btnAdd && modal) {
        btnAdd.addEventListener('click', () => {
            editingDriverId = null;
            document.getElementById('modalTitle').textContent = 'Add New Driver';
            form.reset();
            document.getElementById('driverId').value = '';
            modal.classList.add('open');
        });
    }

    const closeModal = () => {
        modal.classList.remove('open');
        editingDriverId = null;
    };

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveDriver();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            const filtered = driversList.filter(d => 
                d.full_name.toLowerCase().includes(query) ||
                d.license_no.toLowerCase().includes(query)
            );
            renderDriverTable(filtered);
        });
    }

    // Sidebar overlay toggle close
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            overlay.classList.remove('visible');
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}


/**
 * Open edit driver modal and prefill inputs.
 */
window.editDriver = function(id) {
    const driver = driversList.find(d => d.id === id);
    if (!driver) return;

    editingDriverId = id;
    document.getElementById('modalTitle').textContent = 'Edit Driver Details';
    document.getElementById('driverId').value = driver.id;
    document.getElementById('driverName').value = driver.full_name;
    document.getElementById('licenseNo').value = driver.license_no;
    document.getElementById('driverPhone').value = driver.phone || '';
    document.getElementById('driverEmail').value = driver.email || '';
    document.getElementById('driverStatus').value = driver.status;
    document.getElementById('safetyScore').value = driver.safety_score || '';

    // expiry date needs formatting to YYYY-MM-DD
    if (driver.license_expiry) {
        const d = new Date(driver.license_expiry);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        document.getElementById('licenseExpiry').value = `${y}-${m}-${day}`;
    } else {
        document.getElementById('licenseExpiry').value = '';
    }

    document.getElementById('driverModal').classList.add('open');
};


/**
 * Save driver details (Create or Update).
 */
async function saveDriver() {
    const id = document.getElementById('driverId').value;
    const data = {
        full_name: document.getElementById('driverName').value.trim(),
        license_no: document.getElementById('licenseNo').value.toUpperCase().trim(),
        phone: document.getElementById('driverPhone').value.trim(),
        email: document.getElementById('driverEmail').value.trim() || null,
        status: document.getElementById('driverStatus').value,
        safety_score: document.getElementById('safetyScore').value || 100,
        license_expiry: document.getElementById('licenseExpiry').value || null
    };

    const isEdit = !!id;
    const url = isEdit ? `${API_BASE}/drivers/${id}` : `${API_BASE}/drivers`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (result.success) {
            document.getElementById('driverModal').classList.remove('open');
            loadPageData();
        } else {
            alert(result.message || 'Error occurred while saving driver details.');
        }

    } catch (err) {
        console.error('Failed to save driver:', err);
        alert('Network error. Driver details could not be saved.');
    }
}


/**
 * Confirm delete and dispatch remove action to database.
 */
window.confirmDeleteDriver = async function(id, name) {
    if (!confirm(`Are you sure you want to remove driver ${name}?`)) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/drivers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await res.json();

        if (result.success) {
            loadPageData();
        } else {
            alert(result.message || 'Failed to remove driver profile.');
        }

    } catch (err) {
        console.error('Failed to delete driver:', err);
        alert('Network error. Driver details could not be removed.');
    }
};


/**
 * Format role name to be shorter for display.
 */
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
