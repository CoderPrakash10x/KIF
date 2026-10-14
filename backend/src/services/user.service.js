const { escapeRegex } = require('../utils/regex');
const { User } = require('../models');
const { ROLES, USER_STATUS, NOTIFICATION_TYPE } = require('../constants/enums');
const notificationService = require('./notification.service');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const cloudinary = require('../config/cloudinary');

// ---------------------------------------------------------------------------
// SELF-SERVICE PROFILE
// ---------------------------------------------------------------------------
async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  return user;
}

async function updateProfile(userId, updates) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  const oldValue = user.toObject();
  Object.assign(user, updates); // name, contact, department, startupName only — validated at route
  await user.save();

  await auditService.log({
    action: 'UPDATE_OWN_PROFILE', performedBy: user._id, role: user.role,
    module: 'USER', resourceType: 'User', resourceId: user._id,
    oldValue, newValue: user.toObject(),
  });

  return user;
}

async function updateProfilePhoto(userId, fileBuffer) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  // Clean up old photo from Cloudinary if one exists
  if (user.profilePhoto?.publicId) {
    await cloudinary.uploader.destroy(user.profilePhoto.publicId).catch(() => {});
  }

  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'kif-rms/profile-photos', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(fileBuffer);
  });

  user.profilePhoto = { url: uploadResult.secure_url, publicId: uploadResult.public_id };
  await user.save();

  return user;
}

// ---------------------------------------------------------------------------
// ADMIN — USER MANAGEMENT
// ---------------------------------------------------------------------------
async function listUsers({ role, status, search, approvalStatus, emailVerified, page = 1, limit = 20 }) {
  const query = {};
  if (role) query.role = role;
  if (status) query.status = status;
  if (approvalStatus === 'APPROVED') query.approvalStatus = { $in: ['APPROVED', null] }; // legacy users count as approved
  else if (approvalStatus) query.approvalStatus = approvalStatus;
  if (emailVerified === 'true' || emailVerified === true) query.emailVerified = true;
  if (emailVerified === 'false' || emailVerified === false) query.emailVerified = false;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    query.$or = [{ name: rx }, { email: rx }, { rollNumber: rx }, { department: rx }, { branch: rx }];
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(query),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  return user;
}

/**
 * Role assignment with strict privilege-escalation guards:
 *  - Only SUPER_ADMIN can grant ADMIN or SUPER_ADMIN roles.
 *  - ADMIN can only manage FOUNDER/INTERN/STUDENT role changes among themselves.
 *  - Nobody can modify their own role via this endpoint (prevents self-escalation loophole).
 */
