-- ============================================================
-- TransitOps — Database Schema
-- Smart Transport Operations Platform
-- 
-- Run this file against your local PostgreSQL to set up all
-- tables needed by the application.
-- ============================================================

-- Clean slate (drop in reverse dependency order)
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS fuel_logs CASCADE;
DROP TABLE IF EXISTS maintenance_records CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;


-- -------------------------------------------------------
-- ROLES — defines what each user type can access
-- -------------------------------------------------------
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}',   -- stores granular access flags
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed the four core roles from the design spec
INSERT INTO roles (name, description, permissions) VALUES
    ('fleet_manager', 'Fleet Manager — Fleet, Maintenance, Budget',
        '{"dashboard": true, "vehicles": true, "drivers": true, "trips": true, "maintenance": true, "fuel_expenses": true, "reports": true, "settings": true}'),
    ('dispatcher', 'Dispatcher — Dashboard, Trips, Expenses',
        '{"dashboard": true, "vehicles": false, "drivers": false, "trips": true, "maintenance": false, "fuel_expenses": true, "reports": false, "settings": false}'),
    ('safety_officer', 'Safety Officer — Drivers, Compliance', 
        '{"dashboard": true, "vehicles": false, "drivers": true, "trips": false, "maintenance": true, "fuel_expenses": false, "reports": true, "settings": false}'),
    ('financial_analyst', 'Financial Analyst — Fuel & Expenses, Analytics', 
        '{"dashboard": true, "vehicles": false, "drivers": false, "trips": false, "maintenance": false, "fuel_expenses": true, "reports": true, "settings": false}');


-- -------------------------------------------------------
-- USERS — anyone who logs into the system
-- -------------------------------------------------------
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role_id         INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    failed_attempts INTEGER DEFAULT 0,         -- lock account after 5 failures
    locked_until    TIMESTAMP DEFAULT NULL,     -- when the lock expires
    last_login      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast email lookups during login
CREATE INDEX idx_users_email ON users(email);


-- -------------------------------------------------------
-- VEHICLES — the fleet inventory
-- -------------------------------------------------------
CREATE TABLE vehicles (
    id                  SERIAL PRIMARY KEY,
    registration_no     VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type        VARCHAR(30) NOT NULL,  -- bus, van, minibus, etc.
    make                VARCHAR(50),
    model               VARCHAR(50),
    year                INTEGER,
    capacity            INTEGER DEFAULT 0,     -- passenger seats or cargo tonnes
    status              VARCHAR(20) DEFAULT 'available',  -- available | on_trip | maintenance | inactive
    current_mileage     DECIMAL(10, 2) DEFAULT 0,
    fuel_type           VARCHAR(20) DEFAULT 'diesel',
    acquisition_cost    DECIMAL(12, 2) DEFAULT 0,   -- purchase price; used for ROI calculation
    last_service_date   DATE,
    insurance_expiry    DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- -------------------------------------------------------
-- DRIVERS — people who drive the vehicles
-- -------------------------------------------------------
CREATE TABLE drivers (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    license_no      VARCHAR(50) UNIQUE NOT NULL,
    license_expiry  DATE,
    phone           VARCHAR(20),
    email           VARCHAR(150),
    status              VARCHAR(20) DEFAULT 'active',  -- active | on_trip | on_leave | suspended
    safety_score        DECIMAL(4, 2) DEFAULT 100.00,  -- out of 100
    license_category    VARCHAR(20) DEFAULT 'LMV',
    trip_completion_rate DECIMAL(5, 2) DEFAULT 100.00,
    total_trips         INTEGER DEFAULT 0,
    violations          INTEGER DEFAULT 0,
    joined_date         DATE DEFAULT CURRENT_DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- -------------------------------------------------------
-- ROUTES — predefined transit routes
-- -------------------------------------------------------
CREATE TABLE routes (
    id              SERIAL PRIMARY KEY,
    route_name      VARCHAR(100) NOT NULL,
    start_point     VARCHAR(150) NOT NULL,
    end_point       VARCHAR(150) NOT NULL,
    distance_km     DECIMAL(8, 2),
    estimated_time  INTEGER,  -- minutes
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- -------------------------------------------------------
-- TRIPS — scheduled and completed journeys
-- -------------------------------------------------------
CREATE TABLE trips (
    id              SERIAL PRIMARY KEY,
    route_id        INTEGER REFERENCES routes(id) ON DELETE SET NULL,
    vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    driver_id       INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    departure_time  TIMESTAMP NOT NULL,
    arrival_time    TIMESTAMP,
    actual_departure TIMESTAMP,
    actual_arrival  TIMESTAMP,
    status          VARCHAR(20) DEFAULT 'draft',       -- draft | dispatched | completed | cancelled
    distance_km     DECIMAL(8, 2),                     -- planned trip distance (km); persisted from dispatch form
    cargo_weight_kg DECIMAL(10, 2) DEFAULT 0,          -- renamed from passenger_count for clarity
    passenger_count INTEGER DEFAULT 0,                 -- kept for backward-compat; use cargo_weight_kg for freight
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- We'll frequently query trips by status and date
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_departure ON trips(departure_time);


-- -------------------------------------------------------
-- MAINTENANCE RECORDS — service history for each vehicle
-- -------------------------------------------------------
CREATE TABLE maintenance_records (
    id                  SERIAL PRIMARY KEY,
    vehicle_id          INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
    maintenance_type    VARCHAR(50) NOT NULL,  -- oil_change, tire_rotation, brake_service, etc.
    description         TEXT,
    scheduled_date      DATE NOT NULL,
    completed_date      DATE,
    status              VARCHAR(20) DEFAULT 'pending',  -- pending | in_progress | completed | overdue
    cost                DECIMAL(10, 2) DEFAULT 0,
    mechanic_name       VARCHAR(100),
    next_scheduled      DATE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- -------------------------------------------------------
-- FUEL LOGS — tracks every refueling event
-- -------------------------------------------------------
CREATE TABLE fuel_logs (
    id                  SERIAL PRIMARY KEY,
    vehicle_id          INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id           INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    fill_date           DATE NOT NULL,
    fuel_type           VARCHAR(20) DEFAULT 'diesel',
    quantity_liters     DECIMAL(8, 2) NOT NULL,
    cost_per_liter      DECIMAL(6, 2),
    total_cost          DECIMAL(10, 2) NOT NULL,
    odometer_reading    DECIMAL(10, 2),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- -------------------------------------------------------
-- EXPENSES — general fleet expenses beyond fuel
-- -------------------------------------------------------
CREATE TABLE expenses (
    id              SERIAL PRIMARY KEY,
    vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    category        VARCHAR(50) NOT NULL,  -- toll, parking, fine, repair, insurance, etc.
    amount          DECIMAL(10, 2) NOT NULL,
    description     TEXT,
    expense_date    DATE NOT NULL,
    payment_status  VARCHAR(20) DEFAULT 'pending',  -- pending | paid | overdue
    receipt_url     VARCHAR(255),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- Done! All tables are ready.
-- ============================================================
