/**
 * server/routes/maintenanceRoutes.js
 * -------------------------------------------------
 * Maintenance service record routes.
 *
 * GET    /api/maintenance        → list all records
 * POST   /api/maintenance        → log new service
 * PUT    /api/maintenance/:id    → update record
 * DELETE /api/maintenance/:id    → remove record
 * -------------------------------------------------
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/maintenanceController');
const { authenticateToken } = require('../middleware/authMiddleware');

// all routes require authentication
router.use(authenticateToken);

router.get('/', ctrl.getAllRecords);
router.post('/', ctrl.createRecord);
router.put('/:id', ctrl.updateRecord);
router.delete('/:id', ctrl.deleteRecord);

module.exports = router;
