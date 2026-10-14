const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendEmail, verificationEmailTemplate, passwordResetEmailTemplate } = require('../utils/email');
const auditService = require('./audit.service');
const { USER_STATUS } = require('../constants/enums');

// ---------------------------------------------------------------------------
// REGISTER
// ---------------------------------------------------------------------------
async function register(payload) {
  const { name, email, password, role, contact, department, startupName } = payload;

  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, 'An account with this email already exists', 'EMAIL_EXISTS');

  const user = new User({
    name, email, role, contact, department, startupName,
    status: USER_STATUS.PENDING_VERIFICATION,
  });
  user.password = password; // triggers bcrypt hash via pre('save') hook

  const rawToken = user.generateEmailVerificationToken();
  await user.save();

  const verifyUrl = `${env.FRONTEND_URL.split(',')[0].trim()}/verify-email?token=${rawToken}`;
  sendEmail({ // fire-and-forget: SMTP latency/outage must not block or fail sign-up (resend endpoint exists)
    to: user.email,
    subject: 'Verify your KIF-RMS account',
    html: verificationEmailTemplate(user.name, verifyUrl),
  });

  await auditService.log({
    action: 'USER_REGISTERED', performedBy: user._id, role: user.role,
    module: 'AUTH', resourceType: 'User', resourceId: user._id,
    newValue: { email: user.email, role: user.role },
  });

  return { message: 'Registration successful. Please check your email to verify your account.' };
}

// ---------------------------------------------------------------------------
// EMAIL VERIFICATION
// ---------------------------------------------------------------------------
async function verifyEmail(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length < 10 || rawToken.length > 200) {
    throw new ApiError(400, 'Invalid or expired verification link', 'INVALID_TOKEN');
  }
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  // The hashed token is kept after use so a repeat click (mail scanners, double tabs) is idempotent.
  const user = await User.findOne({ emailVerificationToken: hashedToken })
    .select('+emailVerificationToken +emailVerificationExpires');
  if (!user) throw new ApiError(400, 'Invalid or expired verification link', 'INVALID_TOKEN');
  if (user.emailVerified) return { message: 'Email already verified. You can log in.' };
  if (!user.emailVerificationExpires || user.emailVerificationExpires < Date.now()) {
    throw new ApiError(400, 'Invalid or expired verification link', 'INVALID_TOKEN');
  }

  user.emailVerified = true;
  if (user.status === USER_STATUS.PENDING_VERIFICATION) user.status = USER_STATUS.ACTIVE;
  await user.save();
  return { message: 'Email verified successfully. You can now log in.' };
}

async function resendVerification(email) {
  const generic = { message: 'If that account exists and is unverified, a new verification link has been sent.' };
  const user = await User.findOne({ email });
  if (!user || user.emailVerified || user.status === USER_STATUS.DEACTIVATED) return generic;
  const rawToken = user.generateEmailVerificationToken();
  await user.save();
  sendEmail({
    to: user.email, subject: 'Verify your KIF-RMS account',
    html: verificationEmailTemplate(user.name, `${env.FRONTEND_URL.split(',')[0].trim()}/verify-email?token=${rawToken}`),
  });
  return generic;
}

// ---------------------------------------------------------------------------
// LOGIN — with account lockout + refresh token issuance
// ---------------------------------------------------------------------------
// Constant-ish work for unknown emails so response time doesn't reveal account existence.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5G3x0Bf6o0m1S6x3bq0nQ8bqP8D1cRa';

