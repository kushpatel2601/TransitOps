/**
 * server/routes/reportRoutes.js
 * -------------------------------------------------
 * Reports & Analytics API routes.
 *
 * GET  /api/reports/summary  →  all analytics data in one call
 *
 * All routes require a valid JWT — analytics data is sensitive.
 * -------------------------------------------------
 */

const express = require('express');
const router  = express.Router();

const { authenticateToken }   = require('../middleware/authMiddleware');
const { getAnalyticsSummary } = require('../controllers/reportController');

// protect every analytics endpoint behind auth
router.use(authenticateToken);

router.get('/summary', getAnalyticsSummary);

module.exports = router;
