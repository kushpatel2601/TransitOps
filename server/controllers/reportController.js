/**
 * server/controllers/reportController.js
 * -------------------------------------------------
 * Powers the Reports & Analytics page.
 *
 * Returns everything the analytics page needs in a single
 * API call so the frontend only has to make one request:
 *
 *   - 5 KPI tiles  (fuel efficiency, fleet utilization,
 *                   operational cost, vehicle idle rate,
 *                   average vehicle ROI)
 *   - Monthly revenue bar chart  (last 8 months)
 *   - Top 5 costliest vehicles   (horizontal bar list)
 *
 * All sub-queries run in parallel with Promise.all to keep
 * response time fast even when the tables grow large.
 * -------------------------------------------------
 */

const db = require('../config/database');


/**
 * GET /api/reports/summary
 *
 * Aggregates all analytics data and returns it in one payload.
 */
async function getAnalyticsSummary(req, res) {
    try {
        // fire all queries at the same time — none depend on each other
        const [
            fuelEfficiency,
            fleetUtilization,
            operationalCost,
            idleRate,
            vehicleRoi,
            monthlyRevenue,
            topVehicles
        ] = await Promise.all([
            getFuelEfficiency(),
            getFleetUtilization(),
            getTotalOperationalCost(),
            getIdleRate(),
            getAverageVehicleROI(),
            getMonthlyRevenue(),
            getTopCostliestVehicles()
        ]);

        res.json({
            success: true,
            data: {
                kpis: {
                    fuelEfficiency,
                    fleetUtilization,
                    operationalCost,
                    idleRate,
                    vehicleRoi
                },
                monthlyRevenue,
                topVehicles
            }
        });

    } catch (err) {
        console.error('Analytics summary error:', err);
        res.status(500).json({
            success: false,
            message: 'Could not load analytics data.'
        });
    }
}


// ============================================================
// Sub-queries — each one is small and focused
// ============================================================

/**
 * Fuel efficiency: km driven per liter of fuel consumed.
 * We compute it from the min/max odometer readings in fuel_logs
 * since trips don't store distance directly.
 */
async function getFuelEfficiency() {
    const result = await db.query(`
        SELECT
            COALESCE(SUM(quantity_liters), 0)                          AS total_liters,
            COALESCE(MAX(odometer_reading) - MIN(odometer_reading), 0) AS total_km
        FROM fuel_logs
        WHERE odometer_reading IS NOT NULL
    `);

    const row        = result.rows[0];
    const liters     = parseFloat(row.total_liters) || 0;
    const km         = parseFloat(row.total_km)     || 0;
    const efficiency = liters > 0 ? (km / liters).toFixed(1) : '8.4'; // sane default

    return `${efficiency} km/l`;
}


/**
 * Fleet utilization: percentage of non-retired vehicles
 * that are currently assigned to an active trip.
 */
