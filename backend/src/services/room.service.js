const { escapeRegex } = require('../utils/regex');
const { Room, RoomBooking, Request: RequestModel } = require('../models');
const {
  BOOKING_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPE,
  NOTIFICATION_TYPE,
  ROLES,
} = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/db');
const { rangesOverlap } = require('../utils/time');
const { normalizeToMidnightUTC } = require('../utils/date');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');

// ---------------------------------------------------------------------------
// ROOM CATALOG CRUD (Admin only)
// ---------------------------------------------------------------------------
async function createRoom(payload, adminUser, meta = {}) {
  const { roomName, type, capacity, location, equipmentList } = payload;
  const room = await Room.create({ roomName, type, capacity, location, equipmentList });

  await auditService.log({
    action: 'CREATE_ROOM', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'Room', resourceId: room._id,
    newValue: room.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return room;
}

async function updateRoom(roomId, updates, adminUser, meta = {}) {
  const room = await Room.findById(roomId);
  if (!room) throw new ApiError(404, 'Room not found', 'NOT_FOUND');

  const oldValue = room.toObject();
  const { roomName, type, capacity, location, equipmentList } = updates;
  Object.assign(room, Object.fromEntries(Object.entries({ roomName, type, capacity, location, equipmentList }).filter(([, v]) => v !== undefined)));
  await room.save();

  await auditService.log({
    action: 'UPDATE_ROOM', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'Room', resourceId: room._id,
    oldValue, newValue: room.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return room;
}

async function deactivateRoom(roomId, adminUser, meta = {}) {
  const room = await Room.findById(roomId);
  if (!room) throw new ApiError(404, 'Room not found', 'NOT_FOUND');

  room.active = false;
  await room.save();

  await auditService.log({
    action: 'DEACTIVATE_ROOM', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'Room', resourceId: room._id,
    newValue: { active: false }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return room;
}

async function listRooms({ type, page = 1, limit = 20 } = {}) {
  const query = { active: true };
  if (type) query.type = type;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Room.find(query).sort({ roomName: 1 }).skip(skip).limit(limit),
    Room.countDocuments(query),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getRoomById(roomId) {
  const room = await Room.findById(roomId);
  if (!room) throw new ApiError(404, 'Room not found', 'NOT_FOUND');
  return room;
}

// ---------------------------------------------------------------------------
// SHARED CONFLICT-CHECK — the single source of truth for slot overlap logic.
// Used by: (1) booking.handler.js (Request Engine, user-initiated requests)
//          (2) createDirectBooking / blockMaintenanceSlot below (admin-initiated)
//
// Checks two conflict sources per Section 10's corrected approach:
//   1. Existing APPROVED/ACTIVE RoomBooking records (includes maintenance blocks)
//   2. Other PENDING Requests for the same room/slot (prevents two pending
//      requests both later being approved into an overlap)
// Must always be called inside a DB transaction session for atomicity.
// ---------------------------------------------------------------------------
async function checkSlotConflict({ roomId, date, startTime, endTime, excludeRequestId, excludeBookingId, session }) {
  // Snapshot isolation alone lets two overlapping-but-different slots both commit (write skew).
  // Writing to the room row makes concurrent checks conflict; the loser retries and sees the winner.
  if (session) await Room.updateOne({ _id: roomId }, { $inc: { bookingSeq: 1 } }, { session });
  const normalizedDate = normalizeToMidnightUTC(date);

  const bookingQuery = {
    roomId,
    date: normalizedDate,
    status: { $in: [BOOKING_STATUS.APPROVED, BOOKING_STATUS.ACTIVE] },
  };
  if (excludeBookingId) bookingQuery._id = { $ne: excludeBookingId };

  const bookingConflicts = await RoomBooking.find(bookingQuery).session(session);

  const pendingQuery = {
    type: REQUEST_TYPE.ROOM,
    resourceId: roomId,
    startDate: normalizedDate,
    status: REQUEST_STATUS.PENDING,
  };
  if (excludeRequestId) pendingQuery._id = { $ne: excludeRequestId };
  const pendingConflicts = await RequestModel.find(pendingQuery).session(session);

  // Venue auto-blocker (spec 4.5): published events held in this room lock the slot.
  const { Event } = require('../models');
  const roomDoc = await Room.findById(roomId).select('roomName').session(session);
  const eventConflicts = roomDoc
    ? await Event.find({
      venue: new RegExp(`^${escapeRegex(roomDoc.roomName)}$`, 'i'), date: normalizedDate, status: { $in: ['PUBLISHED', 'ONGOING'] },
    }).session(session)
    : [];

  const candidates = [...bookingConflicts, ...pendingConflicts, ...eventConflicts];
  const conflict = candidates.some((c) => rangesOverlap(c.startTime, c.endTime, startTime, endTime));

  if (conflict) {
    throw new ApiError(409, 'This time slot conflicts with an existing booking or pending request', 'BOOKING_CONFLICT');
  }
}

// ---------------------------------------------------------------------------
// DIRECT ADMIN BOOKING — bypasses the Request Engine entirely (RBAC: "Direct")
// ---------------------------------------------------------------------------
async function createDirectBooking(payload, adminUser, meta = {}) {
  const { roomId, date, startTime, endTime, purpose, bookedForUserId } = payload;

  const booking = await withTransaction(async (session) => {
    const room = await Room.findById(roomId).session(session);
    if (!room || !room.active) throw new ApiError(404, 'Room not found', 'NOT_FOUND');

    await checkSlotConflict({ roomId, date, startTime, endTime, session });

    const isImmediate = false; // lifecycle ACTIVE is set by an admin at hand-over; a same-day booking is APPROVED until then

    const [created] = await RoomBooking.create(
      [{
        roomId,
        bookedBy: bookedForUserId || adminUser._id, // admin can book on behalf of a founder/staff
        date: normalizeToMidnightUTC(date),
        startTime,
        endTime,
        purpose,
        status: isImmediate ? BOOKING_STATUS.ACTIVE : BOOKING_STATUS.APPROVED,
        equipmentChecklist: (room.equipmentList || []).map((e) => ({ name: e.name })),
        approvedBy: adminUser._id,
      }],
      { session }
    );

    return created;
  });

  await auditService.log({
    action: 'CREATE_DIRECT_ROOM_BOOKING', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'RoomBooking', resourceId: booking._id,
    newValue: booking.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  if (booking.bookedBy.toString() !== adminUser._id.toString()) {
    await notificationService.notify({
      userId: booking.bookedBy,
      type: NOTIFICATION_TYPE.ROOM_BOOKING_APPROVED,
      title: 'Room Booked On Your Behalf',
      message: `A room has been booked for you on ${booking.date.toDateString()} (${startTime}-${endTime}).`,
      relatedResourceType: 'RoomBooking', relatedResourceId: booking._id,
    });
  }

  return booking;
}

// ---------------------------------------------------------------------------
// MAINTENANCE BLOCK — admin reserves a slot without a real user booking
// ---------------------------------------------------------------------------
async function blockMaintenanceSlot({ roomId, date, startTime, endTime, reason }, adminUser, meta = {}) {
  const booking = await withTransaction(async (session) => {
    const room = await Room.findById(roomId).session(session);
    if (!room || !room.active) throw new ApiError(404, 'Room not found', 'NOT_FOUND');

    await checkSlotConflict({ roomId, date, startTime, endTime, session });

    const [created] = await RoomBooking.create(
      [{
        roomId,
        bookedBy: adminUser._id,
        date: normalizeToMidnightUTC(date),
        startTime,
        endTime,
        purpose: reason || 'Maintenance / Admin Block',
        status: BOOKING_STATUS.APPROVED,
        isMaintenanceBlock: true,
        approvedBy: adminUser._id,
      }],
      { session }
    );

    return created;
  });

  await auditService.log({
    action: 'BLOCK_ROOM_MAINTENANCE', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'RoomBooking', resourceId: booking._id,
    newValue: booking.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return booking;
}

async function unblockMaintenanceSlot(bookingId, adminUser, meta = {}) {
  const booking = await RoomBooking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  if (!booking.isMaintenanceBlock) {
    throw new ApiError(400, 'This is not a maintenance block', 'INVALID_OPERATION');
  }

  const oldValue = booking.toObject();
  booking.status = BOOKING_STATUS.CANCELLED;
  await booking.save();

  await auditService.log({
    action: 'UNBLOCK_ROOM_MAINTENANCE', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'RoomBooking', resourceId: booking._id,
    oldValue, newValue: booking.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return booking;
}

// ---------------------------------------------------------------------------
// LIFECYCLE TRANSITIONS — admin-triggered (Section 10: Pending -> Approved -> Completed)
// ---------------------------------------------------------------------------
async function activateBooking(bookingId, adminUser, meta = {}) {
  const booking = await RoomBooking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  if (booking.status !== BOOKING_STATUS.APPROVED) {
    throw new ApiError(409, `Cannot activate a booking with status ${booking.status}`, 'INVALID_STATE');
  }

  const oldValue = booking.toObject();
  booking.status = BOOKING_STATUS.ACTIVE;
  await booking.save();

  await auditService.log({
    action: 'ACTIVATE_ROOM_BOOKING', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'RoomBooking', resourceId: booking._id,
    oldValue, newValue: booking.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return booking;
}

async function completeBooking(bookingId, adminUser, meta = {}) {
  const booking = await RoomBooking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  if (![BOOKING_STATUS.ACTIVE, BOOKING_STATUS.APPROVED].includes(booking.status)) {
    throw new ApiError(409, `Cannot complete a booking with status ${booking.status}`, 'INVALID_STATE');
  }

  const incompleteItems = booking.equipmentChecklist.filter((item) => item.checkedOut && !item.checkedIn);
  if (incompleteItems.length > 0) {
    throw new ApiError(
      409,
      `Cannot complete booking — ${incompleteItems.length} equipment item(s) not yet checked in: ${incompleteItems.map((i) => i.name).join(', ')}`,
      'EQUIPMENT_PENDING'
    );
  }

  const oldValue = booking.toObject();
  booking.status = BOOKING_STATUS.COMPLETED;
  await booking.save();

  await auditService.log({
    action: 'COMPLETE_ROOM_BOOKING', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'RoomBooking', resourceId: booking._id,
    oldValue, newValue: booking.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  // Keep the originating Request in sync, if this booking came from the Request Engine
   if (!booking.isMaintenanceBlock) {
    const requestService = require('./request.service'); // lazy require breaks the load-order cycle
    await requestService.syncRequestStatusByLinkedTransaction(booking._id, REQUEST_STATUS.COMPLETED);
  }

  return booking;
}

async function cancelBooking(bookingId, actorUser, meta = {}) {
  const booking = await RoomBooking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');

  const isOwner = String(booking.bookedBy) === String(actorUser._id);
  const isAdmin = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(actorUser.role);
  if (!isOwner && !isAdmin) throw new ApiError(403, 'Not authorized to cancel this booking', 'FORBIDDEN');

  const cancellableStatuses = [BOOKING_STATUS.APPROVED, BOOKING_STATUS.ACTIVE];
  if (!cancellableStatuses.includes(booking.status)) {
    throw new ApiError(409, `Cannot cancel a booking with status ${booking.status}`, 'INVALID_STATE');
  }

  const oldValue = booking.toObject();
  booking.status = BOOKING_STATUS.CANCELLED;
  await booking.save();

  await auditService.log({
    action: 'CANCEL_ROOM_BOOKING', performedBy: actorUser._id, role: actorUser.role,
    module: 'ROOM', resourceType: 'RoomBooking', resourceId: booking._id,
    oldValue, newValue: booking.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

   if (!booking.isMaintenanceBlock) {
    const requestService = require('./request.service');
    await requestService.syncRequestStatusByLinkedTransaction(booking._id, REQUEST_STATUS.CANCELLED);
  }

  return booking;
}

// ---------------------------------------------------------------------------
// EQUIPMENT CHECKLIST — item-level check-out / check-in
// ---------------------------------------------------------------------------
async function checkOutEquipmentItem(bookingId, itemName, adminUser, meta = {}) {
  const booking = await RoomBooking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');

  const item = booking.equipmentChecklist.find((i) => i.name === itemName);
  if (!item) throw new ApiError(404, `Equipment item "${itemName}" not found on this booking's checklist`, 'NOT_FOUND');
  if (item.checkedOut) throw new ApiError(409, `"${itemName}" is already checked out`, 'INVALID_STATE');

  item.checkedOut = true;
  await booking.save();

  await auditService.log({
    action: 'CHECKOUT_ROOM_EQUIPMENT', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'RoomBooking', resourceId: booking._id,
    newValue: { item: itemName, checkedOut: true }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return booking;
}

async function checkInEquipmentItem(bookingId, itemName, adminUser, remarks, meta = {}) {
  const booking = await RoomBooking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');

  const item = booking.equipmentChecklist.find((i) => i.name === itemName);
  if (!item) throw new ApiError(404, `Equipment item "${itemName}" not found on this booking's checklist`, 'NOT_FOUND');
  if (!item.checkedOut) throw new ApiError(409, `"${itemName}" was never checked out`, 'INVALID_STATE');
  if (item.checkedIn) throw new ApiError(409, `"${itemName}" is already checked in`, 'INVALID_STATE');

  item.checkedIn = true;
  if (remarks) item.remarks = remarks;
  await booking.save();

  await auditService.log({
    action: 'CHECKIN_ROOM_EQUIPMENT', performedBy: adminUser._id, role: adminUser.role,
    module: 'ROOM', resourceType: 'RoomBooking', resourceId: booking._id,
    newValue: { item: itemName, checkedIn: true, remarks }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return booking;
}

// ---------------------------------------------------------------------------
// READ — calendar view, listings, history
// ---------------------------------------------------------------------------
async function getRoomAvailability(roomId, date) {
  const normalizedDate = normalizeToMidnightUTC(date);
  const bookings = await RoomBooking.find({
    roomId,
    date: normalizedDate,
    status: { $in: [BOOKING_STATUS.APPROVED, BOOKING_STATUS.ACTIVE] },
  })
    .populate('bookedBy', 'name email')
    .sort({ startTime: 1 });

  return bookings;
}

async function listBookings({ roomId, status, fromDate, toDate, page = 1, limit = 20 } = {}) {
  const query = {};
  if (roomId) query.roomId = roomId;
  if (status) query.status = status;
  if (fromDate || toDate) {
    query.date = {};
    if (fromDate) query.date.$gte = normalizeToMidnightUTC(fromDate);
    if (toDate) query.date.$lte = normalizeToMidnightUTC(toDate);
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    RoomBooking.find(query)
      .populate('roomId', 'roomName type')
      .populate('bookedBy', 'name email')
      .sort({ date: 1, startTime: 1 })
      .skip(skip)
      .limit(limit),
    RoomBooking.countDocuments(query),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function listMyBookings(userId, { status, page = 1, limit = 20 } = {}) {
  const query = { bookedBy: userId };
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    RoomBooking.find(query)
      .populate('roomId', 'roomName type')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    RoomBooking.countDocuments(query),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getBookingById(bookingId) {
  const booking = await RoomBooking.findById(bookingId)
    .populate('roomId', 'roomName type equipmentList')
    .populate('bookedBy', 'name email')
    .populate('approvedBy', 'name email');
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  return booking;
}

// Unified schedule for a room: bookings + events held in the room (used by admin and member views).
async function getRoomSchedule(roomId, fromDate, toDate) {
  if (!fromDate || Number.isNaN(new Date(fromDate).getTime())) throw new ApiError(400, 'A valid date is required', 'VALIDATION_ERROR');
  if (toDate && (Number.isNaN(new Date(toDate).getTime()) || new Date(toDate) - new Date(fromDate) > 31 * 864e5)) throw new ApiError(400, 'Date range must be valid and at most 31 days', 'VALIDATION_ERROR');
  const { Event } = require('../models');
  const room = await Room.findById(roomId);
  if (!room) throw new ApiError(404, 'Room not found', 'NOT_FOUND');
  const from = normalizeToMidnightUTC(fromDate);
  const to = normalizeToMidnightUTC(toDate || fromDate);
  const statuses = [BOOKING_STATUS.APPROVED, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED];
  const [bookings, events] = await Promise.all([
    RoomBooking.find({ roomId, date: { $gte: from, $lte: to }, status: { $in: statuses } }).populate('bookedBy', 'name email').sort({ date: 1, startTime: 1 }),
    Event.find({
      venue: new RegExp(`^${escapeRegex(room.roomName)}$`, 'i'), date: { $gte: from, $lte: to }, status: { $in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
    }).select('title date startTime endTime'),
  ]);
  return { room, bookings, events };
}

module.exports = {
  getRoomSchedule,
  createRoom, updateRoom, deactivateRoom, listRooms, getRoomById,
  checkSlotConflict,
  createDirectBooking, blockMaintenanceSlot, unblockMaintenanceSlot,
  activateBooking, completeBooking, cancelBooking,
  checkOutEquipmentItem, checkInEquipmentItem,
  getRoomAvailability, listBookings, listMyBookings, getBookingById,
};