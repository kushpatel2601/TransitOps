/**
 * server/controllers/vehicleController.js
 * -------------------------------------------------
 * Handles all vehicle-related operations — listing,
 * creating, updating, and deleting fleet vehicles.
 * 
 * Business rules:
 *   - Registration number must be unique
 *   - Retired/In-Shop vehicles are excluded from
 *     trip dispatching (handled by trip module)
 *   - Supports filtering by type, status, and
 *     registration number search
 * -------------------------------------------------
 */

const db = require('../config/database');


/**
 * GET /api/vehicles
 * 
 * Returns a list of all vehicles, with optional filters.
 * Query params:
 *   - type:   filter by vehicle type (bus, van, truck, etc.)
 *   - status: filter by status (available, on_trip, maintenance, retired)
 *   - search: search by registration number (partial match)
 */
async function getAllVehicles(req, res) {
    try {
        const { type, status, search } = req.query;

        // build the query dynamically based on which filters are provided
        let query = 'SELECT * FROM vehicles WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        // filter by vehicle type if specified
        if (type) {
            query += ` AND LOWER(vehicle_type) = LOWER($${paramIndex})`;
            params.push(type);
            paramIndex++;
        }

        // filter by current status
        if (status) {
            query += ` AND LOWER(status) = LOWER($${paramIndex})`;
            params.push(status);
            paramIndex++;
        }

        // search by registration number (case-insensitive partial match)
        if (search) {
            query += ` AND LOWER(registration_no) LIKE LOWER($${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // most recently added vehicles first
        query += ' ORDER BY created_at DESC';

        const result = await db.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (err) {
        console.error('Error fetching vehicles:', err);
        res.status(500).json({
            success: false,
            message: 'Could not load vehicles. Please try again.'
        });
    }
}


/**
 * GET /api/vehicles/:id
 * 
 * Returns a single vehicle by its ID.
 * Used when opening a vehicle detail view or edit form.
 */
async function getVehicleById(req, res) {
    try {
        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM vehicles WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found.'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (err) {
        console.error('Error fetching vehicle:', err);
        res.status(500).json({
            success: false,
            message: 'Could not load vehicle details.'
        });
    }
}


/**
 * POST /api/vehicles
 * 
 * Creates a new vehicle in the fleet registry.
 * Registration number must be unique — we check for
 * duplicates before inserting.
 */
async function createVehicle(req, res) {
    try {
        const {
            registration_no,
            vehicle_type,
            make,
            model,
            year,
            capacity,
            status,
            current_mileage,
            fuel_type,
            acquisition_cost
        } = req.body;

        // basic validation — registration number is required
        if (!registration_no || !vehicle_type) {
            return res.status(400).json({
                success: false,
                message: 'Registration number and vehicle type are required.'
            });
        }

        // check if this registration number already exists
        const existing = await db.query(
            'SELECT id FROM vehicles WHERE LOWER(registration_no) = LOWER($1)',
            [registration_no]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: `A vehicle with registration "${registration_no}" already exists.`
            });
        }

        // insert the new vehicle — acquisition_cost is required for ROI analytics
        const result = await db.query(`
            INSERT INTO vehicles
                (registration_no, vehicle_type, make, model, year,
                 capacity, status, current_mileage, fuel_type, acquisition_cost)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            registration_no.toUpperCase(),
            vehicle_type,
            make || null,
            model || null,
            year || null,
            capacity || 0,
            status || 'available',
            current_mileage || 0,
            fuel_type || 'diesel',
            req.body.acquisition_cost || 0
        ]);

        res.status(201).json({
            success: true,
            message: 'Vehicle added to fleet.',
            data: result.rows[0]
        });

    } catch (err) {
        console.error('Error creating vehicle:', err);
        res.status(500).json({
            success: false,
            message: 'Could not add vehicle. Please try again.'
        });
    }
}


/**
 * PUT /api/vehicles/:id
 * 
 * Updates an existing vehicle's details.
 * Only the fields that are provided will be updated.
 */
async function updateVehicle(req, res) {
    try {
        const { id } = req.params;
        const {
            registration_no,
            vehicle_type,
            make,
            model,
            year,
            capacity,
            status,
            current_mileage,
            fuel_type,
            acquisition_cost
        } = req.body;

        // make sure the vehicle exists first
        const existing = await db.query(
            'SELECT * FROM vehicles WHERE id = $1',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found.'
            });
        }

        // if they're changing the registration number, check it's not taken
        if (registration_no) {
            const duplicate = await db.query(
                'SELECT id FROM vehicles WHERE LOWER(registration_no) = LOWER($1) AND id != $2',
                [registration_no, id]
            );

            if (duplicate.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `Registration number "${registration_no}" is already in use.`
                });
            }
        }

        // update with new values (fall back to existing values if not provided)
        const current = existing.rows[0];
        const result = await db.query(`
            UPDATE vehicles SET
                registration_no  = $1,
                vehicle_type     = $2,
                make             = $3,
                model            = $4,
                year             = $5,
                capacity         = $6,
                status           = $7,
                current_mileage  = $8,
                fuel_type        = $9,
                acquisition_cost = $10,
                updated_at       = NOW()
            WHERE id = $11
            RETURNING *
        `, [
            (registration_no || current.registration_no).toUpperCase(),
            vehicle_type || current.vehicle_type,
            make !== undefined ? make : current.make,
            model !== undefined ? model : current.model,
            year || current.year,
            capacity !== undefined ? capacity : current.capacity,
            status || current.status,
            current_mileage !== undefined ? current_mileage : current.current_mileage,
            fuel_type || current.fuel_type,
            acquisition_cost !== undefined ? acquisition_cost : current.acquisition_cost,
            id
        ]);

        res.json({
            success: true,
            message: 'Vehicle updated.',
            data: result.rows[0]
        });

    } catch (err) {
        console.error('Error updating vehicle:', err);
        res.status(500).json({
            success: false,
            message: 'Could not update vehicle.'
        });
    }
}


/**
 * DELETE /api/vehicles/:id
 * 
 * Removes a vehicle from the registry.
 * In a real system you might want to soft-delete instead,
 * but for the hackathon a hard delete keeps things simple.
 */
async function deleteVehicle(req, res) {
    try {
        const { id } = req.params;

        const result = await db.query(
            'DELETE FROM vehicles WHERE id = $1 RETURNING registration_no',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found.'
            });
        }

        res.json({
            success: true,
            message: `Vehicle ${result.rows[0].registration_no} removed from fleet.`
        });

    } catch (err) {
        console.error('Error deleting vehicle:', err);
        res.status(500).json({
            success: false,
            message: 'Could not delete vehicle.'
        });
    }
}


module.exports = {
    getAllVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle
};
