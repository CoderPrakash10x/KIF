// Production wiring of the OTP engine: Mongo-backed atomic store + the existing Nodemailer sender.
const { EmailOtp } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { sendEmail, otpEmailTemplate } = require('../utils/email');
const { createOtpService } = require('./emailOtp.core');

const toMs = (d) => (d ? new Date(d).getTime() : null);
const fromDoc = (d) => d && ({
  otpHash: d.otpHash, expiresAt: toMs(d.expiresAt), attempts: d.attempts, usedAt: toMs(d.usedAt),
  lastSentAt: toMs(d.lastSentAt), sendCount: d.sendCount, windowStart: toMs(d.windowStart),
});

const mongoStore = {
  async get(userKey) { return fromDoc(await EmailOtp.findOne({ userId: userKey }).lean()); },
  async put(userKey, doc) {
    await EmailOtp.findOneAndUpdate({ userId: userKey }, {
      $set: { otpHash: doc.otpHash, expiresAt: new Date(doc.expiresAt), attempts: 0, usedAt: null, lastSentAt: new Date(doc.lastSentAt), sendCount: doc.sendCount, windowStart: new Date(doc.windowStart) },
    }, { upsert: true });
  },
  async deleteIfHash(userKey, otpHash) { await EmailOtp.deleteOne({ userId: userKey, otpHash }); },
  async incrementAttempts(userKey, { now, max }) {
    return fromDoc(await EmailOtp.findOneAndUpdate(
      { userId: userKey, usedAt: null, expiresAt: { $gt: new Date(now) }, attempts: { $lt: max } },
      { $inc: { attempts: 1 } }, { new: true },
    ).lean());
  },
  async markUsed(userKey, otpHash, now) {
    return !!(await EmailOtp.findOneAndUpdate({ userId: userKey, otpHash, usedAt: null }, { $set: { usedAt: new Date(now) } }, { new: true }));
  },
};



const mailer = async ({ to, name, otp, expiresInMinutes }) => {
  const isDevelopment = env.NODE_ENV === 'development';

  const smtpConfigured =
    env.SMTP_HOST &&
    env.SMTP_USER &&
    env.SMTP_PASSWORD;

  // Local development: allow registration even when SMTP is not configured.
  if (!smtpConfigured) {
    if (isDevelopment) {
      console.warn(
        `[DEV ONLY] SMTP not configured. OTP for ${to}: ${otp}`
      );
      return true;
    }

    throw new ApiError(
      503,
      'Email delivery is not configured on the server.',
      'EMAIL_NOT_CONFIGURED'
    );
  }

  try {
    const delivered = await sendEmail({
      to,
      subject: 'Your KIF-RMS verification code',
      html: otpEmailTemplate(name, otp, expiresInMinutes),
    });

    if (delivered) {
      return true;
    }

    if (isDevelopment) {
      console.warn(
        `[DEV ONLY] Email delivery failed. OTP for ${to}: ${otp}`
      );
      return true;
    }

    return false;
  } catch (error) {
    if (isDevelopment) {
      console.warn(
        `[DEV ONLY] SMTP error: ${error.message}. OTP for ${to}: ${otp}`
      );
      return true;
    }

    throw error;
  }
};



const config = {
  expiryMs: env.OTP_EXPIRY_MINUTES * 60000,
  cooldownMs: env.OTP_RESEND_COOLDOWN_SECONDS * 1000,
  maxAttempts: env.OTP_MAX_ATTEMPTS,
  maxSendsPerHour: env.OTP_MAX_SENDS_PER_HOUR,
  secret: env.OTP_SECRET,
};

module.exports = { ...createOtpService({ store: mongoStore, mailer, config }), config, mongoStore };