/**
 * server/config/database.js
 * -------------------------------------------------
 * Sets up and exports the PostgreSQL connection pool.
 * 
 * We use a pool instead of a single client so the app
 * can handle multiple simultaneous DB queries without
 * creating a new connection each time.
 * -------------------------------------------------
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'transitops',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    
    // pool settings — sensible defaults for a hackathon-scale app
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Log connection status on first use
pool.on('connect', () => {
    console.log('📦 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err.message);
    // don't crash the whole server — let the request handler deal with it
});

/**
 * Helper to run a query with parameters.
 * Wraps pool.query so we get consistent error handling.
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;

        // log slow queries in development (over 100ms)
        if (process.env.NODE_ENV === 'development' && duration > 100) {
            console.warn(`⚠️ Slow query (${duration}ms):`, text.substring(0, 80));
        }
        return result;
    } catch (err) {
        console.error('DB query error:', err.message);
        throw err;
    }
}

module.exports = { pool, query };
