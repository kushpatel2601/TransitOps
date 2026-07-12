/**
 * server/controllers/fuelExpenseController.js
 * -------------------------------------------------
 * Handles fuel logging and general expense tracking.
 *
 * Fuel logs track per-vehicle refueling events.
 * Expenses track tolls, parking, fines, and other
 * operational costs tied to trips or vehicles.
 *
 * The "total operational cost" is computed on the
 * fly by summing fuel + maintenance + expenses.
 * -------------------------------------------------
 */

const db = require('../config/database');


// ---- Fuel Logs ----

/**
 * GET /api/fuel
 * Returns all fuel log entries with vehicle model info.
 */
async function getAllFuelLogs(req, res) {
    try {
        const result = await db.query(`
            SELECT
                f.id,
                f.vehicle_id,
                v.model          AS vehicle_model,
                v.registration_no,
                f.fill_date,
                f.fuel_type,
                f.quantity_liters,
                f.cost_per_liter,
                f.total_cost,
                f.odometer_reading,
                f.created_at
            FROM fuel_logs f
            LEFT JOIN vehicles v ON f.vehicle_id = v.id
            ORDER BY f.fill_date DESC
        `);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching fuel logs:', err);
        res.status(500).json({ success: false, message: 'Could not load fuel logs.' });
    }
}


/**
 * POST /api/fuel
 * Logs a new fuel entry for a vehicle.
 */
async function createFuelLog(req, res) {
    try {
        const {
            vehicle_id, fill_date, fuel_type,
            quantity_liters, cost_per_liter, total_cost, odometer_reading
        } = req.body;

        if (!vehicle_id || !quantity_liters) {
            return res.status(400).json({
                success: false,
                message: 'Vehicle and quantity are required.'
            });
        }

        // auto-calculate total if not provided
        const computedTotal = total_cost || (quantity_liters * (cost_per_liter || 0));

        const result = await db.query(`
            INSERT INTO fuel_logs
                (vehicle_id, fill_date, fuel_type, quantity_liters, cost_per_liter, total_cost, odometer_reading)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            vehicle_id,
            fill_date || new Date().toISOString().slice(0, 10),
            fuel_type || 'diesel',
            quantity_liters,
            cost_per_liter || 0,
            computedTotal,
            odometer_reading || null
        ]);

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Error creating fuel log:', err);
        res.status(500).json({ success: false, message: 'Could not log fuel entry.' });
    }
}


// ---- Expenses ----

/**
 * GET /api/expenses
 * Returns all expense entries with vehicle + trip info.
 */
async function getAllExpenses(req, res) {
    try {
        const result = await db.query(`
            SELECT
                e.id,
                e.vehicle_id,
                v.model           AS vehicle_model,
                v.registration_no,
                e.category,
                e.amount,
                e.description,
                e.expense_date,
                e.payment_status,
                e.created_at
            FROM expenses e
            LEFT JOIN vehicles v ON e.vehicle_id = v.id
            ORDER BY e.expense_date DESC
        `);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching expenses:', err);
        res.status(500).json({ success: false, message: 'Could not load expenses.' });
    }
}


/**
 * POST /api/expenses
 * Adds a new expense entry (toll, fine, parking, etc.)
 */
async function createExpense(req, res) {
    try {
        const { vehicle_id, category, amount, description, expense_date, payment_status } = req.body;

        if (!vehicle_id || !category || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Vehicle, category, and amount are required.'
            });
        }

        const result = await db.query(`
            INSERT INTO expenses (vehicle_id, category, amount, description, expense_date, payment_status)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [
            vehicle_id,
            category,
            amount,
            description || null,
            expense_date || new Date().toISOString().slice(0, 10),
            payment_status || 'pending'
        ]);

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Error creating expense:', err);
        res.status(500).json({ success: false, message: 'Could not add expense.' });
    }
}


/**
 * GET /api/fuel/total-cost
 * Returns total operational cost = fuel + maintenance + expenses.
 */
async function getTotalOperationalCost(req, res) {
    try {
        const [fuelResult, maintResult, expenseResult] = await Promise.all([
            db.query('SELECT COALESCE(SUM(total_cost), 0) AS total FROM fuel_logs'),
            db.query('SELECT COALESCE(SUM(cost), 0) AS total FROM maintenance_records'),
            db.query('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses')
        ]);

        const fuelTotal = parseFloat(fuelResult.rows[0].total);
        const maintTotal = parseFloat(maintResult.rows[0].total);
        const expenseTotal = parseFloat(expenseResult.rows[0].total);

        res.json({
            success: true,
            data: {
                fuel: fuelTotal,
                maintenance: maintTotal,
                expenses: expenseTotal,
                total: fuelTotal + maintTotal + expenseTotal
            }
        });
    } catch (err) {
        console.error('Error calculating total cost:', err);
        res.status(500).json({ success: false, message: 'Could not compute total cost.' });
    }
}


module.exports = {
    getAllFuelLogs, createFuelLog,
    getAllExpenses, createExpense,
    getTotalOperationalCost
};
