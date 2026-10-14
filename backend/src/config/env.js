require('dotenv').config();

const required = [
  'MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
  'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'FRONTEND_URL',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5001,
  MONGO_URI: process.env.MONGO_URI,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  REFRESH_TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,

  MAX_LOGIN_ATTEMPTS: 5,
  SMTP_FROM: process.env.SMTP_FROM || undefined,
  // Registration OTP (see README "Email OTP")
  OTP_EXPIRY_MINUTES: Number(process.env.OTP_EXPIRY_MINUTES) || 10,
  OTP_RESEND_COOLDOWN_SECONDS: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60,
  OTP_MAX_ATTEMPTS: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
  OTP_MAX_SENDS_PER_HOUR: Number(process.env.OTP_MAX_SENDS_PER_HOUR) || 5,
  OTP_SECRET: process.env.OTP_SECRET || process.env.JWT_SECRET,
  UNVERIFIED_REGISTRATION_TTL_DAYS: Number(process.env.UNVERIFIED_REGISTRATION_TTL_DAYS) || 7,
  LOCK_TIME_MS: 15 * 60 * 1000,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,

  FRONTEND_URL: process.env.FRONTEND_URL,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  COOKIE_SAMESITE: (process.env.COOKIE_SAMESITE || 'strict').toLowerCase(),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 1000,
};