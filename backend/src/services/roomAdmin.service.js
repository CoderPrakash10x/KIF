const { Room, User } = require('../models');
const { ROLES, USER_STATUS, NOTIFICATION_TYPE } = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');

// Super Admin assigns (or clears) the administrator responsible for one room.
// Only an ACTIVE user with the ADMIN role can be assigned; assignment grants NO global privileges.
async function assignRoomAdmin(roomId, adminId, actor, meta = {}) {
  if (actor.role !== ROLES.SUPER_ADMIN) throw new ApiError(403, 'Only the Super Admin can assign room administrators', 'FORBIDDEN');
  const room = await Room.findById(roomId);
  if (!room) throw new ApiError(404, 'Room not found', 'NOT_FOUND');

  let admin = null;
  if (adminId) {
    admin = await User.findById(adminId).select('name email role status emailVerified approvalStatus');
    if (!admin || admin.role !== ROLES.ADMIN || admin.status !== USER_STATUS.ACTIVE) {
      throw new ApiError(400, 'Choose an active user with the Admin role', 'VALIDATION_ERROR');
    }
  }
  const previous = room.assignedAdmin ? String(room.assignedAdmin) : null;
  if ((admin ? String(admin._id) : null) === previous) throw new ApiError(409, 'This administrator is already assigned to the room', 'NO_CHANGE');

  room.assignedAdmin = admin ? admin._id : null;
  room.assignedBy = actor._id;
  room.assignedAt = new Date();
  await room.save();

  await auditService.log({
    action: 'ASSIGN_ROOM_ADMIN', performedBy: actor._id, role: actor.role, module: 'ROOM', resourceType: 'Room', resourceId: room._id,
    oldValue: { assignedAdmin: previous }, newValue: { assignedAdmin: admin ? String(admin._id) : null }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });
  const base = { type: NOTIFICATION_TYPE.GENERAL, relatedResourceType: 'Room', relatedResourceId: room._id, email: false };
  if (admin) await notificationService.notify({ ...base, userId: admin._id, title: 'Room assignment', message: `You are now the administrator of ${room.roomName}.` });
  if (previous && previous !== String(admin?._id)) await notificationService.notify({ ...base, userId: previous, title: 'Room assignment changed', message: `You are no longer the administrator of ${room.roomName}.` });

  return Room.findById(room._id).populate('assignedAdmin', 'name email');
}

module.exports = { assignRoomAdmin };
