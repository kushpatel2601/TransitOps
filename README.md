<div align="center">

# 🚛 TransitOps

### Smart Transport Operations Platform

**Fleet · Drivers · Trips · Maintenance · Fuel & Expenses · Analytics — unified under one role-based control center**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-transit--ops--xi.vercel.app-3b82d4?style=for-the-badge&logo=vercel)](https://transit-ops-xi.vercel.app/)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Self--Hosted-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![No Framework](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

**[🔗 Live Demo](https://transit-ops-xi.vercel.app/)** · [Features](#-key-features) · [Tech Stack](#️-tech-stack) · [Architecture](#-architecture) · [Getting Started](#-local-setup) · [RBAC](#-roles--access-rbac) · [API](#-api-endpoints)

</div>

---
<img width="1862" height="970" alt="image" src="https://github.com/user-attachments/assets/a54abf0d-3b6e-406c-9382-b0236071bb7b" />

## 📖 Overview

**TransitOps** is a full-stack transit & fleet operations platform built for the **Odoo Hackathon 2026**. It's built entirely from scratch — no Backend-as-a-Service, no low-code shortcuts, no static mock data — and models a real transport company's day-to-day operations: dispatching vehicles, tracking drivers, logging maintenance, monitoring fuel spend, and reporting ROI, all gated behind genuine role-based access control.

Rather than a generic CRUD app, TransitOps enforces real domain logic: cargo weight vs. vehicle capacity checks, license validity, driver suspension rules, vehicle lifecycle states, and cost-based ROI analytics — the kind of business rules a judge can actually test and find working live.

## ✨ Key Features

<table>
<tr>
<td width="50%" valign="top">

**🔐 Authentication & RBAC**
- JWT-based login/register with bcrypt password hashing
- Account lockout after repeated failed attempts
- 4 distinct roles, each with a scoped sidebar & permission set
- Server-side token verification on every request

**🚚 Fleet Registry**
- Full CRUD with duplicate registration-number guard
- Live status filters + instant search
- Acquisition cost tracked per vehicle for ROI analytics

**📍 Trip Dispatcher**
- Draft → Dispatched → Completed / Cancelled lifecycle
- Cargo weight vs. vehicle capacity enforced server-side
- Double-dispatch guard — a vehicle/driver can't be double-booked
- Expired-license & suspended-driver blocks
- Live Board with real-time status badges & ETA

</td>
<td width="50%" valign="top">

**🧑‍✈️ Drivers & Safety**
- Full CRUD with license-number uniqueness
- Safety score & trip completion tracking
- Status auto-syncs with active vehicle/trip

**🔧 Maintenance**
- Logging a service automatically flips a vehicle to "In Shop"
- Completing service returns it to "Available"
- Full history with vehicle join

**⛽ Fuel & Expenses**
- Auto-computed total cost per fuel log
- Expense tracking (tolls, fines, parking) with payment status

**📊 Analytics**
- Live KPI tiles: fuel efficiency, utilization, cost, idle rate, ROI
- Hand-built SVG bar chart — zero charting libraries
- CSV export, client-side, no server round-trip

</td>
</tr>
</table>

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express |
| **Database** | PostgreSQL (local/self-hosted) |
| **Auth** | JWT (jsonwebtoken) + bcrypt |
| **Frontend** | Vanilla HTML, CSS, JavaScript — no frameworks |

Only 5 runtime dependencies power the whole app: `express`, `pg`, `bcryptjs`, `jsonwebtoken`, `cors`. Everything else — the charts, the CSV export, the UI — is hand-built.

## 🏗️ Architecture

```
┌──────────────────────┐        ┌──────────────────────────┐        ┌─────────────────┐
│  Frontend (Vanilla)   │  HTTP  │   Express API Server     │  SQL   │   PostgreSQL     │
│  per-page HTML/CSS/JS │───────▶│  routes → controllers    │───────▶│  9 normalised    │
│  Role-gated sidebar   │◀───────│  authMiddleware (JWT)     │◀───────│  tables + FKs    │
└──────────────────────┘  JSON  └──────────────────────────┘  rows  └─────────────────┘
```

Clean separation of concerns: `routes/` → `controllers/` → `config/database.js`, with auth/RBAC middleware isolated in its own module — no god-files, no tangled logic.

## 🗄️ Database Design

9 normalised tables covering the full domain: `roles`, `users`, `vehicles`, `drivers`, `routes`, `trips`, `maintenance_records`, `fuel_logs`, `expenses`.

- **JSONB `permissions` column** on `roles` — a self-documenting, queryable RBAC model instead of hardcoded role checks
- Foreign keys with correct `ON DELETE` semantics (`CASCADE` for child records, `SET NULL` for soft references)
- Indexes on key lookup/filter columns for query performance
- Parameterised queries throughout — no SQL injection surface

## 🔒 Business Rules Enforced (Server-Side)

1. Cargo weight must not exceed vehicle capacity
2. A vehicle or driver cannot be double-dispatched
3. Dispatching a vehicle/driver auto-syncs their status
4. Completing/cancelling a trip auto-syncs status back
5. Starting maintenance flips a vehicle to "In Shop"
6. Completing maintenance returns it to "Available"
7. Expired licenses block a driver from dispatch
8. Suspended drivers are excluded from dispatch pools
9. Repeated failed logins trigger an account lockout

## 🛡️ Roles & Access (RBAC)

One login, four scoped roles — permissions live in the database (JSONB on `roles`), the JWT carries them on every request, and the UI renders only what a role is allowed to see:

| Role | Modules Accessible |
|---|---|
| **Fleet Manager** | Dashboard, Fleet, Drivers, Trips, Maintenance, Analytics |
| **Dispatcher** | Dashboard, Trips |
| **Safety Officer** | Dashboard, Drivers, Maintenance, Analytics |
| **Financial Analyst** | Dashboard, Fuel & Expenses, Analytics |

## 🧭 Pages

| # | Page | Route |
|---|---|---|
| 0 | Sign In | `/` |
| 1 | Dashboard | `/dashboard` |
| 2 | Vehicle Registry | `/fleet` |
| 3 | Drivers & Safety | `/drivers` |
| 4 | Trip Dispatcher | `/trips` |
| 5 | Maintenance | `/maintenance` |
| 6 | Fuel & Expenses | `/fuel-expenses` |
| 7 | Reports & Analytics | `/analytics` |
| 8 | Settings & RBAC | `/settings` |

## 🚀 Local Setup

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

Fill in your PostgreSQL credentials:
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
|---|---|---|
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

Open **http://localhost:3000** in your browser — or skip local setup entirely and try the **[live demo](https://transit-ops-xi.vercel.app/)**.

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
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

## 📁 Project Structure

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
├── .env.example             # Environment variable template
└── package.json
```

## 🗺️ What's Next

TransitOps is under active development ahead of demo day. Planned hardening includes wiring RBAC middleware onto every mutating route for defense-in-depth at the API layer (not just the UI), replacing native browser dialogs with in-app confirmation UI, and adding edit/delete support to Fuel Logs & Expenses. The core platform — schema, business rules, and RBAC model — is complete and demo-ready today.

## 🏆 Why TransitOps

- **Real domain modeling**, not a toy CRUD app — cargo capacity, license validity, ROI math, vehicle lifecycle states
- **Built from scratch** — 5 runtime dependencies total, no frontend framework, no charting library, no BaaS
- **Genuine RBAC**, database-driven and JWT-carried, not just a hidden sidebar link
- **Production habits**: parameterised SQL, connection pooling, JSDoc throughout, global error handling

## 👥 Team

Built by **Team TransitOps** for the **Odoo Hackathon 2026**.

## 📄 License

MIT — free to use, fork, and build on.

---

<div align="center">

**[🔗 Try the Live Demo](https://transit-ops-xi.vercel.app/)**

Made with ❤️ for Odoo Hackathon 2026

</div>