async function assignRole(targetUserId, newRole, actorUser, meta = {}) {
  if (String(targetUserId) === String(actorUser._id)) {
    throw new ApiError(403, 'You cannot change your own role', 'SELF_ESCALATION_BLOCKED');
  }

  const elevatedRoles = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

  if (elevatedRoles.includes(newRole) && actorUser.role !== ROLES.SUPER_ADMIN) {
    throw new ApiError(403, 'Only Super Admin can assign Admin/Super Admin roles', 'FORBIDDEN');
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  if (elevatedRoles.includes(targetUser.role) && actorUser.role !== ROLES.SUPER_ADMIN) {
    throw new ApiError(403, 'Only Super Admin can modify Admin/Super Admin accounts', 'FORBIDDEN');
  }

  const oldValue = { role: targetUser.role };
  targetUser.role = newRole;
  targetUser.roleAssignedBy = actorUser._id;
  targetUser.roleAssignedAt = new Date();
  await targetUser.save();

  await auditService.log({
    action: 'ASSIGN_ROLE', performedBy: actorUser._id, role: actorUser.role,
    module: 'USER', resourceType: 'User', resourceId: targetUser._id,
    oldValue, newValue: { role: newRole }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return targetUser;
}

/**
 * Activate/Deactivate — same privilege guard pattern as assignRole.
 */
async function setUserStatus(targetUserId, newStatus, actorUser, meta = {}) {
  if (String(targetUserId) === String(actorUser._id)) {
    throw new ApiError(403, 'You cannot change your own account status', 'FORBIDDEN');
  }

  if (![USER_STATUS.ACTIVE, USER_STATUS.DEACTIVATED].includes(newStatus)) {
    throw new ApiError(400, 'Invalid status value', 'VALIDATION_ERROR');
  }

  const targetUser = await User.findById(targetUserId).select('+refreshTokens');
  if (!targetUser) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  const elevatedRoles = [ROLES.ADMIN, ROLES.SUPER_ADMIN];
  if (elevatedRoles.includes(targetUser.role) && actorUser.role !== ROLES.SUPER_ADMIN) {
    throw new ApiError(403, 'Only Super Admin can modify Admin/Super Admin accounts', 'FORBIDDEN');
  }

  // Activation must not bypass the registration workflow (verified e-mail + Super Admin approval).
  if (newStatus === USER_STATUS.ACTIVE && (!targetUser.emailVerified || ['PENDING', 'REJECTED'].includes(targetUser.approvalStatus))) {
    throw new ApiError(409, 'This registration has not been approved. Use "Approve registration" (Super Admin).', 'APPROVAL_REQUIRED');
  }

  const oldValue = { status: targetUser.status };
  targetUser.status = newStatus;

  // Force-logout everywhere when deactivating an account
  if (newStatus === USER_STATUS.DEACTIVATED) {
    targetUser.refreshTokens = [];
  }

  await targetUser.save();

  await auditService.log({
    action: newStatus === USER_STATUS.ACTIVE ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
    performedBy: actorUser._id, role: actorUser.role,
    module: 'USER', resourceType: 'User', resourceId: targetUser._id,
    oldValue, newValue: { status: newStatus }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return targetUser;
}

// ---- Registration review (Super Admin only) ----
const REVIEWABLE_ROLES = [ROLES.FOUNDER, ROLES.INTERN, ROLES.STUDENT];

async function reviewRegistration(targetUserId, decision, actorUser, { role, remarks } = {}, meta = {}) {
  if (actorUser.role !== ROLES.SUPER_ADMIN) throw new ApiError(403, 'Only the Super Admin can review registrations', 'FORBIDDEN');
  if (role && !REVIEWABLE_ROLES.includes(role)) throw new ApiError(400, 'Registrations can only be approved as Founder, Intern or Student', 'VALIDATION_ERROR');
  const approve = decision === 'APPROVE';
  const set = approve
    ? { approvalStatus: 'APPROVED', status: USER_STATUS.ACTIVE }
    : { approvalStatus: 'REJECTED', status: USER_STATUS.REJECTED };
  Object.assign(set, { approvalReviewedBy: actorUser._id, approvalReviewedAt: new Date(), approvalRemarks: remarks ? String(remarks).slice(0, 300) : undefined });
  if (approve && role) set.role = role;

  // Atomic: only a verified, still-pending registration can be decided (and only once).
  const target = await User.findOneAndUpdate(
    { _id: targetUserId, emailVerified: true, approvalStatus: 'PENDING', role: { $in: REVIEWABLE_ROLES } },
    { $set: set }, { new: true },
  );
  if (!target) {
    const existing = await User.findById(targetUserId).select('emailVerified approvalStatus role');
    if (!existing) throw new ApiError(404, 'User not found', 'NOT_FOUND');
    if (!existing.emailVerified) throw new ApiError(409, 'The applicant has not verified their email yet', 'EMAIL_NOT_VERIFIED');
    throw new ApiError(409, 'This registration has already been reviewed', 'ALREADY_REVIEWED');
  }
  await auditService.log({
    action: approve ? 'APPROVE_REGISTRATION' : 'REJECT_REGISTRATION', performedBy: actorUser._id, role: actorUser.role,
    module: 'USER', resourceType: 'User', resourceId: target._id,
    newValue: { approvalStatus: set.approvalStatus, role: target.role, remarks: set.approvalRemarks }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });
  const title = approve ? 'Your account was approved' : 'Your registration was not approved';
  const message = approve ? 'You can now sign in to KIF-RMS.' : `Your registration was not approved.${set.approvalRemarks ? ` Reason: ${set.approvalRemarks}` : ''}`;
  await notificationService.notify({ userId: target._id, type: NOTIFICATION_TYPE.GENERAL, title, message, relatedResourceType: 'User', relatedResourceId: target._id });
  return target;
}

module.exports = {
  reviewRegistration,
  getProfile, updateProfile, updateProfilePhoto,
  listUsers, getUserById, assignRole, setUserStatus,
};