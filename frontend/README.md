# KIF-RMS Frontend

React 18 + Vite SPA. Talks to the backend at `VITE_API_BASE_URL` (default `http://localhost:5001/api/v1`).

```bash
cp .env.example .env
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ (installable PWA: manifest + service worker)
npm run format   # prettier
```

Role areas: `/admin/*` (Super Admin, Admin), `/founder/*`, `/intern/*`, `/student/*`. See the root `README.md`.
