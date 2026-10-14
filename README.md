# KIF-RMS

Resource management for KIF: cabins, hardware, rooms, events, requests, consumables, no-dues.
`backend/` = Express 5 + MongoDB (replica set) · `frontend/` = React 18 + Vite.

---
## 1. Run it locally (≈10 minutes)

**Install once:** Node.js ≥ 20, Docker Desktop (for MongoDB + a fake inbox), Git.

```bash
# 0) from the repo root: start MongoDB (replica set) + Mailpit (catches e-mails)
docker compose up -d
#    wait ~15 s, check:  docker compose ps   (mongo should say "healthy")

# 1) backend
cd backend
cp .env.example .env          # Windows: copy .env.example .env
npm install
npm run secrets               # prints 2 random secrets -> paste into .env as JWT_SECRET / JWT_REFRESH_SECRET
#    in .env also set:  SEED_ADMIN_EMAIL=you@example.com   SEED_ADMIN_PASSWORD=<something strong>
npm run seed                  # creates your Super Admin (verified + active)
npm run seed:demo             # optional: demo users, cabins, hardware, rooms, events (dev only)
npm run dev                   # API on http://localhost:5001   (check /api/v1/ready -> "ready")

# 2) frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173  (Vite proxies /api -> :5001, so no CORS/cookie setup needed)
```

**Try it:**
1. Open http://localhost:5173 → sign in with your seeded admin.
2. Register a new student at `/register` → open **http://localhost:8025** (Mailpit) → click the verification link → sign in.
3. Admin → Users shows the new user; Admin → Cabins/Hardware/Rooms to add resources.

**Tests / checks**
```bash
cd backend  && npm test && npm run lint     # 26 tests, no database needed
cd frontend && npm test && npm run build
```

**Common problems**
| Symptom | Fix |
|---|---|
| `MongoServerError: Transaction numbers are only allowed on a replica set` | You are not on the replica set. Use `docker compose up -d` and the `MONGO_URI` from `.env.example`. |
| Backend exits "Missing required environment variables" | `.env` incomplete – compare with `.env.example`. |
| No verification e-mail | Open http://localhost:8025 (Mailpit), not your real inbox. |
| Login says "Please verify your email" | Verify via the link, or Admin → Users → Activate. |
| `ECONNREFUSED` from the browser | Backend not running on :5001. |

---
## 2. Deploy

Two supported shapes. **Both keep the browser on ONE origin** (the API lives under `/api` of the same site). That is what makes the httpOnly refresh cookie work on every browser (Safari/Chrome block third-party cookies, which breaks Vercel-frontend + Render-API setups).

### A. One VPS with Docker (simplest, everything included)
```bash
cp .env.prod.example .env.prod      # fill FRONTEND_URL (https://…), JWT secrets (npm run secrets), SMTP_*, Cloudinary
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend sh -c "SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD='…(12+ chars)' node scripts/seed.js"
```
Put HTTPS in front (Caddy / Cloudflare / your provider) and point the domain at port 80. `FRONTEND_URL` must be the public https URL.
Prefer Atlas? Remove the `mongo` service and set `MONGO_URI`.

### B. Managed hosting
- **Frontend** (Vercel/Netlify): deploy `frontend/`, build `npm run build`, output `dist`. In `vercel.json` add a rewrite of `/api/*` to your backend URL so it stays same-origin, and keep `VITE_API_BASE_URL=/api/v1`.
- **Backend** (Render/Railway/Fly): root `backend/`, start `npm start`, env vars from `backend/.env.example`, `NODE_ENV=production`, health check path `/api/v1/ready`. **Database:** MongoDB Atlas (replica set by default).
- If you really must use different sites: `COOKIE_SAMESITE=none` (HTTPS only) — expect session loss on Safari. Not recommended.

### Production checklist
- [ ] Secrets rotated, none ever committed (`.env` is git-ignored)
- [ ] `NODE_ENV=production`, `FRONTEND_URL=https://…`
- [ ] Real SMTP working (send yourself a test registration)
- [ ] Cloudinary keys (photos, letters, certificates)
- [ ] Super Admin seeded with a strong password
- [ ] MongoDB replica set + automated backups (Atlas: enable; VPS: `mongodump` cron)
- [ ] Uptime monitor on `/api/v1/ready`; error tracking (e.g. Sentry) recommended
- [ ] Single backend instance (cron jobs have no distributed lock yet)

## 3. API notes
Base `/api/v1`. Envelope `{ success, data, pagination? }` or `{ success:false, message, code, requestId }`. Every response carries `X-Request-Id`; quote it when reporting a bug.
