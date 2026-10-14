// E-mail OTP engine. Pure logic with injected dependencies (store, mailer, clock, RNG) so every
// rule can be unit-tested without a database. services/emailOtp.service.js wires the real ones.
//
// Guarantees: 6-digit CSPRNG code · HMAC-hashed at rest (never stored/logged raw) · single use ·
// new code invalidates the old one · attempt cap · resend cooldown · hourly send cap ·
// atomic consume (concurrent verifications cannot both succeed).
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const generateOtp = (randomInt = crypto.randomInt) => String(randomInt(0, 1000000)).padStart(6, '0');

// OTP space is small, so the hash is keyed with a server secret and bound to the user.
const hashOtp = (otp, userKey, secret) => crypto.createHmac('sha256', secret).update(`${userKey}:${otp}`).digest('hex');

const safeEqualHex = (a, b) => {
  const x = Buffer.from(String(a), 'hex'); const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

function createOtpService({ store, mailer, config, now = Date.now, randomInt }) {
  const { expiryMs, cooldownMs, maxAttempts, maxSendsPerHour, secret } = config;
  const HOUR = 3600000;
  const secs = (ms) => Math.max(1, Math.ceil(ms / 1000));

  async function issue({ userKey, email, name }) {
    const t = now();
    const rec = await store.get(userKey);
    if (rec && t - rec.lastSentAt < cooldownMs) {
      return { sent: false, reason: 'COOLDOWN', retryAfterSec: secs(cooldownMs - (t - rec.lastSentAt)) };
    }
    const sameWindow = rec && t - rec.windowStart < HOUR;
    const sendCount = sameWindow ? rec.sendCount : 0;
    if (sendCount >= maxSendsPerHour) {
      return { sent: false, reason: 'SEND_LIMIT', retryAfterSec: secs(HOUR - (t - rec.windowStart)) };
    }
    const otp = generateOtp(randomInt);
    const doc = {
      otpHash: hashOtp(otp, userKey, secret), expiresAt: t + expiryMs, attempts: 0, usedAt: null,
      lastSentAt: t, sendCount: sendCount + 1, windowStart: sameWindow ? rec.windowStart : t,
    };
    await store.put(userKey, doc); // replaces any previous code => the old code is invalidated
    let delivered = false;
    try {
      delivered = await mailer({ to: email, name, otp, expiresInMinutes: Math.round(expiryMs / 60000) });
    } catch (e) {
      await store.deleteIfHash(userKey, doc.otpHash);
      if (e instanceof ApiError) throw e; // e.g. EMAIL_NOT_CONFIGURED
      delivered = false;
    }
    if (!delivered) {
      await store.deleteIfHash(userKey, doc.otpHash);
      throw new ApiError(503, 'We could not send the verification email. Please try again later.', 'EMAIL_DELIVERY_FAILED');
    }
    return { sent: true, expiresInSec: secs(expiryMs), retryAfterSec: secs(cooldownMs) };
  }

  async function verify({ userKey, otp }) {
    const invalid = () => new ApiError(400, 'The verification code is invalid or has expired.', 'INVALID_OTP');
    if (!/^\d{6}$/.test(String(otp || ''))) throw new ApiError(400, 'Enter the 6-digit code from your email.', 'INVALID_OTP');
    const t = now();
    const rec = await store.get(userKey);
    if (!rec || rec.usedAt) throw invalid();
    if (rec.expiresAt <= t) throw new ApiError(400, 'This code has expired. Request a new one.', 'OTP_EXPIRED');
    if (rec.attempts >= maxAttempts) {
      throw new ApiError(429, 'Too many incorrect attempts. Request a new code.', 'OTP_ATTEMPTS_EXCEEDED');
    }
    // Atomic attempt counter: concurrent guesses cannot exceed the cap.
    const counted = await store.incrementAttempts(userKey, { now: t, max: maxAttempts });
    if (!counted) throw new ApiError(429, 'Too many incorrect attempts. Request a new code.', 'OTP_ATTEMPTS_EXCEEDED');
    if (!safeEqualHex(hashOtp(String(otp), userKey, secret), counted.otpHash)) {
      const left = Math.max(0, maxAttempts - counted.attempts);
      const err = new ApiError(400, left ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. No attempts left; request a new code.', 'INVALID_OTP');
      err.remainingAttempts = left;
      throw err;
    }
    // Atomic single-use consume: exactly one concurrent request can win.
    const consumed = await store.markUsed(userKey, counted.otpHash, t);
    if (!consumed) throw invalid();
    return { verified: true };
  }

  return { issue, verify };
}

module.exports = { createOtpService, generateOtp, hashOtp, safeEqualHex };