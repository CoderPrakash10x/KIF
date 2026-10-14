const { parsePage, parseLimit } = require('../utils/pagination');
const roomService = require('../services/room.service');

// ---- Room Catalog ----
exports.createRoom = async (req, res, next) => {
  try {
    const room = await roomService.createRoom(req.body, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Room created', data: room });
  } catch (err) { next(err); }
};

exports.updateRoom = async (req, res, next) => {
  try {
    const room = await roomService.updateRoom(req.params.id, req.body, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
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
    const { type, page, limit } = req.query;
    const result = await roomService.listRooms({ type, page: parsePage(page), limit: parseLimit(limit, 20) });
    res.json({ success: true, ...result });
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
    const booking = await roomService.createDirectBooking(req.body, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Room booked directly', data: booking });
  } catch (err) { next(err); }
};

exports.blockMaintenance = async (req, res, next) => {
  try {
    const booking = await roomService.blockMaintenanceSlot(req.body, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Slot blocked for maintenance', data: booking });
  } catch (err) { next(err); }
};

exports.unblockMaintenance = async (req, res, next) => {
  try {
    const booking = await roomService.unblockMaintenanceSlot(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Maintenance block removed', data: booking });
  } catch (err) { next(err); }
};

// ---- Lifecycle ----
exports.activateBooking = async (req, res, next) => {
  try {
    const booking = await roomService.activateBooking(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Booking activated', data: booking });
  } catch (err) { next(err); }
};

exports.completeBooking = async (req, res, next) => {
  try {
    const booking = await roomService.completeBooking(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Booking completed', data: booking });
  } catch (err) { next(err); }
};

exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await roomService.cancelBooking(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Booking cancelled', data: booking });
  } catch (err) { next(err); }
};

// ---- Equipment Checklist ----
exports.checkOutEquipment = async (req, res, next) => {
  try {
    const booking = await roomService.checkOutEquipmentItem(req.params.id, req.body.itemName, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Equipment checked out', data: booking });
  } catch (err) { next(err); }
};

exports.checkInEquipment = async (req, res, next) => {
  try {
    const booking = await roomService.checkInEquipmentItem(req.params.id, req.body.itemName, req.user, req.body.remarks, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Equipment checked in', data: booking });
  } catch (err) { next(err); }
};

// ---- Read ----
exports.getAvailability = async (req, res, next) => {
  try {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    const { bookings, events } = await roomService.getRoomSchedule(req.params.id, req.query.date, req.query.toDate || req.query.date);
    const eventBlocks = events.map((e) => ({
      _id: `event-${e._id}`, date: e.date, startTime: e.startTime, endTime: e.endTime, status: 'APPROVED',
      isMaintenanceBlock: true, isEventBlock: true, purpose: `Event: ${e.title}`,
    }));
    // Members never see who booked a slot; they only recognise their own bookings.
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
    const result = await roomService.listBookings({ roomId, status, fromDate, toDate, page: parsePage(page), limit: parseLimit(limit, 20) });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.myBookings = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await roomService.listMyBookings(req.user._id, { status, page: parsePage(page), limit: parseLimit(limit, 20) });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await roomService.getBookingById(req.params.id);
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    const ownerId = String(booking.bookedBy?._id || booking.bookedBy);
    if (!isAdmin && ownerId !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this booking', code: 'FORBIDDEN' });
    }
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
};