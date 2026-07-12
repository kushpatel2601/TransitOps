/**
 * dashboard.js — Dashboard page logic
 * -------------------------------------------------
 * Handles:
 *  1. Authentication check (redirect if not logged in)
 *  2. Loading user info into the top bar
 *  3. Fetching dashboard stats from the API
 *  4. Rendering KPI cards, recent trips table,
 *     and vehicle status bar chart
 *  5. RBAC — hiding sidebar links based on permissions
 *  6. Mobile sidebar toggle
 *  7. Logout
 * -------------------------------------------------
 */

// ---- Auth check ----
// if there's no token, the user hasn't logged in yet
const token = localStorage.getItem('transitops_token');
const userData = localStorage.getItem('transitops_user');

if (!token || !userData) {
    window.location.href = '/';
}

// API base url — same origin
const API_BASE = window.location.origin + '/api';


// ---- Bootstrap the page once DOM is ready ----

document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadDashboardData();
    setupSidebarToggle();
    setupLogout();
});


/**
 * Parse stored user data and populate the top bar.
 * Also handles RBAC — dims out sidebar links the user
 * doesn't have permission to access.
 */
function loadUserInfo() {
    try {
        const user = JSON.parse(userData);

        // show user name in the top bar
        const nameEl = document.getElementById('userName');
        if (nameEl) {
            // show abbreviated name like "Raven K." to match the wireframe
            const parts = (user.fullName || 'User').split(' ');
            const shortName = parts.length > 1
                ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
                : parts[0];
            nameEl.textContent = shortName;
        }

        // show role badge with formatted name
        const badgeEl = document.getElementById('roleBadge');
        if (badgeEl) {
            const roleDisplay = formatRoleName(user.role || '');
            badgeEl.textContent = roleDisplay;
        }

        // RBAC — dim sidebar links user can't access
        if (user.permissions) {
            const navLinks = document.querySelectorAll('.nav-link[data-module]');
            navLinks.forEach(link => {
                const module = link.getAttribute('data-module');
                // dashboard is always accessible
                if (module !== 'dashboard' && user.permissions[module] === false) {
                    link.style.opacity = '0.3';
                    link.style.pointerEvents = 'none';
                    link.title = 'You do not have access to this module';
                }
            });
        }

    } catch (err) {
        console.error('Error loading user data:', err);
    }
}


/**
 * Fetch dashboard stats from the API and render everything.
 * The API returns KPIs, recent trips, and vehicle status
 * all in one response to keep it fast.
 */
async function loadDashboardData() {
    try {
        const response = await fetch(`${API_BASE}/dashboard/stats`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // if the token is expired or invalid, go back to login
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('transitops_token');
            localStorage.removeItem('transitops_user');
            window.location.href = '/';
            return;
        }

        const result = await response.json();

        if (result.success && result.data) {
            renderKPIs(result.data.kpis);
            renderRecentTrips(result.data.recentTrips);
            renderVehicleStatus(result.data.vehicleStatus);
        } else {
            console.warn('Dashboard API returned no data, using fallback values');
            renderFallbackData();
        }

    } catch (err) {
        // network error or server down — show sample data so the UI isn't empty
        console.error('Failed to fetch dashboard data:', err);
        renderFallbackData();
    }
}


/**
 * Populate the 7 KPI cards with actual numbers.
 * Pads single-digit numbers with a leading zero to match the design.
 */
function renderKPIs(kpis) {
    setKPI('kpiActiveVehicles', kpis.activeVehicles);
    setKPI('kpiAvailableVehicles', kpis.availableVehicles);
    setKPI('kpiInMaintenance', kpis.inMaintenance, true);
    setKPI('kpiActiveTrips', kpis.activeTrips);
    setKPI('kpiPendingTrips', kpis.pendingTrips, true);
    setKPI('kpiDriversOnDuty', kpis.driversOnDuty);

    // utilization gets a percentage sign
    const utilEl = document.getElementById('kpiUtilization');
    if (utilEl) {
        utilEl.textContent = `${kpis.fleetUtilization}%`;
    }
}

/**
 * Set a single KPI card value.
 * Numbers under 10 get a leading zero (e.g. "05") to match the wireframe.
 */
function setKPI(elementId, value, padZero = false) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const num = parseInt(value) || 0;
    el.textContent = padZero && num < 10 ? `0${num}` : num.toString();
}


/**
 * Render the recent trips table.
 * Each row shows trip ID, vehicle registration, driver name,
 * a colored status badge, and an ETA.
 */
function renderRecentTrips(trips) {
    const tbody = document.getElementById('recentTripsBody');
    if (!tbody) return;

    // no trips? show a message
    if (!trips || trips.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-text">No trips found.</td></tr>';
        return;
    }

    tbody.innerHTML = trips.map(trip => {
        // generate a short trip ID like "TR001"
        const tripId = `TR${String(trip.id).padStart(3, '0')}`;

        // vehicle registration or dash if not assigned
        const vehicle = trip.vehicle_reg || '—';

        // driver name or dash if unassigned
        const driver = trip.driver_name || '—';

        // format the status for display
        const statusClass = getStatusClass(trip.status);
        const statusText = formatStatus(trip.status);

        // calculate ETA — for active trips, show time remaining
        const eta = calculateETA(trip);

        return `
            <tr>
                <td class="trip-id">${tripId}</td>
                <td>${vehicle}</td>
                <td>${driver}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="eta-text">${eta}</td>
            </tr>
        `;
    }).join('');
}


