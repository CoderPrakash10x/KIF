# KIF-RMS Backend

Express 5 · MongoDB (Mongoose 9, replica set required) · JWT. API base: `/api/v1`.
Full local setup + deployment guide: see the **root `README.md`**.

```bash
cp .env.example .env && npm install && npm run secrets   # paste secrets into .env
npm run seed && npm run dev
npm test && npm run lint
```
Health: `/api/v1/health` (liveness) · `/api/v1/ready` (readiness, needs MongoDB).
