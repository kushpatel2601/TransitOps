/**
 * server/routes/fuelExpenseRoutes.js
 * -------------------------------------------------
 * Fuel logging and expense tracking routes.
 *
 * GET    /api/fuel               → list fuel logs
 * POST   /api/fuel               → log new fuel entry
 * GET    /api/fuel/total-cost    → total operational cost
 * GET    /api/expenses           → list expenses
 * POST   /api/expenses           → add expense
 * -------------------------------------------------
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fuelExpenseController');
const { authenticateToken } = require('../middleware/authMiddleware');

// all routes require authentication
router.use(authenticateToken);

// fuel logs
router.get('/', ctrl.getAllFuelLogs);
router.post('/', ctrl.createFuelLog);
router.get('/total-cost', ctrl.getTotalOperationalCost);

module.exports = router;
