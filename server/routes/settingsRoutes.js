/**
 * server/routes/settingsRoutes.js
 * -------------------------------------------------
 * Settings & RBAC API routes.
 *
 * GET  /api/settings   →  load depot settings + RBAC matrix
 * POST /api/settings   →  save depot settings
 *
 * All routes require a valid JWT.
 * -------------------------------------------------
 */

const express = require('express');
const router  = express.Router();

const { authenticateToken }        = require('../middleware/authMiddleware');
const { getSettings, saveSettings } = require('../controllers/settingsController');

router.use(authenticateToken);

router.get('/',  getSettings);
router.post('/', saveSettings);

module.exports = router;
