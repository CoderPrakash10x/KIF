const roomAccess = require('../services/roomAccess.service');
const { canManageRoom } = require('../utils/roomAccess');
const roomAdminService = require('../services/roomAdmin.service');
const { Room, RoomBooking } = require('../models');
const ADMIN_EDITABLE = ['description', 'location', 'capacity', 'equipmentList'];
const SA_EDITABLE = [...ADMIN_EDITABLE, 'roomName', 'type'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const meta = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });
const roomService = require('../services/room.service');

// ---- Room Catalog ----
exports.createRoom = async (req, res, next) => {
  try {
    const room = await roomService.createRoom(pick(req.body, [...SA_EDITABLE, 'active']), req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Room created', data: room });
  } catch (err) { next(err); }
};

exports.updateRoom = async (req, res, next) => {
  try {
    await roomAccess.assertManagesRoom(req.user, req.params.id);
    const allowed = req.user.role === 'SUPER_ADMIN' ? SA_EDITABLE : ADMIN_EDITABLE;
    const room = await roomService.updateRoom(req.params.id, pick(req.body, allowed), req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Room updated', data: room });
  } catch (err) { next(err); }
};

exports.deactivateRoom = async (req, res, next) => {
  try {
    const room = await roomService.deactivateRoom(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Room deactivated', data: room });
  } catch (err) { next(err); }
};

exports.listRooms = async (req, res, next) => {
  try {
    const { type, managed, page, limit } = req.query;
    const p = Number(page) || 1; const l = Math.min(Number(limit) || 50, 100);
    const query = { active: true };
    if (type) query.type = type;
    if (managed === 'true' && req.user.role === 'ADMIN') query.assignedAdmin = req.user._id; // admins see only their rooms
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    const [rooms, total] = await Promise.all([
      Room.find(query).populate('assignedAdmin', 'name email').sort({ createdAt: 1, roomName: 1 }).skip((p - 1) * l).limit(l),
      Room.countDocuments(query),
    ]);
    const data = rooms.map((r) => {
      const o = r.toObject();
      o.canManage = canManageRoom(req.user, r);
      if (!isAdmin) delete o.assignedAdmin; // members do not need to know who administers a room
      return o;
    });
    res.json({ success: true, data, pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) } });
  } catch (err) { next(err); }
};

exports.assignAdmin = async (req, res, next) => {
  try {
    const room = await roomAdminService.assignRoomAdmin(req.params.id, req.body.adminId || null, req.user, meta(req));
    res.json({ success: true, message: room.assignedAdmin ? 'Room administrator assigned' : 'Room administrator removed', data: room });
  } catch (err) { next(err); }
};

exports.getRoomById = async (req, res, next) => {
  try {
    const room = await roomService.getRoomById(req.params.id);
    res.json({ success: true, data: room });
  } catch (err) { next(err); }
};

// ---- Direct Admin Booking & Maintenance ----
exports.createDirectBooking = async (req, res, next) => {
  try {
    await roomAccess.assertManagesRoom(req.user, req.body.roomId);
    const booking = await roomService.createDirectBooking(req.body, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Room booked directly', data: booking });
  } catch (err) { next(err); }
};

exports.blockMaintenance = async (req, res, next) => {
  try {
    await roomAccess.assertManagesRoom(req.user, req.body.roomId);
    const booking = await roomService.blockMaintenanceSlot(req.body, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Slot blocked for maintenance', data: booking });
  } catch (err) { next(err); }
};

exports.unblockMaintenance = async (req, res, next) => {
  try {
    await roomAccess.assertManagesBooking(req.user, req.params.id);
    const booking = await roomService.unblockMaintenanceSlot(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Maintenance block removed', data: booking });
  } catch (err) { next(err); }
};

// ---- Lifecycle ----
exports.activateBooking = async (req, res, next) => {
  try {
    await roomAccess.assertManagesBooking(req.user, req.params.id);
    const booking = await roomService.activateBooking(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Booking activated', data: booking });
  } catch (err) { next(err); }
};

exports.completeBooking = async (req, res, next) => {
  try {
    await roomAccess.assertManagesBooking(req.user, req.params.id);
    const booking = await roomService.completeBooking(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Booking completed', data: booking });
  } catch (err) { next(err); }
};

exports.cancelBooking = async (req, res, next) => {
  try {
    const existing = await RoomBooking.findById(req.params.id).select('bookedBy roomId');
    if (existing && String(existing.bookedBy) !== String(req.user._id)) await roomAccess.assertManagesBooking(req.user, req.params.id); // admin cancelling someone else's booking
    const booking = await roomService.cancelBooking(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Booking cancelled', data: booking });
  } catch (err) { next(err); }
};

// ---- Equipment Checklist ----
exports.checkOutEquipment = async (req, res, next) => {
  try {
    await roomAccess.assertManagesBooking(req.user, req.params.id);
    const booking = await roomService.checkOutEquipmentItem(req.params.id, req.body.itemName, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Equipment checked out', data: booking });
  } catch (err) { next(err); }
};

exports.checkInEquipment = async (req, res, next) => {
  try {
    await roomAccess.assertManagesBooking(req.user, req.params.id);
    const booking = await roomService.checkInEquipmentItem(req.params.id, req.body.itemName, req.user, req.body.remarks, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Equipment checked in', data: booking });
  } catch (err) { next(err); }
};

// ---- Read ----
exports.getAvailability = async (req, res, next) => {
  try {
    const { bookings, events, room } = await roomService.getRoomSchedule(req.params.id, req.query.date, req.query.toDate || req.query.date);
    const eventBlocks = events.map((e) => ({
      _id: `event-${e._id}`, date: e.date, startTime: e.startTime, endTime: e.endTime, status: 'APPROVED',
      isMaintenanceBlock: true, isEventBlock: true, purpose: `Event: ${e.title}`,
    }));
    // Members never see who booked a slot; they only recognise their own bookings.
    const isAdmin = canManageRoom(req.user, room);
    const shaped = bookings.map((b) => {
      const o = b.toObject();
      if (isAdmin) return o;
      const mine = String(o.bookedBy?._id) === String(req.user._id);
      return {
        _id: o._id, roomId: o.roomId, date: o.date, startTime: o.startTime, endTime: o.endTime, status: o.status,
        isMaintenanceBlock: o.isMaintenanceBlock, mine, purpose: mine || o.isMaintenanceBlock ? o.purpose : undefined,
        bookedBy: mine ? o.bookedBy : undefined,
      };
    });
    res.json({ success: true, data: [...shaped, ...eventBlocks] });
  } catch (err) { next(err); }
};

exports.listBookings = async (req, res, next) => {
  try {
    const { roomId, status, fromDate, toDate, page, limit } = req.query;
    let roomIds;
    if (req.user.role !== 'SUPER_ADMIN') {
      if (roomId) await roomAccess.assertManagesRoom(req.user, roomId);
      else roomIds = await roomAccess.managedRoomIds(req.user);
    }
    const result = await roomService.listBookings({ roomId, roomIds, status, fromDate, toDate, page: Number(page) || 1, limit: Math.min(Number(limit) || 20, 200) });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.myBookings = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await roomService.listMyBookings(req.user._id, { status, page: Number(page) || 1, limit: Number(limit) || 20 });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await roomService.getBookingById(req.params.id);
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    const ownerId = String(booking.bookedBy?._id || booking.bookedBy);
    if (isAdmin && ownerId !== String(req.user._id)) await roomAccess.assertManagesBooking(req.user, req.params.id);
    if (!isAdmin && ownerId !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this booking', code: 'FORBIDDEN' });
    }
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
};