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

## Hostinger MySQL setup

1. Confirm the Hostinger MySQL host name from your Hostinger control panel. It is usually a remote host like `mysqlXX.hostinger.com`, not `localhost`.
2. Update `.env` with the correct host and port:

```env
DB_HOST=your-hostinger-mysql-host
DB_PORT=3306
DB_USER=u243439679_app
DB_PASSWORD=!aw1@Mysql
DB_NAME=u243439679_gattandco
```

3. Start the backend again:

```bash
set "NODE_ENV=development"
node server.js
```

If the backend still fails, the error will tell us whether the host, port, or credentials are wrong.

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
