/**
 * server/routes/dashboardRoutes.js
 * -------------------------------------------------
 * Dashboard API routes.
 * 
 * GET /api/dashboard/stats  →  aggregated KPI data
 * 
 * All dashboard routes require a valid JWT token
 * since this data should only be visible to logged-in users.
 * -------------------------------------------------
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');
const { getDashboardStats } = require('../controllers/dashboardController');

// the dashboard endpoint — requires login
router.get('/stats', authenticateToken, getDashboardStats);

module.exports = router;
