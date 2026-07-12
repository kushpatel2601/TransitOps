/**
 * server.js — Application entry point
 * 
 * Loads environment variables, initializes the Express app,
 * and starts listening on the configured port.
 */

require('dotenv').config();
const app = require('./server/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`\n🚍 TransitOps server running at http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
