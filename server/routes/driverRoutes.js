/**
 * server/routes/driverRoutes.js
 * -------------------------------------------------
 * Driver & Safety Profile routes.
 *
 * GET    /api/drivers            → list all drivers
 * GET    /api/drivers/stats/summary → status counts
 * GET    /api/drivers/:id        → single driver
 * POST   /api/drivers            → add a new driver
 * PUT    /api/drivers/:id        → update a driver
 * DELETE /api/drivers/:id        → remove a driver
 *
 * All routes require JWT authentication.
 * -------------------------------------------------
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');
const {
    getAllDrivers,
    getDriverById,
    createDriver,
    updateDriver,
    deleteDriver,
    getDriverStats
} = require('../controllers/driverController');

router.use(authenticateToken);

// stats must come before /:id so it doesn't match as an id
router.get('/stats/summary', getDriverStats);

router.get('/', getAllDrivers);
router.get('/:id', getDriverById);
router.post('/', createDriver);
router.put('/:id', updateDriver);
router.delete('/:id', deleteDriver);

module.exports = router;
