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

```bash
npm run dev
```

Open the URL shown in the terminal, for example:

```text
http://localhost:5174/
```

## Build for production

```bash
npm run build
```

## Notes

- The app is currently a static dashboard prototype.
- It is ready for extending with real care management data, routing, and API integration.
