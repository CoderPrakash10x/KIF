# Changes in this release (registration OTP, approval, six rooms, auth visuals)

Files are relative to the project root. NEW = created, MODIFIED = changed, REMOVED = deleted (`VerifyEmail.jsx`: the e-mail link flow activated accounts without approval and is retired).

```
MODIFIED: backend/.env.example
MODIFIED: backend/package.json
MODIFIED: backend/scripts/seed.js
MODIFIED: backend/src/config/env.js
MODIFIED: backend/src/constants/enums.js
MODIFIED: backend/src/controllers/auth.controller.js
MODIFIED: backend/src/controllers/request.controller.js
MODIFIED: backend/src/controllers/room.controller.js
MODIFIED: backend/src/controllers/user.controller.js
MODIFIED: backend/src/jobs/index.js
MODIFIED: backend/src/middleware/auth.js
MODIFIED: backend/src/middleware/rateLimiter.js
MODIFIED: backend/src/models/Room.js
MODIFIED: backend/src/models/User.js
MODIFIED: backend/src/models/index.js
MODIFIED: backend/src/routes/auth.routes.js
MODIFIED: backend/src/routes/room.routes.js
MODIFIED: backend/src/routes/user.routes.js
MODIFIED: backend/src/services/auth.service.js
MODIFIED: backend/src/services/dashboard.service.js
MODIFIED: backend/src/services/notification.service.js
MODIFIED: backend/src/services/request.service.js
MODIFIED: backend/src/services/room.service.js
MODIFIED: backend/src/services/user.service.js
MODIFIED: backend/src/utils/email.js
MODIFIED: frontend/src/lib/api.js
MODIFIED: frontend/src/pages/auth/AuthLayout.jsx
MODIFIED: frontend/src/pages/auth/Register.jsx
MODIFIED: frontend/src/pages/dashboard/AdminDashboard.jsx
MODIFIED: frontend/src/pages/rooms/BookingsPage.jsx
MODIFIED: frontend/src/pages/rooms/RoomModals.jsx
MODIFIED: frontend/src/pages/rooms/RoomsPage.jsx
MODIFIED: frontend/src/pages/users/UsersPage.jsx
MODIFIED: frontend/src/routes/AppRoutes.jsx
MODIFIED: frontend/src/styles/pages.css
NEW: backend/scripts: migrate.js
NEW: backend/src/constants: colleges.js
NEW: backend/src/jobs: unverifiedCleanup.job.js
NEW: backend/src/models: EmailOtp.js
NEW: backend/src/services: emailOtp.core.js
NEW: backend/src/services: emailOtp.service.js
NEW: backend/src/services: roomAccess.service.js
NEW: backend/src/services: roomAdmin.service.js
NEW: backend/src/utils: accountGate.js
NEW: backend/src/utils: registrationRules.js
NEW: backend/src/utils: roomAccess.js
NEW: backend: tests
NEW: frontend/src/pages/auth: AuthArt.jsx
NEW: frontend/src/pages/rooms: RoomAdminModals.jsx
REMOVED: frontend/src/pages/auth/VerifyEmail.jsx
```

## API changes
- NEW `GET /auth/registration-options`, `POST /auth/verify-otp`, `POST /auth/resend-otp`
- CHANGED `POST /auth/register` (new fields, 202 generic response, OTP e-mailed), `GET /auth/verify-email` now 410 (link flow retired), login error codes `EMAIL_NOT_VERIFIED` / `ACCOUNT_PENDING_APPROVAL` / `ACCOUNT_REJECTED`
- NEW `POST /users/:id/approve`, `POST /users/:id/reject` (Super Admin); `GET /users` filters `approvalStatus`, `emailVerified`, search by roll number / branch
- NEW `PUT /rooms/:id/admin` (Super Admin); `GET /rooms` returns `canManage` and `assignedAdmin`, supports `?managed=true`; room, booking and request endpoints are room-scoped (`403 ROOM_FORBIDDEN`)
- CHANGED `PATCH /users/:id/status` cannot activate unapproved registrations (`409 APPROVAL_REQUIRED`)

## Schema changes (all backward compatible)
- `User`: college, branch, rollNumber, rollNumberKey, purpose, approvalStatus, approvalReviewedBy/At/Remarks, emailVerifiedAt; statuses `PENDING_APPROVAL`, `REJECTED`; unique partial index (college, rollNumberKey)
- `Room`: assignedAdmin, assignedBy, assignedAt, description; types CO_WORKING_SPACE, CONFERENCE_ROOM, FABRICATION_LAB, MAKER_LAB_3D; `capacity` no longer defaults to 1
- NEW collection `EmailOtp` (hashed codes, TTL index)
