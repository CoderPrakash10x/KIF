const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { ROLES, USER_STATUS } = require('../constants/enums');

const SALT_ROUNDS = 12;

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true }, // store hash, not raw token
    deviceInfo: { type: String },
    ipAddress: { type: String },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date }, // set when rotated; entry kept briefly so concurrent tabs don't trigger reuse detection
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },

    passwordHash: { type: String, required: true, select: false },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.STUDENT,
      required: true,
    },

    contact: { type: String, trim: true },

    department: { type: String, trim: true },

    startupName: { type: String, trim: true }, // relevant for FOUNDER role

    profilePhoto: {
      url: { type: String },
      publicId: { type: String }, // Cloudinary reference for deletion
    },

    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.PENDING_VERIFICATION,
    },

    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },

    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Multi-device refresh token support with rotation
    refreshTokens: { type: [refreshTokenSchema], select: false, default: [] },

    // Login rate limiting / account lock support
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },

    lastLogin: { type: Date },

    // Set when Admin assigns/changes role — audit trail reference
    roleAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    roleAssignedAt: { type: Date },
  },
  { timestamps: true }
);

// ---------- Indexes ----------
userSchema.index({ role: 1, status: 1 });

// ---------- Virtuals ----------
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ---------- Hooks ----------
// Password is set via a virtual `password` field so raw password never persists
userSchema.virtual('password').set(function (plain) {
  this._plainPassword = plain;
});

userSchema.pre('validate', async function () {
  if (this._plainPassword) {
    this.passwordHash = await bcrypt.hash(this._plainPassword, SALT_ROUNDS);
    this._plainPassword = undefined;
  }
});

// ---------- Instance Methods ----------
userSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
  return token; // raw token sent via email, hashed version stored
};

userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1h
  return token;
};

userSchema.methods.addRefreshToken = function (rawToken, meta = {}) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  if (!this.refreshTokens) {
    this.refreshTokens = [];
  }

  this.refreshTokens.push({
    tokenHash,
    deviceInfo: meta.deviceInfo,
    ipAddress: meta.ipAddress,
    expiresAt: meta.expiresAt,
  });
};

const ROTATION_GRACE_MS = 30 * 1000;
const MAX_SESSIONS = 10;
userSchema.statics.ROTATION_GRACE_MS = ROTATION_GRACE_MS;

// Drop expired sessions and rotated entries past the grace window; cap concurrent sessions.
userSchema.methods.pruneRefreshTokens = function () {
  const now = Date.now();
  this.refreshTokens = (this.refreshTokens || [])
    .filter((t) => t.expiresAt > now && !(t.rotatedAt && now - t.rotatedAt > ROTATION_GRACE_MS))
    .slice(-MAX_SESSIONS);
};

userSchema.methods.markRefreshTokenRotated = function (rawToken) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const t = this.refreshTokens.find((x) => x.tokenHash === tokenHash);
  if (t) t.rotatedAt = new Date();
};

userSchema.methods.removeRefreshToken = function (rawToken) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.refreshTokens = this.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
};

// ---------- toJSON cleanup (never leak sensitive fields) ----------
userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.refreshTokens;
    delete ret.emailVerificationToken;
    delete ret.passwordResetToken;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);