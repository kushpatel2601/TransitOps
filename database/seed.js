/**
 * database/seed.js
 * -------------------------------------------------
 * Seeds the database with sample data so we have
 * something to work with during development.
 * 
 * Usage:  npm run db:setup
 * -------------------------------------------------
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function seedDatabase() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting database seed...\n');

        // hash a common dev password for all seed users
        const hashedPassword = await bcrypt.hash('password123', 10);

        // ---- Users (one per role) ----
        await client.query(`
            INSERT INTO users (full_name, email, password_hash, role_id) VALUES
                ('Raven Kapoor', 'raven@transitops.in', $1, 1),
                ('Arjun Mehta', 'arjun@transitops.in', $1, 2),
                ('Priya Sharma', 'priya@transitops.in', $1, 3),
                ('Neha Gupta', 'neha@transitops.in', $1, 4)
            ON CONFLICT (email) DO NOTHING;
        `, [hashedPassword]);
        console.log('✓ Users seeded');

        // ---- Vehicles ----
        await client.query(`
            INSERT INTO vehicles (registration_no, vehicle_type, make, model, year, capacity, status, current_mileage, fuel_type, last_service_date) VALUES
                ('MH-01-AB-1234', 'bus', 'Tata', 'Starbus', 2022, 52, 'active', 45230.50, 'diesel', '2026-06-15'),
                ('MH-02-CD-5678', 'minibus', 'Force', 'Traveller', 2023, 26, 'active', 32100.00, 'diesel', '2026-05-20'),
                ('MH-01-EF-9012', 'van', 'Mahindra', 'Supro', 2024, 12, 'maintenance', 18750.25, 'cng', '2026-07-01'),
                ('MH-03-GH-3456', 'bus', 'Ashok Leyland', 'Viking', 2021, 48, 'active', 67890.00, 'diesel', '2026-04-10'),
                ('MH-04-IJ-7890', 'minibus', 'Eicher', 'Skyline', 2023, 30, 'inactive', 28450.75, 'diesel', '2026-03-25'),
                ('MH-01-KL-2345', 'bus', 'Tata', 'Urban', 2024, 40, 'active', 12300.00, 'electric', '2026-06-28')
            ON CONFLICT (registration_no) DO NOTHING;
        `);
        console.log('✓ Vehicles seeded');

        // ---- Drivers ----
        await client.query(`
            INSERT INTO drivers (full_name, license_no, license_expiry, phone, email, status, safety_score, total_trips, violations) VALUES
                ('Rajesh Kumar', 'DL-0420230012345', '2028-03-15', '+91 9876543210', 'rajesh@email.com', 'active', 95.50, 342, 2),
                ('Sunil Patil', 'MH-0120220098765', '2027-11-30', '+91 9876543211', 'sunil@email.com', 'active', 88.00, 278, 5),
                ('Amit Joshi', 'MH-0220240056789', '2029-06-20', '+91 9876543212', 'amit@email.com', 'on_leave', 92.75, 156, 1),
                ('Deepak Singh', 'MH-0320210034567', '2026-12-31', '+91 9876543213', 'deepak@email.com', 'active', 78.25, 410, 8),
                ('Vikram Rao', 'MH-0120250011111', '2030-01-15', '+91 9876543214', 'vikram@email.com', 'suspended', 45.00, 89, 15)
            ON CONFLICT (license_no) DO NOTHING;
        `);
        console.log('✓ Drivers seeded');

        // ---- Routes ----
        await client.query(`
            INSERT INTO routes (route_name, start_point, end_point, distance_km, estimated_time, status) VALUES
                ('Route A1', 'Andheri Station', 'BKC Business Hub', 12.5, 35, 'active'),
                ('Route B2', 'Thane Terminal', 'Navi Mumbai CBD', 22.0, 55, 'active'),
                ('Route C3', 'Dadar TT', 'Powai Tech Park', 15.8, 45, 'active'),
                ('Route D4', 'Borivali Station', 'Goregaon IT Park', 8.3, 25, 'active'),
                ('Route E5', 'Churchgate', 'Nariman Point Loop', 4.2, 20, 'active')
            ON CONFLICT DO NOTHING;
        `);
        console.log('✓ Routes seeded');

        // ---- Trips ----
        await client.query(`
            INSERT INTO trips (route_id, vehicle_id, driver_id, departure_time, arrival_time, status, passenger_count, notes) VALUES
                (1, 1, 1, '2026-07-12 08:00:00', '2026-07-12 08:35:00', 'completed', 38, 'Morning rush — on time'),
                (2, 2, 2, '2026-07-12 09:00:00', '2026-07-12 09:55:00', 'in_progress', 22, NULL),
                (3, 4, 4, '2026-07-12 10:30:00', '2026-07-12 11:15:00', 'scheduled', 0, 'Regular weekday shuttle'),
                (1, 6, 1, '2026-07-12 14:00:00', '2026-07-12 14:35:00', 'scheduled', 0, 'Afternoon return'),
                (4, 1, 2, '2026-07-12 17:00:00', '2026-07-12 17:25:00', 'delayed', 0, 'Traffic congestion expected'),
                (5, 2, 4, '2026-07-12 18:30:00', NULL, 'cancelled', 0, 'Vehicle reassigned to Route B2')
            ON CONFLICT DO NOTHING;
        `);
        console.log('✓ Trips seeded');

        // ---- Maintenance records ----
        await client.query(`
            INSERT INTO maintenance_records (vehicle_id, maintenance_type, description, scheduled_date, completed_date, status, cost, mechanic_name, next_scheduled) VALUES
                (1, 'oil_change', 'Regular 5000km oil change', '2026-06-15', '2026-06-15', 'completed', 2500.00, 'AutoCare Garage', '2026-09-15'),
                (3, 'brake_service', 'Front brake pad replacement', '2026-07-01', NULL, 'in_progress', 8500.00, 'MechPro Services', NULL),
                (2, 'tire_rotation', 'Quarterly tire rotation and alignment', '2026-07-20', NULL, 'pending', 3200.00, NULL, '2026-10-20'),
                (4, 'engine_check', 'Annual engine diagnostics', '2026-06-01', NULL, 'overdue', 5000.00, NULL, '2026-06-01')
            ON CONFLICT DO NOTHING;
        `);
        console.log('✓ Maintenance records seeded');

        // ---- Fuel logs ----
        await client.query(`
            INSERT INTO fuel_logs (vehicle_id, driver_id, fill_date, fuel_type, quantity_liters, cost_per_liter, total_cost, odometer_reading) VALUES
                (1, 1, '2026-07-10', 'diesel', 120.00, 89.50, 10740.00, 45100.00),
                (2, 2, '2026-07-11', 'diesel', 80.00, 89.50, 7160.00, 32050.00),
                (4, 4, '2026-07-09', 'diesel', 150.00, 89.50, 13425.00, 67700.00),
                (6, 1, '2026-07-12', 'electric', 0, 0, 850.00, 12280.00)
            ON CONFLICT DO NOTHING;
        `);
        console.log('✓ Fuel logs seeded');

        // ---- Expenses ----
        await client.query(`
            INSERT INTO expenses (vehicle_id, category, amount, description, expense_date, payment_status) VALUES
                (1, 'toll', 350.00, 'Mumbai-Pune expressway toll', '2026-07-10', 'paid'),
                (2, 'parking', 200.00, 'Overnight parking at depot', '2026-07-11', 'paid'),
                (4, 'fine', 1500.00, 'Overspeeding fine — Western Express', '2026-07-08', 'pending'),
                (1, 'insurance', 45000.00, 'Annual comprehensive insurance renewal', '2026-07-01', 'paid'),
                (3, 'repair', 12000.00, 'Windshield replacement', '2026-07-05', 'paid')
            ON CONFLICT DO NOTHING;
        `);
        console.log('✓ Expenses seeded');

        console.log('\n✅ Database seeded successfully!');
        console.log('   You can now log in with any of these accounts:');
        console.log('   • raven@transitops.in  (Fleet Manager)');
        console.log('   • arjun@transitops.in  (Dispatcher)');
        console.log('   • priya@transitops.in  (Safety Officer)');
        console.log('   • neha@transitops.in   (Financial Analyst)');
        console.log('   Password for all: password123\n');

    } catch (err) {
        console.error('❌ Seed failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

seedDatabase();
