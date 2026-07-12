/**
 * server/middleware/authMiddleware.js
 * -------------------------------------------------
 * JWT verification middleware.
 * 
 * Sits in front of any route that requires the user
 * to be logged in. Decodes the token from the
 * Authorization header and attaches user info to req.
 * -------------------------------------------------
 */

const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT token and attaches decoded user data to req.user
 */
function authenticateToken(req, res, next) {
    // grab the token from "Bearer <token>" header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No authentication token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;  // { id, email, role, roleName }
        next();
    } catch (err) {
        // token might be expired or tampered with
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token. Please log in again.'
        });
    }
}

/**
 * Restricts access to specific roles.
 * Usage: authorizeRoles('fleet_manager', 'dispatcher')
 */
function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.roleName)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
            });
        }
        next();
    };
}

module.exports = { authenticateToken, authorizeRoles };
