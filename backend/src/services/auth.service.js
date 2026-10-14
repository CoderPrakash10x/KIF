const crypto = require('crypto');
const { User } = require('../models');
const env = require('../config/env');
const emailOtp = require('./emailOtp.service');
const { accountGate } = require('../utils/accountGate');
const { rollKey } = require('../utils/registrationRules');
const ApiError = require('../utils/ApiError');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendEmail, verificationEmailTemplate, passwordResetEmailTemplate } = require('../utils/email');
const auditService = require('./audit.service');
const { USER_STATUS, APPROVAL_STATUS, NOTIFICATION_TYPE } = require('../constants/enums');
const notificationService = require('./notification.service');

// ---------------------------------------------------------------------------
// REGISTER
// ---------------------------------------------------------------------------
const GENERIC_REGISTER_MESSAGE = 'If the details are valid, a verification code has been sent to the email address provided.';

const otpPayload = (email, issued) => ({
  email,
  expiresInMinutes: Math.round(emailOtp.config.expiryMs / 60000),
  resendAfterSeconds: issued && issued.retryAfterSec ? issued.retryAfterSec : Math.round(emailOtp.config.cooldownMs / 1000),
});

// Step 1-4 of the registration flow: validate, store the (hashed-password) registration, e-mail an OTP.
// Responses are generic so the endpoint does not reveal whether an address already has an account.
async function register(payload, meta = {}) {
  const v = payload; // already validated + normalised by registrationSchema
  const key = rollKey(v.rollNumber);
  const existing = await User.findOne({ email: v.email }).select('+passwordHash');

  const rollClash = await User.findOne({
    college: v.college, rollNumberKey: key, ...(existing ? { _id: { $ne: existing._id } } : {}),
  }).select('_id');
  if (rollClash) {
    throw new ApiError(409, 'This roll number is already registered for the selected college.', 'ROLL_NUMBER_EXISTS');
  }

  // An account that is already verified/decided is never touched by a new registration attempt.
  if (existing && (existing.emailVerified || existing.approvalStatus === 'APPROVED' || existing.approvalStatus === 'REJECTED')) {
    await auditService.log({
      action: 'DUPLICATE_REGISTRATION_ATTEMPT', performedBy: existing._id, role: existing.role, module: 'AUTH',
      resourceType: 'User', resourceId: existing._id, ipAddress: meta.ip, userAgent: meta.userAgent,
    });
    return { message: GENERIC_REGISTER_MESSAGE, data: otpPayload(v.email) };
  }

  let user = existing;
  try {
    if (!user) user = new User({ email: v.email, status: USER_STATUS.PENDING_VERIFICATION, emailVerified: false, approvalStatus: APPROVAL_STATUS.PENDING });
    // Latest unverified submission wins; ownership is proven by the OTP delivered to the address.
    Object.assign(user, {
      name: v.name, role: v.role, college: v.college, department: v.department, branch: v.branch, rollNumber: v.rollNumber,
      rollNumberKey: key, purpose: v.purpose, contact: v.contact, startupName: v.startupName,
    });
    if (!user.approvalStatus) user.approvalStatus = APPROVAL_STATUS.PENDING;
    user.password = v.password; // bcrypt-hashed by the pre-save hook; never stored in plaintext
    await user.save();
  } catch (err) {
    if (err && err.code === 11000) {
      const field = Object.keys(err.keyPattern || {});
      if (field.includes('rollNumberKey')) throw new ApiError(409, 'This roll number is already registered for the selected college.', 'ROLL_NUMBER_EXISTS');
      return { message: GENERIC_REGISTER_MESSAGE, data: otpPayload(v.email) }; // lost an e-mail race: stay generic
    }
    throw err;
  }

  const issued = await emailOtp.issue({ userKey: String(user._id), email: user.email, name: user.name });
  await auditService.log({
    action: 'USER_REGISTERED', performedBy: user._id, role: user.role, module: 'AUTH', resourceType: 'User', resourceId: user._id,
    newValue: { email: user.email, role: user.role, college: user.college, department: user.department, branch: user.branch },
    ipAddress: meta.ip, userAgent: meta.userAgent,
  });
  return { message: GENERIC_REGISTER_MESSAGE, data: otpPayload(user.email, issued) };
}

