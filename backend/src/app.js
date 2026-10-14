const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
// Express 5 makes req.query a getter; the classic express-mongo-sanitize cannot assign to it.
const sanitizeModule = require('@exortek/express-mongo-sanitize');
const mongoSanitize = sanitizeModule.default || sanitizeModule.expressMongoSanitize || sanitizeModule;
const env = require('./config/env');
const { generalApiLimiter } = require('./middleware/rateLimiter');
const compression = require('compression');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');

const app = express();
// Behind Render/Vercel/nginx the client IP and HTTPS come from the proxy (needed for rate limiting + secure cookies).
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(requestLogger);
app.use(compression());
app.use(helmet());
const allowedOrigins = env.FRONTEND_URL.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  credentials: true,
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(generalApiLimiter);

app.get('/api/v1/health', (req, res) => res.json({ success: true, status: 'ok', timestamp: new Date() })); // liveness
app.get('/api/v1/ready', (req, res) => { // readiness: only route traffic when MongoDB is connected
  const up = require('mongoose').connection.readyState === 1;
  res.status(up ? 200 : 503).json({ success: up, status: up ? 'ready' : 'db_unavailable' });
});

app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/users', require('./routes/user.routes'));
app.use('/api/v1/cabins', require('./routes/cabin.routes'));
app.use('/api/v1/hardware', require('./routes/hardware.routes'));
app.use('/api/v1/rooms', require('./routes/room.routes'));
app.use('/api/v1/events', require('./routes/event.routes'));
app.use('/api/v1/requests', require('./routes/request.routes'));
app.use('/api/v1/consumables', require('./routes/consumable.routes'));
app.use('/api/v1/no-dues', require('./routes/noDues.routes'));
app.use('/api/v1/notifications', require('./routes/notification.routes'));
app.use('/api/v1/audit-logs', require('./routes/audit.routes'));
app.use('/api/v1/analytics', require('./routes/analytics.routes'));
app.use('/api/v1/dashboard', require('./routes/dashboard.routes'));
app.use('/api/v1/qr', require('./routes/qr.routes'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' }));
app.use(errorHandler); // must be last

module.exports = app;