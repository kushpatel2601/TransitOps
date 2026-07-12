/**
 * server/controllers/authController.js
 * -------------------------------------------------
 * Handles user authentication — login, registration,
 * and token refresh.
 * 
 * Business rules:
 *   - Account locks after 5 failed login attempts
 *   - Lock duration is 15 minutes
 *   - Passwords are hashed with bcrypt (10 rounds)
 * -------------------------------------------------
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// how many bad attempts before we lock the account
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;


/**
 * POST /api/auth/login
 * Authenticates user credentials and returns a JWT token.
 */
async function login(req, res) {
    const { email, password, role } = req.body;

    // --- input validation ---
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required.'
        });
    }

    // basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: 'Please enter a valid email address.'
        });
    }

    try {
        // find the user and their role info in one query
        const result = await db.query(`
            SELECT u.id, u.full_name, u.email, u.password_hash,
                   u.is_active, u.failed_attempts, u.locked_until,
                   r.id as role_id, r.name as role_name, r.permissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE LOWER(u.email) = LOWER($1)
        `, [email]);

        // user not found — keep the error message vague for security
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials. Please check your email and password.'
            });
        }

        const user = result.rows[0];

        // check if account is locked
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const minutesLeft = Math.ceil(
                (new Date(user.locked_until) - new Date()) / 60000
            );
            return res.status(423).json({
                success: false,
                message: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in ${minutesLeft} minute(s).`
            });
        }

        // check if account is deactivated
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'This account has been deactivated. Contact an administrator.'
            });
        }

        // verify the password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            // increment failed attempts
            const newAttempts = (user.failed_attempts || 0) + 1;
            let lockUntil = null;

            // lock the account if they've hit the limit
            if (newAttempts >= MAX_FAILED_ATTEMPTS) {
                lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000);
            }

            await db.query(`
                UPDATE users 
                SET failed_attempts = $1, locked_until = $2, updated_at = NOW()
                WHERE id = $3
            `, [newAttempts, lockUntil, user.id]);

            // different message depending on remaining attempts
            const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
            let message = 'Invalid credentials.';
            if (remaining > 0) {
                message += ` ${remaining} attempt(s) remaining before account lock.`;
            } else {
                message = `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in ${LOCK_DURATION_MINUTES} minutes.`;
            }

            return res.status(401).json({
                success: false,
                message: message,
                attemptsRemaining: Math.max(0, remaining)
            });
        }

        // if a specific role was selected, verify the user actually has that role
        if (role && user.role_name !== role) {
            return res.status(403).json({
                success: false,
                message: `Your account is not assigned the "${role}" role. You are registered as "${user.role_name}".`
            });
        }

        // success — reset failed attempts and update last_login
        await db.query(`
            UPDATE users 
            SET failed_attempts = 0, locked_until = NULL, 
                last_login = NOW(), updated_at = NOW()
            WHERE id = $1
        `, [user.id]);

        // generate JWT with user info embedded
        const tokenPayload = {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            roleId: user.role_id,
            roleName: user.role_name,
            permissions: user.permissions
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '24h'
        });

        // send back everything the frontend needs
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role_name,
                permissions: user.permissions
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            success: false,
            message: 'Something went wrong on our end. Please try again.'
        });
    }
}


/**
 * POST /api/auth/register
 * Creates a new user account.
 */
async function register(req, res) {
    const { fullName, email, password, confirmPassword, role } = req.body;

    // --- validate all fields ---
    const errors = [];

    if (!fullName || fullName.trim().length < 2) {
        errors.push('Full name must be at least 2 characters.');
    }
    if (!email) {
        errors.push('Email is required.');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Please enter a valid email address.');
    }
    if (!password) {
        errors.push('Password is required.');
    } else if (password.length < 8) {
        errors.push('Password must be at least 8 characters long.');
    }
    if (password !== confirmPassword) {
        errors.push('Passwords do not match.');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed.',
            errors: errors
        });
    }

    try {
        // check if email is already taken
        const existing = await db.query(
            'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'An account with this email already exists.'
            });
        }

        // look up the role ID (default to dispatcher if not specified)
        const roleName = role || 'dispatcher';
        const roleResult = await db.query(
            'SELECT id FROM roles WHERE name = $1', [roleName]
        );
        if (roleResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `Invalid role: "${roleName}". Choose from: fleet_manager, dispatcher, safety_officer, financial_analyst.`
            });
        }
        const roleId = roleResult.rows[0].id;

        // hash the password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // create the user
        const newUser = await db.query(`
            INSERT INTO users (full_name, email, password_hash, role_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, full_name, email
        `, [fullName.trim(), email.toLowerCase(), passwordHash, roleId]);

        res.status(201).json({
            success: true,
            message: 'Account created successfully. You can now log in.',
            user: {
                id: newUser.rows[0].id,
                fullName: newUser.rows[0].full_name,
                email: newUser.rows[0].email,
                role: roleName
            }
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            success: false,
            message: 'Could not create account. Please try again later.'
        });
    }
}


/**
 * GET /api/auth/me
 * Returns the currently authenticated user's info.
 * Requires a valid JWT token (checked by middleware).
 */
async function getCurrentUser(req, res) {
    try {
        const result = await db.query(`
            SELECT u.id, u.full_name, u.email, u.is_active, u.last_login,
                   r.name as role_name, r.permissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE u.id = $1
        `, [req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        const user = result.rows[0];
        res.json({
            success: true,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role_name,
                permissions: user.permissions,
                isActive: user.is_active,
                lastLogin: user.last_login
            }
        });

    } catch (err) {
        console.error('Get current user error:', err);
        res.status(500).json({
            success: false,
            message: 'Could not retrieve user info.'
        });
    }
}


module.exports = { login, register, getCurrentUser };