async function login({ email, password }, meta = {}) {
  const user = await User.findOne({ email }).select('+passwordHash +failedLoginAttempts +lockUntil +refreshTokens');

  if (!user) {
    await require('bcrypt').compare(password, DUMMY_HASH).catch(() => {});
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (user.isLocked) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new ApiError(423, `Account locked due to multiple failed attempts. Try again in ${minutesLeft} minute(s).`, 'ACCOUNT_LOCKED');
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    // Atomic increment: parallel guesses cannot race past the counter.
    const updated = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedLoginAttempts: 1 } }, { new: true }).select('+failedLoginAttempts');
    if (updated.failedLoginAttempts >= env.MAX_LOGIN_ATTEMPTS) {
      await User.updateOne({ _id: user._id }, { $set: { lockUntil: new Date(Date.now() + env.LOCK_TIME_MS), failedLoginAttempts: 0 } });
    }
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Account-state details are only revealed to someone who proved they know the password.
  if (user.status === USER_STATUS.DEACTIVATED) {
    throw new ApiError(403, 'This account has been deactivated. Contact admin.', 'ACCOUNT_DEACTIVATED');
  }
  if (!user.emailVerified) {
    throw new ApiError(403, 'Please verify your email before logging in.', 'EMAIL_NOT_VERIFIED');
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = new Date();

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.pruneRefreshTokens();
  user.addRefreshToken(refreshToken, {
    deviceInfo: meta.userAgent?.slice(0, 200), ipAddress: meta.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_MS),
  });
  await user.save();

  await auditService.log({
    action: 'USER_LOGIN', performedBy: user._id, role: user.role,
    module: 'AUTH', resourceType: 'User', resourceId: user._id,
    ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return { user, accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// REFRESH TOKEN ROTATION
// ---------------------------------------------------------------------------
async function refreshAccessToken(rawRefreshToken, meta = {}) {
  if (!rawRefreshToken) throw new ApiError(401, 'Refresh token missing', 'NO_REFRESH_TOKEN');

  let decoded;
  try { decoded = verifyRefreshToken(rawRefreshToken); } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const user = await User.findById(decoded.sub).select('+refreshTokens');
  if (!user) throw new ApiError(401, 'User not found', 'INVALID_REFRESH_TOKEN');
  if (user.status === USER_STATUS.DEACTIVATED || !user.emailVerified) {
    throw new ApiError(401, 'Session is no longer valid', 'INVALID_REFRESH_TOKEN');
  }

  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  const storedToken = user.refreshTokens.find((t) => t.tokenHash === tokenHash);

  if (!storedToken) {
    // Unknown token: replay/theft. Revoke every session.
    user.refreshTokens = [];
    await user.save();
    throw new ApiError(401, 'Refresh token reuse detected. All sessions have been logged out.', 'TOKEN_REUSE_DETECTED');
  }

  // A token rotated moments ago is a benign race (two tabs reloading together), not theft:
  // hand out a fresh pair but keep every other session intact.
  const withinGrace = storedToken.rotatedAt && Date.now() - storedToken.rotatedAt <= User.ROTATION_GRACE_MS;
  if (storedToken.rotatedAt && !withinGrace) {
    user.refreshTokens = [];
    await user.save();
    throw new ApiError(401, 'Refresh token reuse detected. All sessions have been logged out.', 'TOKEN_REUSE_DETECTED');
  }

  if (!storedToken.rotatedAt) user.markRefreshTokenRotated(rawRefreshToken);
  const newRefreshToken = generateRefreshToken(user);
  user.addRefreshToken(newRefreshToken, {
    deviceInfo: meta.userAgent?.slice(0, 200), ipAddress: meta.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_MS),
  });
  user.pruneRefreshTokens();
  await user.save();

  return { user, accessToken: generateAccessToken(user), refreshToken: newRefreshToken };
}

// ---------------------------------------------------------------------------
// LOGOUT (single device) / LOGOUT ALL
// ---------------------------------------------------------------------------
// Works with an expired access token: the refresh cookie itself identifies the session to revoke.
async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return;
  let decoded;
  try { decoded = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET, { ignoreExpiration: true }); } catch { return; }
  const user = await User.findById(decoded.sub).select('+refreshTokens');
  if (!user) return;
  user.removeRefreshToken(rawRefreshToken);
  await user.save();
}

async function logoutAllDevices(userId, actor) {
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  user.refreshTokens = [];
  await user.save();

  await auditService.log({
    action: 'LOGOUT_ALL_DEVICES', performedBy: actor._id, role: actor.role,
    module: 'AUTH', resourceType: 'User', resourceId: user._id,
  });
}

// ---------------------------------------------------------------------------
// FORGOT / RESET PASSWORD
// ---------------------------------------------------------------------------
async function forgotPassword(email) {
  const user = await User.findOne({ email });
  // Deliberately don't reveal whether the email exists — prevents user enumeration.
  if (!user) return { message: 'If an account exists with this email, a reset link has been sent.' };

  const rawToken = user.generatePasswordResetToken();
  await user.save();

  const resetUrl = `${env.FRONTEND_URL.split(',')[0].trim()}/reset-password?token=${rawToken}`;
  sendEmail({
    to: user.email,
    subject: 'Reset your KIF-RMS password',
    html: passwordResetEmailTemplate(user.name, resetUrl),
  });

  return { message: 'If an account exists with this email, a reset link has been sent.' };
}

async function resetPassword(rawToken, newPassword) {
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires +refreshTokens +failedLoginAttempts +lockUntil');

  if (!user) throw new ApiError(400, 'Invalid or expired reset link', 'INVALID_TOKEN');

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // security: force logout of all existing sessions on password reset
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  await auditService.log({
    action: 'PASSWORD_RESET', performedBy: user._id, role: user.role,
    module: 'AUTH', resourceType: 'User', resourceId: user._id,
  });

  return { message: 'Password reset successful. Please log in with your new password.' };
}

async function changePassword(userId, currentPassword, newPassword, meta = {}) {
  const user = await User.findById(userId).select('+passwordHash +refreshTokens');
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');

  user.password = newPassword;
  // End every other session, but keep this device signed in (the UI promises exactly that).
  const refreshToken = generateRefreshToken(user);
  user.refreshTokens = [];
  user.addRefreshToken(refreshToken, {
    deviceInfo: meta.userAgent?.slice(0, 200), ipAddress: meta.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_MS),
  });
  await user.save();

  await auditService.log({
    action: 'PASSWORD_CHANGED', performedBy: user._id, role: user.role,
    module: 'AUTH', resourceType: 'User', resourceId: user._id,
  });

  return { message: 'Password changed. Other devices have been signed out.', refreshToken };
}

module.exports = {
  register, verifyEmail, resendVerification, login, refreshAccessToken,
  logout, logoutAllDevices, forgotPassword, resetPassword, changePassword,
};