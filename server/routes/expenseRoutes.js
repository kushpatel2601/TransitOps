/**
 * server/routes/expenseRoutes.js
 * -------------------------------------------------
 * Expense tracking routes (toll, parking, fines, etc.)
 *
 * GET    /api/expenses       → list all expenses
 * POST   /api/expenses       → add new expense
 * -------------------------------------------------
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fuelExpenseController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/', ctrl.getAllExpenses);
router.post('/', ctrl.createExpense);

module.exports = router;
