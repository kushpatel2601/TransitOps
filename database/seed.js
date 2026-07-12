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

        // Clean slate before seeding to avoid ID mismatch/conflicts from prior runs
        console.log('🧹 Cleaning existing database records...');
        await client.query('TRUNCATE TABLE expenses, fuel_logs, maintenance_records, trips, drivers, vehicles, routes, users RESTART IDENTITY CASCADE;');

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
        // Statuses: available | on_trip | maintenance | inactive (retired)
        await client.query(`
            INSERT INTO vehicles (registration_no, vehicle_type, make, model, year, capacity, status, current_mileage, fuel_type, last_service_date, acquisition_cost) VALUES
                ('GJ01AB4521', 'van',     'Tata',           'VAN-05',  2022, 0.5,  'on_trip',   74000.00, 'diesel',   '2026-06-15', 620000.00),
                ('GJ01AB9981', 'truck',   'Ashok Leyland',  'TRUCK-11',2023, 5,    'inactive',  182000.00,'diesel',   '2026-05-20', 2450000.00),
                ('GJ01AB1120', 'minibus', 'Mahindra',       'MINI-03', 2024, 1,    'available',  66000.00,'cng',      '2026-07-01', 410000.00),
                ('GJ01AB0008', 'van',     'Maruti',         'VAN-09',  2021, 0.75, 'inactive',  241900.00,'diesel',   '2026-04-10', 590000.00),
                ('MH-04-IJ-7890','minibus','Eicher',        'Skyline', 2023, 30,   'inactive',   28450.75,'diesel',   '2026-03-25', 1250000.00),
                ('MH-01-KL-2345','bus',   'Tata',           'Urban',   2024, 40,   'available',  12300.00,'electric', '2026-06-28', 3500000.00)
            ON CONFLICT (registration_no) DO NOTHING;
        `);
        console.log('✓ Vehicles seeded');

        // ---- Drivers ----
        // Statuses: active (Available) | on_trip | on_leave (Off Duty) | suspended
        await client.query(`
            INSERT INTO drivers (full_name, license_no, license_expiry, phone, email, status, safety_score, license_category, trip_completion_rate, total_trips, violations) VALUES
                ('Alex',   'DL-88215', '2029-12-31', '9876500000', 'alex@transitops.in',   'on_trip',  96.00, 'LMV', 96.00, 342, 2),
                ('John',   'DL-44120', '2025-05-31', '98220xxxxx', 'john@transitops.in',   'suspended',87.00, 'HMV', 87.00, 278, 5),
                ('Priya',  'DL-77031', '2028-02-28', '99110xxxxx', 'priya@transitops.in',  'on_trip',  99.00, 'LMV', 99.00, 156, 1),
                ('Suresh', 'DL-90045', '2027-01-31', '97440xxxxx', 'suresh@transitops.in', 'on_leave', 88.00, 'HMV', 88.00, 120, 0)
            ON CONFLICT (license_no) DO NOTHING;
        `);
        console.log('✓ Drivers seeded');

        // ---- Routes ----
        await client.query(`
            INSERT INTO routes (route_name, start_point, end_point, distance_km, estimated_time, status) VALUES
                ('Route A1', 'Andheri Station',  'BKC Business Hub',    12.5, 35, 'active'),
                ('Route B2', 'Thane Terminal',   'Navi Mumbai CBD',     22.0, 55, 'active'),
                ('Route C3', 'Dadar TT',         'Powai Tech Park',     15.8, 45, 'active'),
                ('Route D4', 'Borivali Station', 'Goregaon IT Park',     8.3, 25, 'active'),
                ('Route E5', 'Churchgate',       'Nariman Point Loop',   4.2, 20, 'active')
            ON CONFLICT DO NOTHING;
        `);
        console.log('✓ Routes seeded');

        // ---- Trips ---------------------------------------------------------------
        // Lifecycle: draft | dispatched | completed | cancelled  (spec §3.5)
        // Vehicle 1 (VAN-05 / on_trip) and Driver Alex/Priya are on_trip → match trip 4.
        await client.query(`
            INSERT INTO trips (route_id, vehicle_id, driver_id, departure_time, arrival_time, status, passenger_count, notes) VALUES
                (NULL, NULL, NULL, NOW(),                         NULL,                          'draft',      0, NULL),
                (3,    3,    NULL, NOW(),                         NOW() + INTERVAL '70 minutes', 'dispatched', 0, 'Awaiting driver assignment'),
                (2,    2,    2,    NOW() - INTERVAL '90 minutes', NOW() - INTERVAL '10 minutes', 'completed',  0, NULL),
                (1,    1,    3,    NOW(),                         NOW() + INTERVAL '45 minutes', 'dispatched', 0, NULL)
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
