/**
 * server/controllers/tripController.js
 * -------------------------------------------------
 * Handles trip dispatching, live board data,
 * and trip lifecycle updates.
 *
 * Business rules:
 *   - Cargo weight must not exceed vehicle capacity
 *   - Only "available" vehicles and "active" drivers
 *     can be assigned to new trips
 *   - Retired/In-Shop vehicles are blocked
 *   - Expired license or suspended drivers are blocked
 * -------------------------------------------------
 */

const db = require('../config/database');


/**
 * GET /api/trips
 *
 * Returns all trips with joined vehicle and driver names.
 * Used by the Live Board on the right panel.
 */
async function getAllTrips(req, res) {
    try {
        const result = await db.query(`
            SELECT
                t.id,
                t.status,
                t.departure_time,
                t.arrival_time,
                t.passenger_count,
                t.notes,
                t.created_at,
                v.registration_no AS vehicle_reg,
                v.model AS vehicle_model,
                v.capacity AS vehicle_capacity,
                d.full_name AS driver_name,
                r.route_name,
                r.start_point,
                r.end_point,
                r.estimated_time
            FROM trips t
            LEFT JOIN vehicles v ON t.vehicle_id = v.id
            LEFT JOIN drivers d  ON t.driver_id  = d.id
            LEFT JOIN routes r   ON t.route_id   = r.id
            ORDER BY t.created_at DESC
        `);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching trips:', err);
        res.status(500).json({ success: false, message: 'Could not load trips.' });
    }
}


/**
 * POST /api/trips
 *
 * Creates (dispatches) a new trip. Validates capacity
 * and availability before allowing dispatch.
 */
