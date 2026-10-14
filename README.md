# KIF-RMS — KIF Resource & Space Management System

Full-stack platform for **KIPM Innovation Foundation**: cabins & co-working, hardware, specialised rooms, events,
consumables, requests & approvals, notifications, analytics, audit logs, users and no-dues clearance.

```
kif-rms/
├── backend/    Node.js · Express 5 · MongoDB (Mongoose) · JWT   → REST API at /api/v1
├── frontend/   React 18 · Vite · React Router · plain CSS tokens → one SPA, role-based areas
└── README.md   (this file)
```

**All data is real.** The frontend contains no mock data: every screen reads from and writes to the backend API.

---

## 1. Quick start (local)

Requirements: Node 18+ (22 recommended), Docker (for MongoDB) *or* a MongoDB Atlas cluster.

```bash
# 1) MongoDB as a single-node replica set (transactions require a replica set)
cd backend
docker compose up -d

# 2) Backend
cp .env.example .env            # then edit secrets (see §3)
npm install
npm run seed                    # creates the Super Admin only
npm run seed:demo               # (optional, dev only) + demo users, cabins, hardware, rooms, consumables, events
npm run dev                     # http://localhost:5001 

# 3) Frontend (new terminal)
cd ../frontend
cp .env.example .env            # VITE_API_BASE_URL=http://localhost:5001/api/v1
npm install
npm run dev                     # http://localhost:5173
```

### Accounts (created by the seed scripts)

| Role | Email | Password |
| --- | --- | --- |
| SUPER_ADMIN | value of `SEED_ADMIN_EMAIL` (default `admin@kif-rms.com`) | `SEED_ADMIN_PASSWORD` (default `Admin@12345`) |
| ADMIN / FOUNDER / INTERN / STUDENT (demo only) | `admin.demo@kif-rms.com`, `founder.demo@…`, `intern.demo@…`, `student.demo@…` | `SEED_DEMO_PASSWORD` (default `Demo@12345`) |

Credentials live only in the environment / seed script — **never in the UI**. In production the seed requires
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and refuses to create demo data. Change the Super Admin password after first login.

---

## 2. Architecture

### One SPA, role-based areas

| Role | Lands on | Area |
| --- | --- | --- |
| SUPER_ADMIN, ADMIN | `/admin/dashboard` | dashboard · cabins · hardware · rooms · consumables · requests · events · analytics · audit-logs · users · no-dues · notifications · profile |
| FOUNDER | `/founder/dashboard` | dashboard · requests · bookings · events · no-dues · notifications · profile |
| INTERN | `/intern/dashboard` | same as founder |
| STUDENT | `/student/dashboard` | same as founder (no event proposals) |

Unauthenticated → `/login`. Wrong role/area → `/403`. Unknown URL → `/404`. Public pages: `/login`, `/register`,
`/verify-email`, `/forgot-password`, `/reset-password`.

### Security model

- **Backend RBAC is the real security layer** (`middleware/role.js` + service-level ownership checks). Hiding buttons in
  the UI is only UX.
- Access token (JWT, short-lived) is kept **in memory**; the refresh token is an **httpOnly cookie** scoped to
  `/api/v1/auth`. The client refreshes once on a 401 (single-flight) and retries; if refresh fails the user is signed out.
  Session is restored on reload through the refresh cookie.
- Helmet, CORS allow-list (`FRONTEND_URL`, comma-separated), rate limiting, Zod validation, Mongo operator sanitising
  (`@exortek/express-mongo-sanitize`, required for Express 5 — do not revert), bcrypt hashes, account lock-out, audit trail.
- Members never see other people's booking details; request/booking detail endpoints enforce ownership.

### Spec coverage (from *KIF-RMS Architecture, Detailed*)

