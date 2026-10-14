const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { ROLES, USER_STATUS, APPROVAL_STATUS } = require('../constants/enums');
const { COLLEGES } = require('../constants/colleges');

const SALT_ROUNDS = 12;

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    deviceInfo: { type: String },
    ipAddress: { type: String },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.STUDENT,
      required: true,
    },

    contact: {
      type: String,
      trim: true,
    },

    department: {
      type: String,
      trim: true,
    },

    startupName: {
      type: String,
      trim: true,
    },

    // Institutional details
    // Optional at schema level for backward compatibility.
    // The registration API should enforce required fields for new registrations.
    college: {
      type: String,
      enum: COLLEGES,
    },

    branch: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    rollNumber: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    rollNumberKey: {
      type: String,
      select: false,
    },

    purpose: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // Registration approval
    // No default: legacy users without this field remain compatible.
    approvalStatus: {
      type: String,
      enum: Object.values(APPROVAL_STATUS),
    },

    approvalReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    approvalReviewedAt: {
      type: Date,
    },

    approvalRemarks: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    emailVerifiedAt: {
      type: Date,
    },

    profilePhoto: {
      url: { type: String },
      publicId: { type: String },
    },

    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.PENDING_VERIFICATION,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationToken: {
      type: String,
      select: false,
    },

    emailVerificationExpires: {
      type: Date,
      select: false,
    },

    passwordResetToken: {
      type: String,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // Multi-device refresh-token support
    refreshTokens: {
      type: [refreshTokenSchema],
      select: false,
      default: [],
    },

    // Login rate limiting / account lock
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    lockUntil: {
      type: Date,
      select: false,
    },

    lastLogin: {
      type: Date,
    },

    // Role assignment audit information
    roleAssignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    roleAssignedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// --------------------------------------------------
// INDEXES
// --------------------------------------------------

userSchema.index({ email: 1 }, { unique: true });

userSchema.index({
  role: 1,
  status: 1,
});

userSchema.index({
  approvalStatus: 1,
  createdAt: -1,
});

// One normalized roll number per college.
// Legacy users without rollNumberKey are excluded.
userSchema.index(
  {
    college: 1,
    rollNumberKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      rollNumberKey: { $type: 'string' },
    },
  }
);

// --------------------------------------------------
// VIRTUALS
// --------------------------------------------------

userSchema.virtual('isLocked').get(function () {
  return Boolean(this.lockUntil && this.lockUntil > Date.now());
});

// --------------------------------------------------
// PASSWORD HASHING
// --------------------------------------------------

// Store the plaintext password temporarily on the document.
// It must never be persisted as a database field.
userSchema.virtual('password').set(function (plain) {
  this._plainPassword = plain;
});

// IMPORTANT:
// Mongoose validation runs before the save hook.
// Hash the password during pre-validation so passwordHash
// is populated before its required-field validation runs.
userSchema.pre('validate', async function () {
  if (this._plainPassword === undefined || this._plainPassword === null) {
    return;
  }

  if (typeof this._plainPassword !== 'string' || this._plainPassword.length === 0) {
    this.invalidate('passwordHash', 'A valid password is required');
    return;
  }

  this.passwordHash = await bcrypt.hash(
    this._plainPassword,
    SALT_ROUNDS
  );

  // Remove the temporary plaintext password from the document.
  this._plainPassword = undefined;
});

// --------------------------------------------------
// INSTANCE METHODS
// --------------------------------------------------

userSchema.methods.comparePassword = async function (plainPassword) {
  if (
    typeof plainPassword !== 'string' ||
    typeof this.passwordHash !== 'string' ||
    this.passwordHash.length === 0
  ) {
    return false;
  }

  return bcrypt.compare(plainPassword, this.passwordHash);
};

// --------------------------------------------------
// EMAIL VERIFICATION TOKEN
// --------------------------------------------------

userSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');

  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  this.emailVerificationExpires =
    Date.now() + 24 * 60 * 60 * 1000;

  return token;
};

// --------------------------------------------------
// PASSWORD RESET TOKEN
// --------------------------------------------------

userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  this.passwordResetExpires =
    Date.now() + 60 * 60 * 1000;

  return token;
};

// --------------------------------------------------
// REFRESH TOKEN MANAGEMENT
// --------------------------------------------------

userSchema.methods.addRefreshToken = function (rawToken, meta = {}) {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    throw new Error('A valid refresh token is required');
  }

  const tokenHash = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  // A select:false field may be absent from a document
  // loaded by a query that did not explicitly select it.
  // Initialize it before pushing a new token.
  if (!Array.isArray(this.refreshTokens)) {
    this.refreshTokens = [];
  }

  this.refreshTokens.push({
    tokenHash,
    deviceInfo: meta.deviceInfo,
    ipAddress: meta.ipAddress,
    expiresAt: meta.expiresAt,
  });
};

userSchema.methods.removeRefreshToken = function (rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    return;
  }

  const tokenHash = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  const currentTokens = Array.isArray(this.refreshTokens)
    ? this.refreshTokens
    : [];

  this.refreshTokens = currentTokens.filter(
    (token) => token.tokenHash !== tokenHash
  );
};

// --------------------------------------------------
// JSON CLEANUP
// Never expose sensitive fields in API responses.
// --------------------------------------------------

userSchema.set('toJSON', {
  virtuals: true,

  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.refreshTokens;

    delete ret.emailVerificationToken;
    delete ret.emailVerificationExpires;

    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;

    delete ret.failedLoginAttempts;
    delete ret.lockUntil;

    delete ret.rollNumberKey;

    delete ret.__v;

    return ret;
  },
});

// --------------------------------------------------
// MODEL EXPORT
// --------------------------------------------------

module.exports = mongoose.model('User', userSchema);