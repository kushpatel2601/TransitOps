/**
 * server/routes/authRoutes.js
 * -------------------------------------------------
 * Authentication-related routes.
 * 
 * POST /api/auth/login     → log in with email/password
 * POST /api/auth/register  → create a new account
 * GET  /api/auth/me        → get current user (protected)
 * GET  /api/auth/roles     → list available roles
 * -------------------------------------------------
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const db = require('../config/database');

// public routes — no token needed
router.post('/login', authController.login);
router.post('/register', authController.register);

// protected route — requires valid JWT
router.get('/me', authenticateToken, authController.getCurrentUser);

// public — the frontend needs the role list for the dropdown
router.get('/roles', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, name, description FROM roles ORDER BY id'
        );
        res.json({ success: true, roles: result.rows });
    } catch (err) {
        console.error('Error fetching roles:', err.message);
        res.status(500).json({ success: false, message: 'Could not load roles.' });
    }
});

module.exports = router;