| Spec | Implementation |
| --- | --- |
| 4.1 Auth & users | Register (college, department, branch, roll number…) → **email OTP** → **Super Admin approval**; JWT + refresh cookie; admin activate/deactivate + role change (Admin limited to non-elevated users); profile with photo (Cloudinary) and password change |
| 4.2 Cabins | Live status grid (Free/Requested/Reserved/Occupied/Expired/Maintenance), direct allotment with members, allotment history, maintenance override, allotment-letter upload route, 7-day expiry reminder + auto-release cron jobs |
| 4.3 Hardware | Catalogue with asset tags, quantity lots, conditions, CSV bulk import/export, request → approve → hand-over → return → inspect workflow, overdue tracking, damage logging, per-item history, walk-up direct issue |
| 4.4 Rooms | Slot calendar per room, DB-level conflict checks (transactional overlap check + partial unique index), purpose required, admin block/unblock, status flow Pending → Approved/Rejected → Completed, equipment checklist data on bookings |
| 4.5 Events | Admin create/edit/publish/cancel/complete; **venue auto-blocker both ways** (events lock room slots; room bookings block event venues); RSVP; **Founders/Interns propose events** (draft + request → admin approval) |
| 4.6 Requests | One engine for cabin/hardware/room/event; unified admin inbox tabbed by category; approve/reject with remarks; "My requests" with status tracking and hardware returns |
| 5.1 Consumables | Stock register, stock in/out with mandatory reason (usage history), low-stock threshold, automatic low-stock alerts |
| 5.2 Notifications | In-app bell (unread count, read/unread, mark all) + e-mail (Nodemailer, best-effort with retry job) |
| 5.3 Analytics | Cabin/room utilisation trends, request volume & turnaround, most-requested hardware, active vs expired allotments, 30d / 90d / 1y, CSV export |
| 5.4 Audit | Immutable chronological log (no update/delete anywhere); filter by actor, module, action, date; Super Admin full, Admin limited (own actions + operational modules); authenticated CSV export |
| 6 Phase 3 | QR codes for assets and rooms + scan/lookup (camera via BarcodeDetector or handheld scanner), event certificates (attendance → PDF), no-dues clearance, installable PWA (manifest + service worker) |

### Frontend structure

```
frontend/src/
  lib/api.js          HTTP client: bearer token, refresh-on-401, ApiError mapping, downloads, uploads
  context/            AuthContext (session), UnreadContext (bell), ToastContext
  constants/          roles.js (role → area, UI permissions), navigation.js
  routes/             AppRoutes (role areas), ProtectedRoute, RoleRoute (RoleArea / RoleGuard), PermissionGuard
  hooks/              useApi / useServerList (server pagination), useSubmit, useRowAction, useFields, …
  components/         ui · forms (incl. async UserPicker) · modals · tables (server-paginated DataTable) · charts · layout
  pages/              one folder per module (admin pages and member pages)
```

Server-side pagination/search is used for users, requests, hardware, cabins, consumables, audit logs and notifications,
so the UI scales to large datasets.

---

## 3. Configuration

`backend/.env` (see `.env.example`): `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, SMTP settings, `FRONTEND_URL`,
optional `COOKIE_DOMAIN`, `COOKIE_SAMESITE`, `RATE_LIMIT_MAX`, Cloudinary keys (photo upload, allotment letters,
certificates), seed variables.

`frontend/.env`: `VITE_API_BASE_URL` (default `http://localhost:5001/api/v1`).

## 4. Deployment notes

- **Frontend (Vercel / any static host):** `npm run build` → `dist/`. Add an SPA fallback rewrite to `/index.html`.
- **Backend (Render / any Node host):** `npm start`. Set `NODE_ENV=production` and all secrets. Use MongoDB Atlas (replica set).
- **Different sites** (e.g. `*.vercel.app` + `*.onrender.com`): set `COOKIE_SAMESITE=none` (HTTPS only) and list the exact
  frontend origin in `FRONTEND_URL`; or put both under one parent domain and keep `strict`/`lax` with `COOKIE_DOMAIN`.
- Cron jobs (expiry reminders, auto-release, overdue hardware, low stock, event reminders, e-mail retry) run inside the API process.

---

## 5. Changes made to the supplied backend

Fixed (bugs found while integrating): missing `notify` / `notifyAdmins` / `retryEmailDelivery` in
`notification.service.js` (request creation would have crashed), Zod 4 error handling (`.issues`), Mongoose 9
`pre()` hooks (no `next`), empty `config/cloudinary.js`, race-prone request numbers (atomic counter), unescaped regex
search inputs, `express-mongo-sanitize` → `@exortek/express-mongo-sanitize`, stale lockfile, `start`/`dev` scripts swapped,
test-only packages moved to `devDependencies`, cookie clearing attributes, general rate limit made configurable.

