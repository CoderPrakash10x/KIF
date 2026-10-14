// DB-backed room authorization. The decision itself lives in utils/roomAccess.js (pure, unit-tested).
// The CURRENT assignment is read at decision time, so reassigning a room takes effect immediately:
// pending requests/bookings stay where they are and are decided by whoever manages the room now.
const { Room, RoomBooking } = require('../models');
const ApiError = require('../utils/ApiError');
const { canManageRoom, requestScopeFilter, idOf } = require('../utils/roomAccess');

const forbidden = () => new ApiError(403, 'You are not assigned to manage this room', 'ROOM_FORBIDDEN');

async function assertManagesRoom(user, roomId, session) {
  const room = await Room.findById(roomId).session(session || null);
  if (!room) throw new ApiError(404, 'Room not found', 'NOT_FOUND');
  if (!canManageRoom(user, room)) throw forbidden();
  return room;
}

async function assertManagesBooking(user, bookingId, session) {
  const booking = await RoomBooking.findById(bookingId).session(session || null);
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  await assertManagesRoom(user, booking.roomId, session);
  return booking;
}

async function managedRoomIds(user) {
  if (user.role === 'SUPER_ADMIN') return (await Room.find({}).select('_id').lean()).map((r) => r._id);
  if (user.role !== 'ADMIN') return [];
  return (await Room.find({ assignedAdmin: user._id }).select('_id').lean()).map((r) => r._id);
}

// Mongo filter for Request queries made by an admin (null = unrestricted).
async function requestScope(user) {
  if (user.role === 'SUPER_ADMIN') return null;
  return requestScopeFilter(user, await managedRoomIds(user));
}

// ROOM requests may only be decided by the room's current administrator (or the Super Admin).
async function assertCanDecideRequest(user, request, session) {
  if (request.type !== 'ROOM') return;
  await assertManagesRoom(user, request.resourceId, session);
}

module.exports = { assertManagesRoom, assertManagesBooking, managedRoomIds, requestScope, assertCanDecideRequest, idOf };
