# TransitOps

A **Smart Transport Operations Platform** built for the Odoo Hackathon 2026.

TransitOps is a full-stack fleet management system with role-based access control (RBAC), real-time trip dispatching, maintenance tracking, fuel & expense logging, and an analytics dashboard — all backed by a local PostgreSQL database with a custom Node.js/Express API.

---

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Backend  | Node.js + Express |
| Database | PostgreSQL (local/self-hosted) |
| Auth     | JWT (jsonwebtoken) + bcrypt |
| Frontend | Vanilla HTML, CSS, JavaScript (no frameworks) |

---

## Roles & Access (RBAC)

| Role              | Modules accessible |
|-------------------|--------------------|
| Fleet Manager     | Dashboard, Fleet, Drivers, Trips, Maintenance, Analytics |
| Dispatcher        | Dashboard, Trips |
| Safety Officer    | Dashboard, Drivers, Maintenance, Analytics |
| Financial Analyst | Dashboard, Fuel & Expenses, Analytics |

---

## Pages

| # | Page | Route |
|---|------|-------|
| 0 | Sign In | `/` |
| 1 | Dashboard | `/dashboard` |
| 2 | Vehicle Registry | `/fleet` |
| 3 | Drivers & Safety | `/drivers` |
| 4 | Trip Dispatcher | `/trips` |
| 5 | Maintenance | `/maintenance` |
| 6 | Fuel & Expenses | `/fuel-expenses` |
| 7 | Reports & Analytics | `/analytics` |
| 8 | Settings & RBAC | `/settings` |

---

## Local Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 1. Clone the repository

```bash
git clone https://github.com/kushpatel2601/TransitOps.git
cd TransitOps
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in your PostgreSQL credentials:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=transitops
DB_USER=postgres
DB_PASSWORD=your_password_here
JWT_SECRET=any_long_random_string
JWT_EXPIRES_IN=24h
PORT=3000
```

### 4. Create the database

```sql
-- run in psql or pgAdmin
CREATE DATABASE transitops;
```

### 5. Run the schema

```bash
psql -U postgres -d transitops -f database/schema.sql
```

### 6. Seed with sample data

```bash
npm run db:setup
```

This creates four demo accounts:

| Email | Role | Password |
|-------|------|----------|
| raven@transitops.in | Fleet Manager | password123 |
| arjun@transitops.in | Dispatcher | password123 |
| priya@transitops.in | Safety Officer | password123 |
| neha@transitops.in | Financial Analyst | password123 |

### 7. Start the server

```bash
# development (auto-restart on changes)
npm run dev

# production
npm start
```

Open **http://localhost:3000** in your browser.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login and get JWT token |
| POST | `/api/auth/register` | Create new account |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/dashboard/stats` | KPIs, recent trips, vehicle status |
| GET/POST | `/api/vehicles` | Vehicle registry |
| GET/POST | `/api/drivers` | Driver profiles |
| GET/POST | `/api/trips` | Trip dispatching |
| GET/POST | `/api/maintenance` | Service records |
| GET/POST | `/api/fuel` | Fuel logs |
| GET/POST | `/api/expenses` | Fleet expenses |
| GET | `/api/reports/summary` | Analytics data |
| GET/POST | `/api/settings` | Depot settings & RBAC |

---

## Project Structure

```
TransitOps/
├── database/
│   ├── schema.sql          # All table definitions
│   └── seed.js             # Sample data loader
├── public/
│   ├── css/                # One CSS file per page + global.css
│   ├── js/                 # One JS file per page
│   ├── pages/              # HTML for each app page
│   └── index.html          # Login page
├── server/
│   ├── config/database.js  # PostgreSQL connection pool
│   ├── controllers/        # Business logic per module
│   ├── middleware/         # JWT auth + RBAC guards
│   ├── routes/             # Express router per module
│   └── app.js              # Express app setup
├── server.js               # Entry point
├── .env.example            # Environment variable template
└── package.json
```

---

## License

MIT — built for the Odoo Hackathon 2026 by **Team TransitOps**.
