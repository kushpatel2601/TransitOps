/**
 * server/controllers/settingsController.js
 * -------------------------------------------------
 * Handles the Settings & RBAC page.
 *
 * Two things live here:
 *
 *  1. General depot settings (depot name, currency, distance unit).
 *     Stored in a lightweight key-value table called app_settings.
 *     The table is created on first access so the rest of the app
 *     still works on a fresh database without manual migration.
 *
 *  2. RBAC matrix — reads the permissions JSONB column from the
 *     roles table and sends it to the frontend as-is. The frontend
 *     turns it into the checkbox/tick table shown on screen 8.
 * -------------------------------------------------
 */

const db = require('../config/database');


// ---- Default values for a brand-new installation ----

const SETTING_DEFAULTS = {
    depot_name:    'Gandhinagar Depot GT+',
    currency:      'INR (₹)',
    distance_unit: 'Kilometers'
};


/**
 * Creates the app_settings table if it doesn't exist yet.
 * Called before every read or write so we never crash on a
 * fresh database that hasn't run any extra migrations.
 */
async function ensureSettingsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            key   VARCHAR(100) PRIMARY KEY,
            value TEXT         NOT NULL
        )
    `);
}


/**
 * GET /api/settings
 *
 * Returns:
 *  - settings  { depot_name, currency, distance_unit }
 *  - roles     array of { name, description, permissions }
 */
async function getSettings(req, res) {
    try {
        await ensureSettingsTable();

        // load whatever is in the database
        const settingsResult = await db.query(
            'SELECT key, value FROM app_settings'
        );

        // build the response object, filling in defaults for any missing key
        const settings = { ...SETTING_DEFAULTS };
        settingsResult.rows.forEach(row => {
            settings[row.key] = row.value;
        });

        // load role permissions for the RBAC matrix table
        const rolesResult = await db.query(`
            SELECT name, description, permissions
            FROM   roles
            ORDER  BY id ASC
        `);

        res.json({
            success:  true,
            settings: settings,
            roles:    rolesResult.rows
        });

    } catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({
            success: false,
            message: 'Could not load settings.'
        });
    }
}


/**
 * POST /api/settings
 *
 * Saves the three general depot fields.
 * Uses INSERT … ON CONFLICT DO UPDATE (upsert) so this works
 * whether or not a row already exists for each key.
 */
async function saveSettings(req, res) {
    const { depot_name, currency, distance_unit } = req.body;

    if (!depot_name || !currency || !distance_unit) {
        return res.status(400).json({
            success: false,
            message: 'Depot name, currency, and distance unit are all required.'
        });
    }

    try {
        await ensureSettingsTable();

        // upsert each setting as its own row
        const pairs = [
            ['depot_name',    depot_name.trim()],
            ['currency',      currency.trim()],
            ['distance_unit', distance_unit.trim()]
        ];

        for (const [key, value] of pairs) {
            await db.query(`
                INSERT INTO app_settings (key, value)
                VALUES ($1, $2)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            `, [key, value]);
        }

        res.json({
            success: true,
            message: 'Settings saved successfully.'
        });

    } catch (err) {
        console.error('Error saving settings:', err);
        res.status(500).json({
            success: false,
            message: 'Could not save settings.'
        });
    }
}


module.exports = { getSettings, saveSettings };
