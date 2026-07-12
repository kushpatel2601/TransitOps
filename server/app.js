/**
 * server/app.js — Express application setup
 * 
 * Configures middleware, mounts routes, and serves
 * static files from the /public directory.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ---- Global Middleware ----

// parse JSON request bodies
app.use(express.json());

// parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// enable CORS for all origins in development
app.use(cors());

// serve static files (HTML, CSS, JS, images) from /public
app.use(express.static(path.join(__dirname, '..', 'public')));


// ---- API Routes ----

// authentication (login, register, etc.)
app.use('/api/auth', require('./routes/authRoutes'));

// dashboard stats and KPI data
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

// vehicle registry routes
app.use('/api/vehicles', require('./routes/vehicleRoutes'));

// driver & safety profile routes
app.use('/api/drivers', require('./routes/driverRoutes'));

// trip dispatching routes
app.use('/api/trips', require('./routes/tripRoutes'));

// maintenance service records
app.use('/api/maintenance', require('./routes/maintenanceRoutes'));

// fuel logging
app.use('/api/fuel', require('./routes/fuelRoutes'));

// expense tracking (tolls, fines, etc.)
app.use('/api/expenses', require('./routes/expenseRoutes'));

// TODO: add remaining route modules as we build them
// app.use('/api/reports', require('./routes/reportRoutes'));
// app.use('/api/settings', require('./routes/settingsRoutes'));


// ---- Page Routes ----

// serve the login page as the default landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// serve the dashboard (and other pages) via their own HTML files
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'dashboard.html'));
});

app.get('/fleet', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'fleet.html'));
});

app.get('/drivers', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'drivers.html'));
});

app.get('/trips', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'trips.html'));
});

app.get('/maintenance', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'maintenance.html'));
});

app.get('/fuel-expenses', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'fuel-expenses.html'));
});

// catch-all: redirect unknown routes to login
app.get('*', (req, res) => {
    // don't redirect API calls — return a proper 404
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: `Route not found: ${req.method} ${req.path}`
        });
    }
    res.redirect('/');
});


// ---- Error Handler ----

// global error handler — catches anything that slips through
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error. Please try again later.'
    });
});

module.exports = app;
