const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// IP-based limiter — independent of the account-level lockout in User model.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // failed attempts per IP per window (shared campus NAT friendly); account lockout still applies per user
  skipSuccessfulRequests: true, // legitimate logins must not consume the budget
  message: { success: false, message: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, message: 'Too many password reset requests. Try again later.', code: 'RATE_LIMITED' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many sign-up attempts. Try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true, legacyHeaders: false,
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_MAX, // a single-page app issues several calls per screen; tune via RATE_LIMIT_MAX
  message: { success: false, message: 'Too many requests. Slow down.', code: 'RATE_LIMITED' },
});

module.exports = { registerLimiter, loginLimiter, forgotPasswordLimiter, generalApiLimiter };