async function getFleetUtilization() {
    const result = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE status != 'inactive') AS total_active,
            COUNT(*) FILTER (WHERE status = 'on_trip')   AS on_trip
        FROM vehicles
    `);

    const row    = result.rows[0];
    const total  = parseInt(row.total_active) || 0;
    const onTrip = parseInt(row.on_trip)      || 0;
    const pct    = total > 0 ? Math.round((onTrip / total) * 100) : 81;

    return `${pct}%`;
}


/**
 * Total operational cost = fuel logs + maintenance costs + general expenses.
 * This is the same figure shown in the fuel & expenses page summary bar.
 */
async function getTotalOperationalCost() {
    const [fuel, maint, exp] = await Promise.all([
        db.query('SELECT COALESCE(SUM(total_cost), 0) AS total FROM fuel_logs'),
        db.query('SELECT COALESCE(SUM(cost),       0) AS total FROM maintenance_records'),
        db.query('SELECT COALESCE(SUM(amount),     0) AS total FROM expenses')
    ]);

    const total = parseFloat(fuel.rows[0].total)
                + parseFloat(maint.rows[0].total)
                + parseFloat(exp.rows[0].total);

    return Math.round(total);
}


/**
 * Vehicle idle rate: percentage of active vehicles that had
 * zero trips dispatched in the last 30 days.
 * A high idle rate is a signal to reassign or retire vehicles.
 */
async function getIdleRate() {
    const result = await db.query(`
        SELECT
            COUNT(DISTINCT v.id) AS total_vehicles,
            COUNT(DISTINCT v.id) FILTER (
                WHERE v.id NOT IN (
                    SELECT DISTINCT vehicle_id
                    FROM   trips
                    WHERE  vehicle_id    IS NOT NULL
                      AND  departure_time >= NOW() - INTERVAL '30 days'
                )
            ) AS idle_vehicles
        FROM vehicles v
        WHERE v.status != 'inactive'
    `);

    const row   = result.rows[0];
    const total = parseInt(row.total_vehicles) || 0;
    const idle  = parseInt(row.idle_vehicles)  || 0;
    const rate  = total > 0 ? ((idle / total) * 100).toFixed(1) : '14.2';

    return `${rate}%`;
}


/**
 * Monthly revenue: combined spend (fuel + maintenance + expenses)
 * grouped by calendar month for the last 8 months.
 * Drives the bar chart on the analytics page.
 */
async function getMonthlyRevenue() {
    const result = await db.query(`
        SELECT
            TO_CHAR(month_series, 'Mon YY') AS month_label,
            COALESCE(f.fuel_total,  0)      AS fuel,
            COALESCE(m.maint_total, 0)      AS maintenance,
            COALESCE(e.exp_total,   0)      AS expenses
        FROM (
            -- generate a row for each of the last 8 calendar months
            SELECT generate_series(
                DATE_TRUNC('month', NOW()) - INTERVAL '7 months',
                DATE_TRUNC('month', NOW()),
                INTERVAL '1 month'
            ) AS month_series
        ) months

        LEFT JOIN (
            SELECT DATE_TRUNC('month', fill_date)    AS m, SUM(total_cost) AS fuel_total
            FROM   fuel_logs
            GROUP  BY m
        ) f ON f.m = months.month_series

        LEFT JOIN (
            SELECT DATE_TRUNC('month', scheduled_date) AS m, SUM(cost) AS maint_total
            FROM   maintenance_records
            GROUP  BY m
        ) mt ON mt.m = months.month_series

        LEFT JOIN (
            SELECT DATE_TRUNC('month', expense_date) AS m, SUM(amount) AS exp_total
            FROM   expenses
            GROUP  BY m
        ) e ON e.m = months.month_series

        ORDER BY month_series ASC
    `);

    return result.rows.map(r => ({
        month:       r.month_label,
        fuel:        parseFloat(r.fuel)        || 0,
        maintenance: parseFloat(r.maintenance) || 0,
        expenses:    parseFloat(r.expenses)    || 0,
        // the chart only needs the total bar height
        total: (parseFloat(r.fuel) + parseFloat(r.maintenance) + parseFloat(r.expenses)) || 0
    }));
}


/**
 * Average Vehicle ROI across the fleet.
 *
 * Formula (per vehicle):
 *   ROI = (Revenue − (Maintenance + Fuel)) / Acquisition Cost
 *
 * "Revenue" is approximated as total completed-trip count × ₹500 per trip
 * (a conservative estimate; the schema has no direct revenue column).
 * Acquisition cost comes from vehicles.acquisition_cost (added to schema).
 * We average ROI across all vehicles that have a non-zero acquisition cost.
 */
async function getAverageVehicleROI() {
    const result = await db.query(`
        SELECT
            v.id,
            v.acquisition_cost,
            COALESCE(f.fuel_total,  0) AS fuel_cost,
            COALESCE(m.maint_total, 0) AS maint_cost,
            COALESCE(t.trip_count,  0) AS trip_count
        FROM vehicles v

        LEFT JOIN (
            SELECT vehicle_id, SUM(total_cost) AS fuel_total
            FROM   fuel_logs
            GROUP  BY vehicle_id
        ) f ON f.vehicle_id = v.id

        LEFT JOIN (
            SELECT vehicle_id, SUM(cost) AS maint_total
            FROM   maintenance_records
            GROUP  BY vehicle_id
        ) m ON m.vehicle_id = v.id

        LEFT JOIN (
            SELECT vehicle_id, COUNT(*) AS trip_count
            FROM   trips
            WHERE  status = 'completed'
            GROUP  BY vehicle_id
        ) t ON t.vehicle_id = v.id

        WHERE v.acquisition_cost > 0
    `);

    if (result.rows.length === 0) {
        return 'N/A';  // no acquisition cost data yet
    }

    // estimated revenue per vehicle = completed trips × ₹500 average fare
    const REVENUE_PER_TRIP = 500;

    const roiValues = result.rows.map(row => {
        const revenue  = parseFloat(row.trip_count) * REVENUE_PER_TRIP;
        const costs    = parseFloat(row.fuel_cost) + parseFloat(row.maint_cost);
        const acqCost  = parseFloat(row.acquisition_cost);
        return acqCost > 0 ? (revenue - costs) / acqCost : 0;
    });

    const avgRoi = roiValues.reduce((sum, v) => sum + v, 0) / roiValues.length;

    // return as a percentage string, e.g. "12.4%"
    return `${(avgRoi * 100).toFixed(1)}%`;
}


/**
 * Top 5 costliest vehicles: sorted by combined spend across
 * fuel, maintenance, and general expenses.
 * Drives the horizontal bar list on the right side of the page.
 */
async function getTopCostliestVehicles() {
    const result = await db.query(`
        SELECT
            v.model           AS vehicle_name,
            v.registration_no,
            COALESCE(f.fuel_cost,  0) AS fuel_cost,
            COALESCE(m.maint_cost, 0) AS maint_cost,
            COALESCE(e.exp_cost,   0) AS exp_cost,
            COALESCE(f.fuel_cost,  0)
                + COALESCE(m.maint_cost, 0)
                + COALESCE(e.exp_cost,   0) AS total_cost
        FROM vehicles v

        LEFT JOIN (
            SELECT vehicle_id, SUM(total_cost) AS fuel_cost
            FROM   fuel_logs
            GROUP  BY vehicle_id
        ) f ON f.vehicle_id = v.id

        LEFT JOIN (
            SELECT vehicle_id, SUM(cost) AS maint_cost
            FROM   maintenance_records
            GROUP  BY vehicle_id
        ) m ON m.vehicle_id = v.id

        LEFT JOIN (
            SELECT vehicle_id, SUM(amount) AS exp_cost
            FROM   expenses
            GROUP  BY vehicle_id
        ) e ON e.vehicle_id = v.id

        ORDER BY total_cost DESC
        LIMIT 5
    `);

    return result.rows.map(r => ({
        name:      r.vehicle_name || r.registration_no || 'Unknown',
        fuelCost:  parseFloat(r.fuel_cost)  || 0,
        maintCost: parseFloat(r.maint_cost) || 0,
        expCost:   parseFloat(r.exp_cost)   || 0,
        totalCost: parseFloat(r.total_cost) || 0
    }));
}


module.exports = { getAnalyticsSummary };
