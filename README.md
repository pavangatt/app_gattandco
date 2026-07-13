# Gatt & Co Care Tracking App

A React + Vite single-page application for the `app.gattandco.com` caregiver tracking experience.

## Project structure

- `index.html` — Vite entrypoint
- `src/main.tsx` — React bootstrap
- `src/App.tsx` — main dashboard UI
- `src/styles.css` — app styles
- `vite.config.js` — Vite configuration
- `package.json` — project dependencies and scripts

## Setup

Install dependencies:

```bash
npm install --legacy-peer-deps
```

## Run locally

1. Install dependencies if you have not already:

```bash
npm install
```

2. Start the backend in one terminal:

```bash
set "NODE_ENV=development"
node server.js
```

3. Start the frontend in another terminal:

```bash
npm run dev
```

4. Open the URL shown in the terminal, for example:

```text
http://localhost:5173/
```

The frontend dev server proxies `/api` requests to `http://localhost:5000`, so the backend must be running for login/register to work.

## Supabase setup

1. Create a Supabase project.
2. In Supabase, go to Project Settings -> API and copy:
- Project URL
- service_role key
3. Create `.env` from `.env.example` and set:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET
PORT=5000
```

4. In Supabase SQL Editor, run the contents of [supabase-schema.sql](supabase-schema.sql).

For existing deployments that already ran the base schema, also run these additive migrations in Supabase SQL Editor:
- [supabase-user-address-migration.sql](supabase-user-address-migration.sql)
- [supabase-userid-credentials-migration.sql](supabase-userid-credentials-migration.sql)
- [supabase-client-family-contacts-migration.sql](supabase-client-family-contacts-migration.sql)
- [supabase-assignment-structure-migration.sql](supabase-assignment-structure-migration.sql)
- [supabase-request-status-workflow-migration.sql](supabase-request-status-workflow-migration.sql)
- [supabase-assignment-approval-workflow-migration.sql](supabase-assignment-approval-workflow-migration.sql)
- [supabase-assignment-lifecycle-archive-migration.sql](supabase-assignment-lifecycle-archive-migration.sql)
- [supabase-long-term-daily-records-migration.sql](supabase-long-term-daily-records-migration.sql)
- [supabase-reminder-automation-migration.sql](supabase-reminder-automation-migration.sql)

This schema includes:
- Role-based users (`admin`, `buddy`, `client`)
- Elderly profiles and client visibility mapping
- Buddy-to-elderly assignments
- Visit planning, arrival/departure tracking, and daily notes
- Task tracking with carry-forward support
- Location logs and structured status checks
- Client request tracking

5. Optional: if you plan to query Supabase directly from frontend clients, run [supabase-rls.sql](supabase-rls.sql) to enforce Row Level Security policies for Admin/Buddy/Client access.

6. Optional demo seed data: run [supabase-seed.sql](supabase-seed.sql) in Supabase SQL Editor.

This seeds:
- 1 admin, 5 buddies, 20 clients
- 20 elderly profiles
- active assignments (round-robin buddy mapping)
- 30 days of visits, tasks, status checks, and location logs
- sample client requests

Default seeded password: `1234567890`

7. Start backend and frontend:

```bash
set "NODE_ENV=development"
node server.js
npm run dev
```

The backend now uses Supabase Postgres via `@supabase/supabase-js`.

Location visibility guard:
- Use `GET /api/location/current?assignment_id=...` for map-ready location reads.
- The endpoint returns location only when the assignment is active and approved.

Reminder automation:
- Configure reminder switches using `GET /api/reminders/config` and `PUT /api/reminders/config` (admin).
- Trigger cron-compatible D-1 reminder generation with `POST /api/reminders/run`.
- For scheduler calls without admin session, send `x-reminder-secret: <REMINDER_RUNNER_SECRET>`.

Calendar and monthly differences reporting:
- Monthly differences summary API: `GET /api/reports/monthly-summary?month=YYYY-MM`.
- Calendar aggregation API: `GET /api/reports/calendar?month=YYYY-MM`.
- Optional filters on both endpoints: `buddy_id`, `client_id`, `status`, `mode` (`short_term` or `long_term`).
- Responses reconcile planned/completed, rescheduled, missed, reminders sent, short-term package utilization, and long-term slot utilization.

## Build for production

```bash
npm run build
```

## Deploy to Hostinger

For Hostinger, upload the generated `dist/` content, not the raw source files.

1. Build the app:

```bash
npm run build
```

2. Upload these files to your Hostinger public folder:

- `dist/index.html`
- Everything under `dist/assets/`

3. If your Hostinger deployment supports Node-based builds, configure it to run:

```bash
npm install --legacy-peer-deps
npm run build
```

4. Make sure the final site is serving the built `dist/index.html`.

## Notes

- The app is currently a static dashboard prototype.
- It is ready for extending with real care management data, routing, and API integration.
