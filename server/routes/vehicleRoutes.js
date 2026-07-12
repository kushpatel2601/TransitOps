/**
 * server/routes/vehicleRoutes.js
 * -------------------------------------------------
 * Fleet Vehicle registry routes.
 * 
 * GET    /api/vehicles       → list all vehicles (with filters)
 * GET    /api/vehicles/:id   → get details of one vehicle
 * POST   /api/vehicles       → add a new vehicle
 * PUT    /api/vehicles/:id   → edit a vehicle's details
 * DELETE /api/vehicles/:id   → delete a vehicle from the fleet
 * 
 * All routes are protected by JWT authentication.
 * -------------------------------------------------
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');
const {
    getAllVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle
} = require('../controllers/vehicleController');

// all routes require the user to be logged in
router.use(authenticateToken);

router.get('/', getAllVehicles);
router.get('/:id', getVehicleById);
router.post('/', createVehicle);
router.put('/:id', updateVehicle);
router.delete('/:id', deleteVehicle);

module.exports = router;
