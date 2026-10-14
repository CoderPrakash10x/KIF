const { escapeRegex } = require('../utils/regex');
const { User } = require('../models');
const { ROLES, USER_STATUS } = require('../constants/enums');
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

  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'kif-rms/profile-photos', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(fileBuffer);
  });

  const previousId = user.profilePhoto?.publicId;
  user.profilePhoto = { url: uploadResult.secure_url, publicId: uploadResult.public_id };
  await user.save();
  // Only remove the old asset after the new one is safely stored.
  if (previousId) cloudinary.uploader.destroy(previousId).catch(() => {});

  return user;
}

// ---------------------------------------------------------------------------
// ADMIN — USER MANAGEMENT
// ---------------------------------------------------------------------------
async function listUsers({ role, status, search, page = 1, limit = 20 }) {
  const query = {};
  if (role) query.role = role;
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { name: { $regex: escapeRegex(search), $options: 'i' } },
      { email: { $regex: escapeRegex(search), $options: 'i' } },
    ];
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

  const oldValue = { status: targetUser.status };
  targetUser.status = newStatus;
  // Admin activation vouches for the account: without this an unverified user stays locked out of login.
  if (newStatus === USER_STATUS.ACTIVE) targetUser.emailVerified = true;

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

module.exports = {
  getProfile, updateProfile, updateProfilePhoto,
  listUsers, getUserById, assignRole, setUserStatus,
};