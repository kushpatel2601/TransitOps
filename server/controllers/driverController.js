/**
 * server/controllers/driverController.js
 * -------------------------------------------------
 * Handles all driver-related operations — listing,
 * creating, updating, and removing drivers.
 *
 * Business rules:
 *   - Expired license or "suspended" status blocks
 *     the driver from being assigned to any trip.
 *   - Safety score is tracked per driver and shown
 *     on the Drivers & Safety Profiles page.
 * -------------------------------------------------
 */

const db = require('../config/database');


/**
 * GET /api/drivers
 *
 * Returns all drivers, with optional filters.
 * Query params:
 *   - status: filter by driver status (active, on_leave, suspended)
 *   - search: partial match on driver name
 */
async function getAllDrivers(req, res) {
    try {
        const { status, search } = req.query;

        let query = 'SELECT * FROM drivers WHERE 1=1';
        const params = [];
        let idx = 1;

        if (status) {
            query += ` AND LOWER(status) = LOWER($${idx})`;
            params.push(status);
            idx++;
        }

        if (search) {
            query += ` AND LOWER(full_name) LIKE LOWER($${idx})`;
            params.push(`%${search}%`);
            idx++;
        }

        query += ' ORDER BY created_at DESC';

        const result = await db.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (err) {
        console.error('Error fetching drivers:', err);
        res.status(500).json({
            success: false,
            message: 'Could not load drivers.'
        });
    }
}


/**
 * GET /api/drivers/:id
 *
 * Returns a single driver by ID.
 */
async function getDriverById(req, res) {
    try {
        const { id } = req.params;
        const result = await db.query('SELECT * FROM drivers WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Driver not found.' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Error fetching driver:', err);
        res.status(500).json({ success: false, message: 'Could not load driver details.' });
    }
}


/**
 * POST /api/drivers
 *
 * Creates a new driver profile. License number must be unique.
 */
async function createDriver(req, res) {
    try {
        const {
            full_name, license_no, license_category,
            license_expiry, phone, email,
            status, safety_score, trip_completion_rate
        } = req.body;

        // basic validation
        if (!full_name || !license_no) {
            return res.status(400).json({
                success: false,
                message: 'Driver name and license number are required.'
            });
        }

        // check for duplicate license number
        const existing = await db.query(
            'SELECT id FROM drivers WHERE LOWER(license_no) = LOWER($1)',
            [license_no]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: `License number "${license_no}" is already registered.`
            });
        }

        const result = await db.query(`
            INSERT INTO drivers
                (full_name, license_no, license_expiry, phone, email, status, safety_score, license_category, trip_completion_rate)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            full_name,
            license_no.toUpperCase(),
            license_expiry || null,
            phone || null,
            email || null,
            status || 'active',
            safety_score !== undefined && safety_score !== '' ? parseFloat(safety_score) : 100.00,
            license_category || 'LMV',
            trip_completion_rate !== undefined && trip_completion_rate !== '' ? parseFloat(trip_completion_rate) : 100.00
        ]);

        res.status(201).json({
            success: true,
            message: 'Driver added.',
            data: result.rows[0]
        });

    } catch (err) {
        console.error('Error creating driver:', err);
        res.status(500).json({ success: false, message: 'Could not add driver.' });
    }
}


/**
 * PUT /api/drivers/:id
 *
 * Updates an existing driver's profile.
 */
async function updateDriver(req, res) {
    try {
        const { id } = req.params;
        const {
            full_name, license_no, license_category, license_expiry,
            phone, email, status, safety_score, trip_completion_rate
        } = req.body;

        const existing = await db.query('SELECT * FROM drivers WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Driver not found.' });
        }

        // check license uniqueness if changing it
        if (license_no) {
            const dup = await db.query(
                'SELECT id FROM drivers WHERE LOWER(license_no) = LOWER($1) AND id != $2',
                [license_no, id]
            );
            if (dup.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `License "${license_no}" is already in use by another driver.`
                });
            }
        }

        const current = existing.rows[0];
        const result = await db.query(`
            UPDATE drivers SET
                full_name            = $1,
                license_no           = $2,
                license_expiry       = $3,
                phone                = $4,
                email                = $5,
                status               = $6,
                safety_score         = $7,
                license_category     = $8,
                trip_completion_rate = $9,
                updated_at           = NOW()
            WHERE id = $10
            RETURNING *
        `, [
            full_name || current.full_name,
            (license_no || current.license_no).toUpperCase(),
            license_expiry !== undefined ? license_expiry : current.license_expiry,
            phone !== undefined ? phone : current.phone,
            email !== undefined ? email : current.email,
            status || current.status,
            safety_score !== undefined && safety_score !== '' ? parseFloat(safety_score) : current.safety_score,
            license_category || current.license_category,
            trip_completion_rate !== undefined && trip_completion_rate !== '' ? parseFloat(trip_completion_rate) : current.trip_completion_rate,
            id
        ]);

        // Synchronize associated vehicle status to match driver status changes
        if (status && status !== current.status) {
            if (status === 'on_leave' || status === 'suspended') {
                const tripResult = await db.query(`
                    SELECT vehicle_id 
                    FROM trips 
                    WHERE driver_id = $1 
                    ORDER BY departure_time DESC 
                    LIMIT 1
                `, [id]);
                
                if (tripResult.rows.length > 0 && tripResult.rows[0].vehicle_id) {
                    const vehicleId = tripResult.rows[0].vehicle_id;
                    await db.query(`
                        UPDATE vehicles 
                        SET status = 'inactive', updated_at = NOW() 
                        WHERE id = $1
                    `, [vehicleId]);
                }
            } else if (status === 'active') {
                // When a driver becomes available again, check if they have a live dispatched trip
                const hasActiveTrip = await db.query(`
                    SELECT id FROM trips
                    WHERE driver_id = $1 AND status = 'dispatched'
                    LIMIT 1
                `, [id]);

                if (hasActiveTrip.rows.length === 0) {
                    // No live trip — find an available vehicle that has a dispatched trip with no driver
                    const vehicleResult = await db.query(`
                        SELECT v.id
                        FROM vehicles v
                        LEFT JOIN trips t ON t.vehicle_id = v.id AND t.status = 'dispatched'
                        WHERE v.status = 'available'
                          AND (t.id IS NULL OR t.driver_id IS NULL)
                        ORDER BY v.created_at ASC
                        LIMIT 1
                    `);

                    if (vehicleResult.rows.length > 0) {
                        const vehicleId = vehicleResult.rows[0].id;

                        // Try to assign the driver to an existing driverless dispatched trip
                        const driverlessTripResult = await db.query(`
                            SELECT id
                            FROM trips
                            WHERE vehicle_id = $1 AND status = 'dispatched' AND driver_id IS NULL
                            LIMIT 1
                        `, [vehicleId]);

                        if (driverlessTripResult.rows.length > 0) {
                            await db.query(`
                                UPDATE trips
                                SET driver_id = $1, updated_at = NOW()
                                WHERE id = $2
                            `, [id, driverlessTripResult.rows[0].id]);
                        }
                        // No auto-created draft trips — dispatcher must create trips explicitly
                    }
                } else {
                    // Driver already has a live dispatched trip — make sure their vehicle is on_trip too
                    const tripResult = await db.query(`
                        SELECT vehicle_id FROM trips
                        WHERE driver_id = $1 AND status = 'dispatched'
                        ORDER BY departure_time DESC LIMIT 1
                    `, [id]);
                    if (tripResult.rows.length > 0 && tripResult.rows[0].vehicle_id) {
                        await db.query(`
                            UPDATE vehicles SET status = 'on_trip', updated_at = NOW() WHERE id = $1
                        `, [tripResult.rows[0].vehicle_id]);
                    }
                }
            }
        }

        res.json({ success: true, message: 'Driver updated.', data: result.rows[0] });

    } catch (err) {
        console.error('Error updating driver:', err);
        res.status(500).json({ success: false, message: 'Could not update driver.' });
    }
}


/**
 * DELETE /api/drivers/:id
 */
async function deleteDriver(req, res) {
    try {
        const { id } = req.params;
        const result = await db.query(
            'DELETE FROM drivers WHERE id = $1 RETURNING full_name', [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Driver not found.' });
        }

        res.json({
            success: true,
            message: `Driver ${result.rows[0].full_name} removed.`
        });
    } catch (err) {
        console.error('Error deleting driver:', err);
        res.status(500).json({ success: false, message: 'Could not delete driver.' });
    }
}


/**
 * GET /api/drivers/stats/summary
 *
 * Returns quick counts grouped by status, used
 * for the colored stat badges at the bottom of the page.
 */
async function getDriverStats(req, res) {
    try {
        const result = await db.query(`
            SELECT status, COUNT(*) AS count
            FROM drivers
            GROUP BY status
        `);

        // turn the rows into a simple object { active: 2, suspended: 1, ... }
        const stats = {};
        result.rows.forEach(row => {
            stats[row.status] = parseInt(row.count);
        });

        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('Error fetching driver stats:', err);
        res.status(500).json({ success: false, message: 'Could not load driver stats.' });
    }
}


module.exports = {
    getAllDrivers,
    getDriverById,
    createDriver,
    updateDriver,
    deleteDriver,
    getDriverStats
};
