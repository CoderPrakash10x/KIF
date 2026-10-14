const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// IP-based limiter — independent of the account-level lockout in User model.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window across all accounts
  message: { success: false, message: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, message: 'Too many password reset requests. Try again later.', code: 'RATE_LIMITED' },
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_MAX, // a single-page app issues several calls per screen; tune via RATE_LIMIT_MAX
  message: { success: false, message: 'Too many requests. Slow down.', code: 'RATE_LIMITED' },
});

// Registration / OTP endpoints: per-IP caps on top of the per-account caps enforced by the OTP engine.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many registration attempts. Try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true, legacyHeaders: false,
});
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { success: false, message: 'Too many verification attempts. Try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true, legacyHeaders: false,
});
const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many code requests. Try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true, legacyHeaders: false,
});

module.exports = { loginLimiter, forgotPasswordLimiter, generalApiLimiter, registerLimiter, otpVerifyLimiter, otpResendLimiter };