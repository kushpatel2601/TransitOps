/**
 * server/controllers/maintenanceController.js
 * -------------------------------------------------
 * Handles maintenance service records — logging new
 * service entries, listing service history, and
 * toggling vehicle status when repairs begin or end.
 *
 * Business rules:
 *   - Logging a service sets the vehicle to "In Shop"
 *   - Completing a service sets the vehicle to "Available"
 *   - In Shop vehicles are removed from trip dispatcher
 * -------------------------------------------------
 */

const db = require('../config/database');


/**
 * GET /api/maintenance
 * Lists all service records with vehicle model info joined in.
 */
async function getAllRecords(req, res) {
    try {
        const result = await db.query(`
            SELECT
                m.id,
                m.vehicle_id,
                v.model        AS vehicle_model,
                v.registration_no,
                m.maintenance_type,
                m.description,
                m.scheduled_date,
                m.completed_date,
                m.status,
                m.cost,
                m.mechanic_name,
                m.next_scheduled,
                m.created_at
            FROM maintenance_records m
            LEFT JOIN vehicles v ON m.vehicle_id = v.id
            ORDER BY m.created_at DESC
        `);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching maintenance records:', err);
        res.status(500).json({ success: false, message: 'Could not load service records.' });
    }
}


/**
 * POST /api/maintenance
 * Logs a new service record and sets the vehicle to "maintenance" (In Shop).
 */
async function createRecord(req, res) {
    try {
        const {
            vehicle_id, maintenance_type, description,
            scheduled_date, cost, mechanic_name, status
        } = req.body;

        // basic validation
        if (!vehicle_id || !maintenance_type) {
            return res.status(400).json({
                success: false,
                message: 'Vehicle and service type are required.'
            });
        }

        const result = await db.query(`
            INSERT INTO maintenance_records
                (vehicle_id, maintenance_type, description, scheduled_date, cost, mechanic_name, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            vehicle_id,
            maintenance_type,
            description || null,
            scheduled_date || new Date().toISOString().slice(0, 10),
            cost || 0,
            mechanic_name || null,
            status || 'in_progress'
        ]);

        // when a service is logged, move the vehicle to "In Shop"
        if (status !== 'completed') {
            await db.query(`
                UPDATE vehicles SET status = 'maintenance', updated_at = NOW()
                WHERE id = $1
            `, [vehicle_id]);
        }

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Error creating maintenance record:', err);
        res.status(500).json({ success: false, message: 'Could not log service record.' });
    }
}


/**
 * PUT /api/maintenance/:id
 * Updates a service record. If status changes to "completed",
 * the vehicle is moved back to "Available".
 */
async function updateRecord(req, res) {
    try {
        const { id } = req.params;
        const {
            maintenance_type, description, scheduled_date,
            completed_date, cost, mechanic_name, status
        } = req.body;

        const existing = await db.query('SELECT * FROM maintenance_records WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }

        const current = existing.rows[0];
        const newStatus = status || current.status;

        const result = await db.query(`
            UPDATE maintenance_records SET
                maintenance_type = $1,
                description      = $2,
                scheduled_date   = $3,
                completed_date   = $4,
                cost             = $5,
                mechanic_name    = $6,
                status           = $7,
                updated_at       = NOW()
            WHERE id = $8
            RETURNING *
        `, [
            maintenance_type || current.maintenance_type,
            description !== undefined ? description : current.description,
            scheduled_date || current.scheduled_date,
            completed_date || current.completed_date,
            cost !== undefined ? cost : current.cost,
            mechanic_name !== undefined ? mechanic_name : current.mechanic_name,
            newStatus,
            id
        ]);

        // if the service was just completed, set vehicle back to available
        if (newStatus === 'completed' && current.status !== 'completed') {
            await db.query(`
                UPDATE vehicles SET status = 'available', updated_at = NOW()
                WHERE id = $1
            `, [current.vehicle_id]);
        }

        // if the service was just started, set vehicle to in shop
        if (newStatus === 'in_progress' && current.status !== 'in_progress') {
            await db.query(`
                UPDATE vehicles SET status = 'maintenance', updated_at = NOW()
                WHERE id = $1
            `, [current.vehicle_id]);
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Error updating maintenance record:', err);
        res.status(500).json({ success: false, message: 'Could not update service record.' });
    }
}


/**
 * DELETE /api/maintenance/:id
 */
async function deleteRecord(req, res) {
    try {
        const { id } = req.params;
        const result = await db.query(
            'DELETE FROM maintenance_records WHERE id = $1 RETURNING *', [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }

        res.json({ success: true, message: 'Service record removed.' });
    } catch (err) {
        console.error('Error deleting maintenance record:', err);
        res.status(500).json({ success: false, message: 'Could not delete service record.' });
    }
}


module.exports = { getAllRecords, createRecord, updateRecord, deleteRecord };
