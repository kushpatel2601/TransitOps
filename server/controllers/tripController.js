/**
 * server/controllers/tripController.js
 * -------------------------------------------------
 * Handles trip dispatching, live board data,
 * and trip lifecycle updates.
 *
 * Business rules (from spec section 4):
 *   - Cargo weight must not exceed vehicle capacity
 *   - Only "available" vehicles and "active" drivers
 *     can be assigned to new trips
 *   - Retired / In-Shop vehicles are blocked
 *   - Expired-license or suspended drivers are blocked
 *   - A vehicle/driver already On Trip cannot be double-dispatched
 *   - Dispatching → vehicle + driver status become "on_trip"
 *   - Completing / Cancelling → both revert to "available" / "active"
 *
 * Trip lifecycle (spec §3.5):
 *   draft → dispatched → completed  |  cancelled
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
            cargo_weight, distance_km
        } = req.body;

        // --- mandatory field check ---
        if (!source || !destination) {
            return res.status(400).json({
                success: false,
                message: 'Source and destination are required.'
            });
        }

        // --- vehicle checks ---
        if (vehicle_id) {
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
                        message: `Vehicle ${vehicle.model} is ${vehicle.status === 'inactive' ? 'Retired' : 'In Shop'} and cannot be dispatched.`
                    });
                }

                // block vehicles already on a live trip (double-dispatch guard)
                if (vehicle.status === 'on_trip') {
                    return res.status(400).json({
                        success: false,
                        message: `Vehicle ${vehicle.model} is already On Trip. Select a different vehicle.`
                    });
                }

                // cargo weight capacity check (capacity in Tons → convert to kg)
                if (cargo_weight) {
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
        }

        // --- driver checks ---
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
                        message: `Driver ${driver.full_name} is Suspended and cannot be assigned.`
                    });
                }

                // block drivers already on a live trip (double-dispatch guard)
                if (driver.status === 'on_trip') {
                    return res.status(400).json({
                        success: false,
                        message: `Driver ${driver.full_name} is already On Trip. Select a different driver.`
                    });
                }

                // expired licence check
                if (driver.license_expiry && new Date(driver.license_expiry) < new Date()) {
                    return res.status(400).json({
                        success: false,
                        message: `Driver ${driver.full_name}'s licence has expired. Blocked from trip assignment.`
                    });
                }
            }
        }

        // --- find or create the route for this source-destination pair ---
        let routeId = null;
        const routeCheck = await db.query(
            'SELECT id FROM routes WHERE LOWER(start_point) = LOWER($1) AND LOWER(end_point) = LOWER($2)',
            [source, destination]
        );

        if (routeCheck.rows.length > 0) {
            routeId = routeCheck.rows[0].id;
            // update distance if a new value was provided
            if (distance_km) {
                await db.query(
                    'UPDATE routes SET distance_km = $1 WHERE id = $2',
                    [parseFloat(distance_km), routeId]
                );
            }
        } else {
            const newRoute = await db.query(
                'INSERT INTO routes (route_name, start_point, end_point, distance_km, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [`${source} → ${destination}`, source, destination, distance_km || null, 'active']
            );
            routeId = newRoute.rows[0].id;
        }

        // --- insert the trip record (status = 'dispatched' per spec lifecycle) ---
        const result = await db.query(`
            INSERT INTO trips
                (route_id, vehicle_id, driver_id, departure_time, status, passenger_count, notes)
            VALUES ($1, $2, $3, NOW(), $4, $5, $6)
            RETURNING *
        `, [
            routeId,
            vehicle_id || null,
            driver_id || null,
            'dispatched',          // spec lifecycle: Draft → Dispatched → Completed / Cancelled
            cargo_weight   || 0,
            `${source} → ${destination}`
        ]);

        // --- P0 FIX: mark vehicle and driver as On Trip so they disappear from
        //     the available dropdowns immediately (spec §4 business rules) ---
        if (vehicle_id) {
            await db.query(
                "UPDATE vehicles SET status = 'on_trip', updated_at = NOW() WHERE id = $1",
                [vehicle_id]
            );
        }
        if (driver_id) {
            await db.query(
                "UPDATE drivers SET status = 'on_trip', updated_at = NOW() WHERE id = $1",
                [driver_id]
            );
        }

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
 * Updates trip status. Lifecycle: draft → dispatched → completed | cancelled
 * Status transitions also keep vehicle and driver statuses in sync.
 */
async function updateTrip(req, res) {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        const existing = await db.query('SELECT * FROM trips WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found.' });
        }

        const current   = existing.rows[0];
        const newStatus = status || current.status;

        const result = await db.query(`
            UPDATE trips SET
                status     = $1,
                notes      = $2,
                updated_at = NOW()
            WHERE id = $3
            RETURNING *
        `, [
            newStatus,
            notes !== undefined ? notes : current.notes,
            id
        ]);

        // Completed or cancelled → free the vehicle and driver back to available
        if (newStatus === 'completed' || newStatus === 'cancelled') {
            if (current.vehicle_id) {
                await db.query(
                    "UPDATE vehicles SET status = 'available', updated_at = NOW() WHERE id = $1",
                    [current.vehicle_id]
                );
            }
            if (current.driver_id) {
                await db.query(
                    "UPDATE drivers SET status = 'active', updated_at = NOW() WHERE id = $1",
                    [current.driver_id]
                );
            }
        }

        // Dispatched (or re-dispatched) → mark vehicle and driver as On Trip
        if (newStatus === 'dispatched') {
            if (current.vehicle_id) {
                await db.query(
                    "UPDATE vehicles SET status = 'on_trip', updated_at = NOW() WHERE id = $1",
                    [current.vehicle_id]
                );
            }
            if (current.driver_id) {
                await db.query(
                    "UPDATE drivers SET status = 'on_trip', updated_at = NOW() WHERE id = $1",
                    [current.driver_id]
                );
            }
        }

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

        // Fetch the trip first so we can release the vehicle and driver before deleting.
        const tripRow = await db.query('SELECT vehicle_id, driver_id, status FROM trips WHERE id = $1', [id]);
        if (tripRow.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trip not found.' });
        }

        const trip = tripRow.rows[0];

        // Only release resources if the trip was still active — completed/cancelled
        // trips should already have been freed when their status last changed.
        if (trip.status === 'dispatched') {
            if (trip.vehicle_id) {
                await db.query(
                    "UPDATE vehicles SET status = 'available', updated_at = NOW() WHERE id = $1",
                    [trip.vehicle_id]
                );
            }
            if (trip.driver_id) {
                await db.query(
                    "UPDATE drivers SET status = 'active', updated_at = NOW() WHERE id = $1",
                    [trip.driver_id]
                );
            }
        }

        await db.query('DELETE FROM trips WHERE id = $1', [id]);

        res.json({ success: true, message: `Trip #${id} cancelled and removed.` });
    } catch (err) {
        console.error('Error deleting trip:', err);
        res.status(500).json({ success: false, message: 'Could not delete trip.' });
    }
}


/**
 * GET /api/trips/available/vehicles
 *
 * Returns vehicles eligible for trip assignment.
 * Excludes On Trip, In Shop (maintenance), and Retired (inactive) vehicles.
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
