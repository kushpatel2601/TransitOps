/**
 * server/controllers/dashboardController.js
 * -------------------------------------------------
 * Aggregates data for the dashboard overview page.
 * 
 * Returns KPI stats (vehicle counts, trip counts, driver
 * counts, fleet utilization) plus recent trips and 
 * vehicle status breakdown — all in a single API call
 * to keep the frontend snappy.
 * -------------------------------------------------
 */

const db = require('../config/database');


/**
 * GET /api/dashboard/stats
 * 
 * Pulls together all the numbers shown on the dashboard:
 *  - Active / available / in-maintenance vehicle counts
 *  - Active / pending trip counts
 *  - Drivers currently on duty
 *  - Fleet utilization percentage
 *  - Recent trips with vehicle + driver names
 *  - Vehicle status breakdown for the chart
 */
async function getDashboardStats(req, res) {
    try {
        // run all the queries at the same time — they're independent
        // so there's no reason to wait for one before starting the next
        const [
            vehicleCounts,
            tripCounts,
            driverCount,
            recentTrips,
            vehicleStatusBreakdown
        ] = await Promise.all([
            getVehicleCounts(),
            getTripCounts(),
            getDriversOnDuty(),
            getRecentTrips(),
            getVehicleStatusBreakdown()
        ]);

        // figure out fleet utilization — what % of active vehicles are actually on a trip
        const totalActive = vehicleCounts.active || 0;
        const onTrip = vehicleStatusBreakdown.find(s => s.status === 'on_trip');
        const onTripCount = onTrip ? parseInt(onTrip.count) : 0;
        const utilization = totalActive > 0 
            ? Math.round((onTripCount / totalActive) * 100) 
            : 0;

        res.json({
            success: true,
            data: {
                kpis: {
                    activeVehicles: vehicleCounts.active,
                    availableVehicles: vehicleCounts.available,
                    inMaintenance: vehicleCounts.maintenance,
                    activeTrips: tripCounts.active,
                    pendingTrips: tripCounts.pending,
                    driversOnDuty: driverCount,
                    fleetUtilization: utilization
                },
                recentTrips: recentTrips,
                vehicleStatus: vehicleStatusBreakdown
            }
        });

    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard data.'
        });
    }
}


// ---- Helper queries (keep them small and focused) ----

/**
 * Count vehicles grouped by their current status
 */
async function getVehicleCounts() {
    const result = await db.query(`
        SELECT 
            COUNT(*) FILTER (WHERE status = 'active')      AS active,
            COUNT(*) FILTER (WHERE status = 'available')    AS available,
            COUNT(*) FILTER (WHERE status = 'maintenance')  AS maintenance
        FROM vehicles
    `);

    const row = result.rows[0];
    return {
        active: parseInt(row.active) || 0,
        available: parseInt(row.available) || 0,
        maintenance: parseInt(row.maintenance) || 0
    };
}

/**
 * Count trips — active ones (in_progress) and pending (scheduled)
 */
async function getTripCounts() {
    const result = await db.query(`
        SELECT 
            COUNT(*) FILTER (WHERE status = 'in_progress')  AS active,
            COUNT(*) FILTER (WHERE status = 'scheduled')    AS pending
        FROM trips
    `);

    const row = result.rows[0];
    return {
        active: parseInt(row.active) || 0,
        pending: parseInt(row.pending) || 0
    };
}

/**
 * Count drivers who are currently on an active trip
 * (their driver_id shows up in an in_progress trip)
 */
async function getDriversOnDuty() {
    const result = await db.query(`
        SELECT COUNT(DISTINCT driver_id) AS count
        FROM trips
        WHERE status = 'in_progress' AND driver_id IS NOT NULL
    `);

    return parseInt(result.rows[0].count) || 0;
}

/**
 * Grab the most recent trips with vehicle and driver info joined in.
 * We limit to 10 — the dashboard only shows a handful anyway.
 */
async function getRecentTrips() {
    const result = await db.query(`
        SELECT 
            t.id,
            t.status,
            t.departure_time,
            t.arrival_time,
            t.actual_departure,
            t.actual_arrival,
            t.notes,
            v.registration_no AS vehicle_reg,
            v.vehicle_type,
            d.full_name AS driver_name,
            r.route_name
        FROM trips t
        LEFT JOIN vehicles v ON t.vehicle_id = v.id
        LEFT JOIN drivers d  ON t.driver_id  = d.id
        LEFT JOIN routes r   ON t.route_id   = r.id
        ORDER BY t.created_at DESC
        LIMIT 10
    `);

    return result.rows;
}

/**
 * Vehicle status breakdown for the horizontal bar chart.
 * Groups vehicles by status and counts each group.
 */
async function getVehicleStatusBreakdown() {
    const result = await db.query(`
        SELECT status, COUNT(*) AS count
        FROM vehicles
        GROUP BY status
        ORDER BY count DESC
    `);

    return result.rows;
}


module.exports = { getDashboardStats };