Access control tightened: request and booking detail endpoints now enforce ownership; hardware transaction history is
admin-only; room availability hides other members' identities; draft/cancelled events are invisible to members.

Added: `/notifications`, `/audit-logs` (+ meta, detail, CSV export), `/analytics/overview`, `/dashboard/summary`,
`/hardware/summary`, `/consumables/summary`, `/hardware/:id/issue-direct`, `/events/propose`,
`/cabins/allotments/upload-letter`, `/qr/*`, unified room schedule (bookings + event blocks), request search, populated
request resources, seed script, Mongo replica-set `docker-compose.yml`, `.env.example`.

## 6. Registration, OTP and approval

### Fields
Full name · College (fixed list) · Department · Branch · Roll number · Email · Password · Purpose *(optional)* · Contact *(optional)* · Requested category (Founder / Intern / Student; never Admin).
Colleges (served by `GET /auth/registration-options`, the single source of truth): **KIPM - College of Engineering & Technology**, **KIPM - College of Management**, **Kailash Institute of Pharmacy & Management**.
Department and Branch are stored separately (free text: the repository has no authoritative list). Roll number is trimmed and **unique per college** (case/format-insensitive; legacy users are exempt).

### Lifecycle
1. `POST /auth/register` validates, stores the registration (bcrypt password hash; status `PENDING_VERIFICATION`, `approvalStatus=PENDING`) and e-mails a 6-digit OTP. The response is generic and never contains the OTP.
2. `POST /auth/verify-otp` checks the code. Success sets `emailVerified=true`, status `PENDING_APPROVAL` and notifies the Super Admin. The user sees *"Email verified successfully. Your account is awaiting Super Admin approval."*
3. The Super Admin reviews the details in **Users** (college, department, branch, roll number, verification state, purpose) and approves (`POST /users/:id/approve`) or rejects (`/reject`). Only then does the account become `ACTIVE` and able to sign in.
4. `POST /auth/resend-otp` issues a new code (invalidating the old one).

### The three states are independent
| State | Meaning | Field |
| --- | --- | --- |
| Email verified | The person controls the address (OTP proved it) | `emailVerified` |
| Account approved | A Super Admin accepted the registration | `approvalStatus` (`PENDING` / `APPROVED` / `REJECTED`) |
| Account active | Allowed to use the app right now | `status` (`ACTIVE`, `PENDING_APPROVAL`, `PENDING_VERIFICATION`, `REJECTED`, `DEACTIVATED`, `EXITED`) |

Access requires all three (`utils/accountGate.js`, enforced on login, token refresh **and every authenticated request**). Admins cannot activate a pending registration through the status endpoint (409 `APPROVAL_REQUIRED`). Legacy users with no `approvalStatus` are treated as approved, so the existing Super Admin and users keep working without a migration.

### OTP security
CSPRNG 6-digit code · stored only as an HMAC-SHA256 keyed with a server secret and bound to the user · single use (atomic consume, so concurrent submissions cannot both succeed) · expires (`OTP_EXPIRY_MINUTES`) · a new code replaces the old one · wrong-guess cap (`OTP_MAX_ATTEMPTS`, atomic) · resend cooldown (`OTP_RESEND_COOLDOWN_SECONDS`) · hourly send cap per account (`OTP_MAX_SENDS_PER_HOUR`) · per-IP limiters on register / verify / resend · raw codes are never logged or returned · generic responses avoid revealing whether an e-mail already has an account · delivery failure → `503 EMAIL_DELIVERY_FAILED`, missing SMTP → `503 EMAIL_NOT_CONFIGURED`.
Login now checks the password **before** revealing the account state. Never-verified registrations are removed after `UNVERIFIED_REGISTRATION_TTL_DAYS` (default 7) by a daily job; verified/approved accounts are never touched.

