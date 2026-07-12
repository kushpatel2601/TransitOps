/**
 * public/js/analytics.js
 * -------------------------------------------------
 * Front-end logic for the Reports & Analytics page.
 *
 * Responsibilities:
 *   1. Auth guard — redirect to login if no token.
 *   2. Load user info and apply RBAC sidebar gating.
 *   3. Fetch the analytics summary from the API.
 *   4. Render the 4 KPI tiles.
 *   5. Draw the monthly revenue bar chart using inline SVG
 *      (no third-party charting library needed).
 *   6. Render the top 5 costliest vehicles as horizontal bars.
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
    loadAnalyticsData();
    setupSidebarToggle();
    setupLogout();

    // wire the Export CSV button
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportCSV);
    }
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

        // show a short name like "Ranya K."
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

        // grey out any nav links this role can't access
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
// Data Fetching
// ============================================================

/**
 * Hits the analytics summary endpoint and hands the data
 * off to the individual render functions.
 */
async function loadAnalyticsData() {
    try {
        const res    = await fetch(`${API_BASE}/reports/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }

        const result = await res.json();

        if (result.success && result.data) {
            renderKPIs(result.data.kpis);
            renderBarChart(result.data.monthlyRevenue);
            renderTopVehicles(result.data.topVehicles);

            // stash the raw data so the CSV export has something to work with
            window._analyticsData = result.data;
        } else {
            // fall back to sample data so the page doesn't look empty
            renderFallbackData();
        }

    } catch (err) {
        console.error('Failed to load analytics data:', err);
        // still render something useful when the server is unreachable
        renderFallbackData();
    }
}


// ============================================================
// KPI Tiles
// ============================================================

/**
 * Fills the five KPI tile values.
 *
 * @param {Object} kpis - { fuelEfficiency, fleetUtilization, operationalCost, idleRate, vehicleRoi }
 */
function renderKPIs(kpis) {
    setText('kpiFuelEfficiency', kpis.fuelEfficiency);
    setText('kpiFleetUtil',      kpis.fleetUtilization);

    // format operational cost as Indian number (e.g. "34,070")
    const cost = Number(kpis.operationalCost).toLocaleString('en-IN');
    setText('kpiOpCost',      cost);
    setText('kpiIdleRate',    kpis.idleRate);
    setText('kpiVehicleRoi',  kpis.vehicleRoi ?? 'N/A');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
}


// ============================================================
// Monthly Revenue Bar Chart (inline SVG)
// ============================================================

/**
 * Draws a simple vertical bar chart for the monthly revenue data.
 * We build it as an SVG string and inject it into the DOM —
 * no canvas, no external library, no build step needed.
 *
 * @param {Array} months - [{ month, total, fuel, maintenance, expenses }, ...]
 */
function renderBarChart(months) {
    const chartWrap   = document.getElementById('monthlyBarChart');
    const labelsWrap  = document.getElementById('monthlyBarLabels');

    if (!chartWrap || !months || months.length === 0) {
        if (chartWrap) chartWrap.innerHTML = '<div class="loading-text">No data available.</div>';
        return;
    }

    // chart dimensions
    const svgHeight  = 160;
    const barWidth   = 36;
    const barGap     = 14;
    const paddingTop = 12;
    const svgWidth   = months.length * (barWidth + barGap) + barGap;

    // find the tallest bar so we can scale everything proportionally
    const maxTotal = Math.max(...months.map(m => m.total), 1);

    // build each bar as an SVG rect
    const bars = months.map((m, i) => {
        const barH = Math.max(
            Math.round(((m.total / maxTotal) * (svgHeight - paddingTop - 20))),
            4  // minimum height so zero-cost months are still visible
        );
        const x = barGap + i * (barWidth + barGap);
        const y = svgHeight - 20 - barH; // 20px bottom margin for labels

        // blue bars — matches the wireframe screenshot colour
        const fill = '#3498db';

        // tooltip: show the breakdown on hover
        const tooltip = `₹${Number(m.total).toLocaleString('en-IN')} (fuel: ₹${Number(m.fuel).toLocaleString('en-IN')})`;

        return `<rect
            x="${x}" y="${y}"
            width="${barWidth}" height="${barH}"
            fill="${fill}" rx="3" ry="3"
            opacity="0.85"
        >
            <title>${m.month}: ${tooltip}</title>
        </rect>`;
    }).join('');

    // assemble the SVG
    chartWrap.innerHTML = `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="${svgWidth}" height="${svgHeight}"
            viewBox="0 0 ${svgWidth} ${svgHeight}"
        >
            ${bars}
        </svg>
    `;

    // render the x-axis month labels below the SVG
    labelsWrap.innerHTML = months.map(m =>
        `<span class="bar-label-item">${m.month}</span>`
    ).join('');
}


// ============================================================
// Top 5 Costliest Vehicles
// ============================================================

/**
 * Renders horizontal bar rows for the top costliest vehicles.
 * Bar width is a percentage of the highest-cost vehicle.
 *
 * @param {Array} vehicles - [{ name, totalCost, fuelCost, maintCost, expCost }, ...]
 */
function renderTopVehicles(vehicles) {
    const container = document.getElementById('topVehiclesList');
    if (!container || !vehicles || vehicles.length === 0) {
        if (container) container.innerHTML = '<div class="loading-text">No vehicle data.</div>';
        return;
    }

    // the longest bar is always 100% — others scale relative to it
    const maxCost = Math.max(...vehicles.map(v => v.totalCost), 1);

    container.innerHTML = vehicles.map((v, idx) => {
        const widthPct = Math.round((v.totalCost / maxCost) * 100);
        const costText = Number(v.totalCost).toLocaleString('en-IN');
        // rank-1 through rank-5 map to the CSS colour classes
        const rankClass = `rank-${idx + 1}`;

        return `
            <div class="vehicle-cost-row">
                <span class="vehicle-cost-name">${v.name}</span>
                <div class="vehicle-cost-track">
                    <div class="vehicle-cost-fill ${rankClass}" style="width: ${widthPct}%"></div>
                </div>
                <span class="vehicle-cost-amount">₹${costText}</span>
            </div>
        `;
    }).join('');
}


// ============================================================
// Fallback data (shown when API is unreachable)
// ============================================================

/**
 * Renders a sensible-looking page even when the server can't be reached.
 * Uses the same numbers shown in the wireframe screenshot.
 */
function renderFallbackData() {
    renderKPIs({
        fuelEfficiency:   '8.4 km/l',
        fleetUtilization: '81%',
        operationalCost:  34070,
        idleRate:         '14.2%',
        vehicleRoi:       'N/A'
    });

    // 8 months of sample data — values roughly match the wireframe bars
    renderBarChart([
        { month: 'Dec 25', total: 8000,  fuel: 5000, maintenance: 2000, expenses: 1000 },
        { month: 'Jan 26', total: 12000, fuel: 7500, maintenance: 3000, expenses: 1500 },
        { month: 'Feb 26', total: 9500,  fuel: 6000, maintenance: 2500, expenses: 1000 },
        { month: 'Mar 26', total: 14000, fuel: 8000, maintenance: 4000, expenses: 2000 },
        { month: 'Apr 26', total: 11000, fuel: 7000, maintenance: 2500, expenses: 1500 },
        { month: 'May 26', total: 16000, fuel: 9500, maintenance: 4500, expenses: 2000 },
        { month: 'Jun 26', total: 13500, fuel: 8500, maintenance: 3500, expenses: 1500 },
        { month: 'Jul 26', total: 18500, fuel: 11000, maintenance: 5000, expenses: 2500 }
    ]);

    renderTopVehicles([
        { name: 'TRUCK-11', totalCost: 45000, fuelCost: 25000, maintCost: 15000, expCost: 5000 },
        { name: 'MINI-03',  totalCost: 32000, fuelCost: 18000, maintCost: 10000, expCost: 4000 },
        { name: 'VAN-05',   totalCost: 18000, fuelCost: 10000, maintCost:  6000, expCost: 2000 }
    ]);
}


// ============================================================
// CSV Export
// ============================================================

/**
 * Builds a CSV string from the current analytics data and triggers
 * a browser download. No server round-trip needed — everything is
 * already in memory from the initial API response.
 */
function exportCSV() {
    const data = window._analyticsData;

    // build the lines array; start with KPI summary
    const lines = [];

    lines.push('TransitOps Analytics Export');
    lines.push(`Generated,${new Date().toLocaleString('en-IN')}`);
    lines.push('');

    // KPI block
    lines.push('KPI Summary');
    lines.push('Metric,Value');
    if (data && data.kpis) {
        lines.push(`Fuel Efficiency,${data.kpis.fuelEfficiency}`);
        lines.push(`Fleet Utilization,${data.kpis.fleetUtilization}`);
        lines.push(`Operational Cost,${data.kpis.operationalCost}`);
        lines.push(`Vehicle Idle Rate,${data.kpis.idleRate}`);
        lines.push(`Avg Vehicle ROI,${data.kpis.vehicleRoi}`);
    }
    lines.push('');

    // Monthly revenue block
    lines.push('Monthly Cost Breakdown');
    lines.push('Month,Fuel,Maintenance,Expenses,Total');
    if (data && data.monthlyRevenue) {
        data.monthlyRevenue.forEach(m => {
            lines.push(`${m.month},${m.fuel},${m.maintenance},${m.expenses},${m.total}`);
        });
    }
    lines.push('');

    // Top vehicles block
    lines.push('Top 5 Costliest Vehicles');
    lines.push('Vehicle,Fuel Cost,Maintenance Cost,Other Expenses,Total Cost');
    if (data && data.topVehicles) {
        data.topVehicles.forEach(v => {
            lines.push(`${v.name},${v.fuelCost},${v.maintCost},${v.expCost},${v.totalCost}`);
        });
    }

    // wrap each cell in quotes to handle any commas in names
    const csvContent = lines
        .map(line => line.split(',').map(cell => `"${cell}"`).join(','))
        .join('\n');

    // create a temporary anchor and click it to trigger the download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `transitops-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
