const mongoose = require('mongoose');

// One live OTP per user (unique userId): issuing a new code replaces the previous one.
// Only a keyed hash of the code is stored. Records disappear automatically 1h after expiry.
const emailOtpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  usedAt: { type: Date, default: null },
  lastSentAt: { type: Date, required: true },
  sendCount: { type: Number, default: 1 },
  windowStart: { type: Date, required: true },
});
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