### E-mail configuration (required for OTP delivery)
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (now honoured) plus `OTP_EXPIRY_MINUTES`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_MAX_SENDS_PER_HOUR`, optional `OTP_SECRET`, `UNVERIFIED_REGISTRATION_TTL_DAYS`. See `backend/.env.example` (`.env` itself is never touched). **Real e-mail delivery could not be verified in the build environment (no SMTP / network); send a test registration after configuring SMTP.**

## 7. Rooms and room administrators

Six rooms: **AI / Neural Lab**, **Podcast Room** (unchanged, IDs and bookings preserved), **Co-working Space**, **Conference Room**, **Fabrication Lab**, **3D Maker Lab**. They live in the existing `Room` model and booking/request system (`type` enum extended).
Capacity and location of the four new rooms are **not invented**: they are left unset ("Not configured") until confirmed in *Rooms → Manage room*. All rooms use the platform-wide 09:00–20:00 slot window; there is no per-room opening-hours field (confirm if you need one).

**Authorization** (`utils/roomAccess.js`, enforced in controllers *and* in `request.service` approve/reject/cancel):
- Super Admin: every room, including unassigned ones; the only role that can assign administrators (`PUT /rooms/:id/admin`, with a confirmation step in the UI) or create/deactivate rooms.
- Admin: only rooms where `assignedAdmin` is them: view/approve/reject room requests, direct bookings, block/unblock, equipment, edit capacity/location/description. Other rooms return `403 ROOM_FORBIDDEN`; request lists, counts and notifications are scoped the same way; the Rooms page shows only their rooms.
- No fallback: an unassigned room is closed to every Admin. Assignment grants no global privileges; only active users with role ADMIN can be assigned; assignment fields cannot be changed through room edits.
- Non-room requests (cabin, hardware, event) keep their existing rules.
- **When an administrator changes:** authority is evaluated from the *current* assignment at decision time. Pending requests stay in place and are decided by the new administrator; existing bookings are untouched; each decision records who made it (`reviewedBy`, audit log). Old and new admins are notified.
- **Behaviour change to be aware of:** existing Admins lose approval rights over rooms until the Super Admin assigns them (by design, no fallback).

## 8. Commands

```bash
cd backend
npm install
npm run migrate        # idempotent: backfills approvalStatus, syncs indexes, creates the 4 missing rooms (no duplicates)
npm run seed           # optional; Super Admin (+ `npm run seed:demo` for dev data); never overwrites users, rooms or assignments
npm run dev            # API on :5001
npm test               # unit tests (node:test, no database needed)
npm run test:integration   # Jest + Supertest + in-memory MongoDB replica set (needs npm install)
cd ../frontend && npm install && npm run dev   # :5173
```

## 9. Verification status (please read)

**Executed and passing**
- Backend unit tests: `npm test` → **40 / 40 passed** (OTP engine: valid / invalid / expired / reused / attempt cap / concurrent submits / cooldown / hourly cap / delivery failure / no OTP in results / hashed at rest; registration rules: required fields, college allow-list, purpose optional, department vs branch, roll number, no admin self-selection; account gate: unverified, pending, approved, legacy, Super Admin; room policy for all six rooms, no fallback, reassignment, request scoping).
- Syntax check of every backend file; route ↔ controller and service cross-reference checks.
- Frontend, in headless Chromium against a stand-in API that mirrors the new contract: regression of all roles/pages (T1, T2: 0 failures) plus **46 new checks (T4, 0 failures)**: exact college options, field set, validation, OTP wrong-code / resend countdown / data preserved, exact success message, pending and unverified sign-in blocked, Super Admin review and approval, Admin has no approval controls, six rooms, assignment with confirmation, scoped room lists, cross-room approval refused, auth pages at 1440/768/375/320 px with inert decorative art, OTP usable on mobile. Responsive/overflow and accessibility sweeps pass (no page-level overflow).

**Written but NOT executed here** (no npm registry / MongoDB / SMTP in the build environment)
- `npm run test:integration` (Jest suites `tests/integration/registration.test.js`, `rooms.test.js`): real-database checks of registration persistence, unverified/pending/approved login, duplicate and roll-number handling, room-scoped approvals, reassignment, double-booking, and `approvalStatus`-less legacy users.
- Real MongoDB behaviour of the new queries / indexes, `migrate` and `seed` against a populated database, and real SMTP delivery. **Run `npm run migrate` and the integration suite once before go-live.**
- The frontend `npm run build` (Vite) was replaced by an esbuild bundle in this environment.

## 10. Open decisions
Roll-number uniqueness is per college (consequence: the same roll number may exist in two colleges; abandoned registrations free it after 7 days). Department/Branch are free text. New-room capacity/location and per-room opening hours need confirmation. Re-submitting an *unverified* registration replaces its details (ownership is proven by the OTP). Rotate any credentials from the originally supplied `.env`.
