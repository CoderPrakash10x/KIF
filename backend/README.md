# KIF-RMS Backend

Express 5 · MongoDB (Mongoose 9) · JWT. API base: `/api/v1`.

```bash
docker compose up -d      # MongoDB replica set (transactions need one)
cp .env.example .env      # fill in secrets
npm install
npm run seed              # Super Admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
npm run seed:demo         # optional dev data
npm run dev               # or: npm start
```

Routes: `/auth` `/users` `/cabins` `/hardware` `/rooms` `/events` `/requests` `/consumables` `/no-dues`
`/notifications` `/audit-logs` `/analytics` `/dashboard` `/qr`. Response envelope:
`{ success, message?, data, pagination? }` or `{ success:false, message, code }`.

See the root `README.md` for architecture, security model, spec coverage and the list of changes.
