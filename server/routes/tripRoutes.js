/**
 * server/routes/tripRoutes.js
 * -------------------------------------------------
 * Trip dispatching routes.
 *
 * GET    /api/trips                    → list all trips (live board)
 * GET    /api/trips/available/vehicles → vehicles eligible for dispatch
 * GET    /api/trips/available/drivers  → drivers eligible for dispatch
 * POST   /api/trips                    → dispatch a new trip
 * PUT    /api/trips/:id               → update trip status
 * DELETE /api/trips/:id               → cancel/remove a trip
 *
 * All routes require JWT authentication.
 * -------------------------------------------------
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');
const {
    getAllTrips,
    createTrip,
    updateTrip,
    deleteTrip,
    getAvailableVehicles,
    getAvailableDrivers
} = require('../controllers/tripController');

router.use(authenticateToken);

// these must come before /:id to avoid matching as an id
router.get('/available/vehicles', getAvailableVehicles);
router.get('/available/drivers', getAvailableDrivers);

router.get('/', getAllTrips);
router.post('/', createTrip);
router.put('/:id', updateTrip);
router.delete('/:id', deleteTrip);

module.exports = router;