async function createTrip(req, res) {
    try {
        const {
            source, destination,
            vehicle_id, driver_id,
            cargo_weight, planned_departure_min,
            status
        } = req.body;

        // basic validation
        if (!source || !destination) {
            return res.status(400).json({
                success: false,
                message: 'Source and destination are required.'
            });
        }

        // if a vehicle is assigned, check its capacity against cargo weight
        if (vehicle_id && cargo_weight) {
            const vehicleResult = await db.query(
                'SELECT capacity, status, model FROM vehicles WHERE id = $1',
                [vehicle_id]
            );

            if (vehicleResult.rows.length > 0) {
                const vehicle = vehicleResult.rows[0];

                // block retired or in-shop vehicles
                if (vehicle.status === 'inactive' || vehicle.status === 'maintenance') {
                    return res.status(400).json({
                        success: false,
                        message: `Vehicle ${vehicle.model} is ${vehicle.status === 'inactive' ? 'retired' : 'in shop'} and cannot be dispatched.`
                    });
                }

                // capacity check (capacity stored in Tons, cargo_weight in kg)
                const capacityKg = parseFloat(vehicle.capacity) * 1000;
                if (parseFloat(cargo_weight) > capacityKg) {
                    return res.status(400).json({
                        success: false,
                        message: `Cargo weight (${cargo_weight} kg) exceeds vehicle capacity (${capacityKg} kg). Dispatch blocked.`,
                        capacityInfo: {
                            vehicleCapacityKg: capacityKg,
                            cargoWeightKg: parseFloat(cargo_weight),
                            exceeded: parseFloat(cargo_weight) - capacityKg
                        }
                    });
                }
            }
        }

        // if a driver is assigned, check they're not suspended or license expired
        if (driver_id) {
            const driverResult = await db.query(
                'SELECT full_name, status, license_expiry FROM drivers WHERE id = $1',
                [driver_id]
            );

            if (driverResult.rows.length > 0) {
                const driver = driverResult.rows[0];

                if (driver.status === 'suspended') {
                    return res.status(400).json({
                        success: false,
                        message: `Driver ${driver.full_name} is suspended and cannot be assigned.`
                    });
                }

                // check license expiry
                if (driver.license_expiry && new Date(driver.license_expiry) < new Date()) {
                    return res.status(400).json({
                        success: false,
                        message: `Driver ${driver.full_name}'s license has expired. Blocked from trip assignment.`
                    });
                }
            }
        }

        // find or create a route for this source-destination pair
        let routeId = null;
        const routeCheck = await db.query(
            'SELECT id FROM routes WHERE LOWER(start_point) = LOWER($1) AND LOWER(end_point) = LOWER($2)',
            [source, destination]
        );

        if (routeCheck.rows.length > 0) {
            routeId = routeCheck.rows[0].id;
        } else {
            // create a new route on the fly
            const newRoute = await db.query(
                'INSERT INTO routes (route_name, start_point, end_point, status) VALUES ($1, $2, $3, $4) RETURNING id',
                [`${source} → ${destination}`, source, destination, 'active']
            );
            routeId = newRoute.rows[0].id;
        }

        // calculate departure time from planned minutes
        const departureTime = new Date();
        if (planned_departure_min) {
            departureTime.setMinutes(departureTime.getMinutes() + parseInt(planned_departure_min));
        }

        const result = await db.query(`
            INSERT INTO trips
                (route_id, vehicle_id, driver_id, departure_time, status, passenger_count, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            routeId,
            vehicle_id || null,
            driver_id || null,
            departureTime,
            status || 'scheduled',
            cargo_weight || 0,
            `${source} → ${destination}`
        ]);

        res.status(201).json({
            success: true,
            message: 'Trip dispatched successfully.',
            data: result.rows[0]
        });

    } catch (err) {
        console.error('Error creating trip:', err);
        res.status(500).json({ success: false, message: 'Could not dispatch trip.' });
    }
}


/**
 * PUT /api/trips/:id
 *
 * Updates trip status (e.g. draft → scheduled → in_progress → completed).
 */
async function updateTrip(req, res) {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        const existing = await db.query('SELECT * FROM trips WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found.' });
        }

        const current = existing.rows[0];
        const result = await db.query(`
            UPDATE trips SET
                status     = $1,
                notes      = $2,
                updated_at = NOW()
            WHERE id = $3
            RETURNING *
        `, [
            status || current.status,
            notes !== undefined ? notes : current.notes,
            id
        ]);

        res.json({ success: true, message: 'Trip updated.', data: result.rows[0] });
    } catch (err) {
        console.error('Error updating trip:', err);
        res.status(500).json({ success: false, message: 'Could not update trip.' });
    }
}


/**
 * DELETE /api/trips/:id
 */
async function deleteTrip(req, res) {
    try {
        const { id } = req.params;
        const result = await db.query('DELETE FROM trips WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found.' });
        }

        res.json({ success: true, message: `Trip #${id} cancelled and removed.` });
    } catch (err) {
        console.error('Error deleting trip:', err);
        res.status(500).json({ success: false, message: 'Could not delete trip.' });
    }
}


/**
 * GET /api/trips/available/vehicles
 *
 * Returns vehicles available for trip assignment.
 * Only vehicles with status "available" are eligible.
 */
async function getAvailableVehicles(req, res) {
    try {
        const result = await db.query(
            "SELECT id, registration_no, model, capacity, vehicle_type FROM vehicles WHERE status = 'available' ORDER BY model"
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching available vehicles:', err);
        res.status(500).json({ success: false, message: 'Could not load vehicles.' });
    }
}


/**
 * GET /api/trips/available/drivers
 *
 * Returns drivers eligible for trip assignment.
 * Excludes suspended drivers and those with expired licenses.
 */
async function getAvailableDrivers(req, res) {
    try {
        const result = await db.query(`
            SELECT id, full_name, license_no, license_expiry, status
            FROM drivers
            WHERE status = 'active'
              AND (license_expiry IS NULL OR license_expiry > NOW())
            ORDER BY full_name
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Error fetching available drivers:', err);
        res.status(500).json({ success: false, message: 'Could not load drivers.' });
    }
}


module.exports = {
    getAllTrips,
    createTrip,
    updateTrip,
    deleteTrip,
    getAvailableVehicles,
    getAvailableDrivers
};