/**
 * Render the vehicle status horizontal bar chart.
 * Each status gets a colored bar whose width is proportional
 * to the total number of vehicles.
 */
function renderVehicleStatus(statuses) {
    const container = document.getElementById('vehicleStatusBars');
    if (!container) return;

    if (!statuses || statuses.length === 0) {
        container.innerHTML = '<div class="loading-text">No vehicle data.</div>';
        return;
    }

    // figure out the max count so we can scale the bars
    const maxCount = Math.max(...statuses.map(s => parseInt(s.count)));

    // map DB status names to nice display labels
    const labelMap = {
        'available': 'Available',
        'active': 'On Trip',
        'on_trip': 'On Trip',
        'maintenance': 'In Shop',
        'in_shop': 'In Shop',
        'retired': 'Retired',
        'inactive': 'Retired'
    };

    container.innerHTML = statuses.map(s => {
        const label = labelMap[s.status] || s.status;
        const count = parseInt(s.count);
        const widthPercent = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;

        return `
            <div class="status-bar-row">
                <span class="status-bar-label">${label}</span>
                <div class="status-bar-track">
                    <div class="status-bar-fill ${s.status}" style="width: ${widthPercent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}


// ---- Helper functions ----

/**
 * Map trip status to a CSS class for the colored badge.
 */
function getStatusClass(status) {
    const classMap = {
        'in_progress': 'on-trip',
        'completed': 'completed',
        'scheduled': 'dispatched',
        'cancelled': 'cancelled',
        'delayed': 'delayed'
    };
    return classMap[status] || 'draft';
}

/**
 * Format a trip status for display.
 * e.g. "in_progress" → "On Trip"
 */
function formatStatus(status) {
    const displayMap = {
        'in_progress': 'On Trip',
        'completed': 'Completed',
        'scheduled': 'Dispatched',
        'cancelled': 'Cancelled',
        'delayed': 'Delayed'
    };
    return displayMap[status] || 'Draft';
}

/**
 * Calculate a human-readable ETA for a trip.
 * Active trips show remaining time, completed trips show "—".
 */
function calculateETA(trip) {
    if (trip.status === 'completed') return '—';
    if (!trip.arrival_time) return 'Awaiting vehicle';

    const now = new Date();
    const arrival = new Date(trip.arrival_time);
    const diffMs = arrival - now;

    // if ETA is in the past, trip is overdue
    if (diffMs <= 0) return 'Overdue';

    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} min`;
    
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
}

/**
 * Format a role name for display.
 * "fleet_manager" → "Fleet Mgr"
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


/**
 * Show sample/fallback data when the API is unreachable.
 * This way the dashboard doesn't look broken during development.
 */
function renderFallbackData() {
    // sample KPIs matching the wireframe
    renderKPIs({
        activeVehicles: 53,
        availableVehicles: 42,
        inMaintenance: 5,
        activeTrips: 18,
        pendingTrips: 9,
        driversOnDuty: 26,
        fleetUtilization: 81
    });

    // sample trips matching the wireframe
    renderRecentTrips([
        { id: 1, vehicle_reg: 'VAN-05', driver_name: 'Alex', status: 'in_progress', arrival_time: new Date(Date.now() + 45 * 60000).toISOString() },
        { id: 2, vehicle_reg: 'TRK-12', driver_name: 'John', status: 'completed', arrival_time: null },
        { id: 3, vehicle_reg: 'MINI-09', driver_name: 'Priya', status: 'scheduled', arrival_time: new Date(Date.now() + 70 * 60000).toISOString() },
        { id: 4, vehicle_reg: null, driver_name: null, status: 'draft', arrival_time: null }
    ]);

    // sample vehicle status
    renderVehicleStatus([
        { status: 'available', count: 30 },
        { status: 'active', count: 18 },
        { status: 'maintenance', count: 5 },
        { status: 'retired', count: 3 }
    ]);
}


// ---- Sidebar toggle (mobile) ----

function setupSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggleBtn = document.getElementById('menuToggleBtn');

    if (!toggleBtn || !sidebar || !overlay) return;

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('visible');
    });

    // close when clicking the backdrop
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
    });

    // close when clicking any nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('visible');
        });
    });
}


// ---- Logout ----

function setupLogout() {
    // no logout button in the new layout — role badge area
    // but we'll add a click handler on the brand for "back to login"
    // and listen for any element with id logoutBtn if it exists
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('transitops_token');
            localStorage.removeItem('transitops_user');
            window.location.href = '/';
        });
    }
}