// Step 5-7: verify the OTP. Verification only proves e-mail ownership; the account stays PENDING_APPROVAL.
async function verifyOtp({ email, otp }, meta = {}) {
  const user = await User.findOne({ email });
  const reject = () => new ApiError(400, 'The verification code is invalid or has expired.', 'INVALID_OTP');
  if (!user || user.emailVerified || user.approvalStatus === APPROVAL_STATUS.REJECTED) throw reject();

  await emailOtp.verify({ userKey: String(user._id), otp }); // throws INVALID_OTP / OTP_EXPIRED / OTP_ATTEMPTS_EXCEEDED

  const updated = await User.findOneAndUpdate(
    { _id: user._id, emailVerified: false },
    { $set: { emailVerified: true, emailVerifiedAt: new Date(), status: USER_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
      $unset: { emailVerificationToken: '', emailVerificationExpires: '' } },
    { new: true },
  );
  if (!updated) throw reject();

  await auditService.log({
    action: 'EMAIL_VERIFIED', performedBy: user._id, role: user.role, module: 'AUTH', resourceType: 'User', resourceId: user._id,
    ipAddress: meta.ip, userAgent: meta.userAgent,
  });
  await notificationService.notifySuperAdmins({
    type: NOTIFICATION_TYPE.GENERAL, title: 'New registration awaiting approval',
    message: `${updated.name} (${updated.college}, roll ${updated.rollNumber}) verified their email and is waiting for approval.`,
    relatedResourceType: 'User', relatedResourceId: updated._id,
  });
  return { message: 'Email verified successfully. Your account is awaiting Super Admin approval.', data: { status: updated.status, approvalStatus: updated.approvalStatus } };
}

async function resendOtp({ email }) {
  const user = await User.findOne({ email });
  let issued = null;
  if (user && !user.emailVerified && user.approvalStatus !== APPROVAL_STATUS.REJECTED) {
    issued = await emailOtp.issue({ userKey: String(user._id), email: user.email, name: user.name });
  }
  return { message: GENERIC_REGISTER_MESSAGE, data: otpPayload(email, issued) };
}

// The old e-mail-link flow activated accounts without approval. It is retired.
async function verifyEmail() {
  throw new ApiError(410, 'Email links are no longer used. Verify with the 6-digit code instead.', 'VERIFICATION_LINK_RETIRED');
}

async function login({ email, password }, meta = {}) {
  const user = await User.findOne({ email }).select(
    '+passwordHash +failedLoginAttempts +lockUntil'
  );

  if (!user) throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

  if (user.isLocked) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new ApiError(423, `Account locked due to multiple failed attempts. Try again in ${minutesLeft} minute(s).`, 'ACCOUNT_LOCKED');
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= env.MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + env.LOCK_TIME_MS);
      user.failedLoginAttempts = 0; // reset counter once locked
    }
    await user.save();
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Password is correct: now (and only now) tell the owner why the account cannot be used yet.
  const blocked = accountGate(user);
  if (blocked) throw new ApiError(blocked.http, blocked.message, blocked.code);

  // Successful login — reset lockout counters
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = new Date();

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.addRefreshToken(refreshToken, {
    deviceInfo: meta.userAgent,
    ipAddress: meta.ip,
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
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const user = await User.findById(decoded.sub).select('+refreshTokens');
  if (!user) throw new ApiError(401, 'User not found', 'INVALID_REFRESH_TOKEN');

  const blocked = accountGate(user);
  if (blocked) throw new ApiError(blocked.http === 401 ? 401 : 403, blocked.message, blocked.code);

  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  const storedToken = user.refreshTokens.find((t) => t.tokenHash === tokenHash);

  if (!storedToken) {
    // Token not found in store — either already rotated/used, or a replay/theft attempt.
    // Security measure: invalidate ALL sessions for this user as a precaution.
    user.refreshTokens = [];
    await user.save();
    throw new ApiError(401, 'Refresh token reuse detected. All sessions have been logged out.', 'TOKEN_REUSE_DETECTED');
  }

  // Rotation: remove old, issue new
  user.removeRefreshToken(rawRefreshToken);
  const newRefreshToken = generateRefreshToken(user);
  user.addRefreshToken(newRefreshToken, {
    deviceInfo: meta.userAgent,
    ipAddress: meta.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_MS),
  });
  await user.save();

  const newAccessToken = generateAccessToken(user);

  return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// ---------------------------------------------------------------------------
// LOGOUT (single device) / LOGOUT ALL
// ---------------------------------------------------------------------------
async function logout(userId, rawRefreshToken) {
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return;

  if (rawRefreshToken) user.removeRefreshToken(rawRefreshToken);
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

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  await sendEmail({
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
  }).select('+passwordResetToken +passwordResetExpires +refreshTokens');

  if (!user) throw new ApiError(400, 'Invalid or expired reset link', 'INVALID_TOKEN');

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // security: force logout of all existing sessions on password reset
  await user.save();

  await auditService.log({
    action: 'PASSWORD_RESET', performedBy: user._id, role: user.role,
    module: 'AUTH', resourceType: 'User', resourceId: user._id,
  });

  return { message: 'Password reset successful. Please log in with your new password.' };
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash +refreshTokens');
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');

  user.password = newPassword;
  user.refreshTokens = []; // force re-login everywhere after password change
  await user.save();

  await auditService.log({
    action: 'PASSWORD_CHANGED', performedBy: user._id, role: user.role,
    module: 'AUTH', resourceType: 'User', resourceId: user._id,
  });

  return { message: 'Password changed successfully. Please log in again.' };
}

module.exports = {
  register, verifyOtp, resendOtp, verifyEmail, login, refreshAccessToken,
  logout, logoutAllDevices, forgotPassword, resetPassword, changePassword,
};