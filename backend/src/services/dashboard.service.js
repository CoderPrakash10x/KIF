const {
  User, Cabin, Hardware, HardwareTransaction, Request, Consumable, RoomBooking, Room, Notification,
} = require('../models');
const {
  ROLES, USER_STATUS, CABIN_STATUS, REQUEST_STATUS, HARDWARE_TXN_STATUS, BOOKING_STATUS,
} = require('../constants/enums');
const { timeToMinutes } = require('../utils/time');

const DAY = 86400000;
const OPEN_MINUTES_PER_DAY = 11 * 60;
const utcMidnight = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const countBy = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));

async function hardwareSummary() {
  const [row] = await Hardware.aggregate([
    { $match: { active: true } },
    { $group: {
      _id: null,
      items: { $sum: 1 },
      total: { $sum: '$totalQuantity' },
      available: { $sum: '$availableQuantity' },
      repair: { $sum: { $cond: [{ $eq: ['$condition', 'UNDER_REPAIR'] }, '$totalQuantity', 0] } },
      damaged: { $sum: { $cond: [{ $in: ['$condition', ['DAMAGED', 'LOST']] }, '$totalQuantity', 0] } },
    } },
  ]);
  const r = row || { items: 0, total: 0, available: 0, repair: 0, damaged: 0 };
  return { items: r.items, total: r.total, available: r.available, issued: Math.max(0, r.total - r.available - r.repair - r.damaged), repair: r.repair, damaged: r.damaged };
}

async function consumableSummary() {
  const [row] = await Consumable.aggregate([
    { $match: { active: true } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      low: { $sum: { $cond: [{ $lte: ['$currentQuantity', '$lowStockThreshold'] }, 1, 0] } },
      watch: { $sum: { $cond: [{ $and: [
        { $gt: ['$currentQuantity', '$lowStockThreshold'] },
        { $lte: ['$currentQuantity', { $multiply: ['$lowStockThreshold', 1.5] }] },
      ] }, 1, 0] } },
    } },
  ]);
  const r = row || { total: 0, low: 0, watch: 0 };
  return { total: r.total, low: r.low, watch: r.watch, healthy: r.total - r.low - r.watch };
}

async function roomUtilization(days = 7) {
  const start = utcMidnight(new Date());
  const end = new Date(start.getTime() + days * DAY);
  const [rooms, bookings] = await Promise.all([
    Room.countDocuments({ active: true }),
    RoomBooking.find({
      date: { $gte: start, $lt: end }, isMaintenanceBlock: { $ne: true },
      status: { $in: [BOOKING_STATUS.APPROVED, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED] },
    }).select('startTime endTime').lean(),
  ]);
  const minutes = bookings.reduce((s, b) => s + Math.max(0, timeToMinutes(b.endTime) - timeToMinutes(b.startTime)), 0);
  return pct(minutes, rooms * days * OPEN_MINUTES_PER_DAY);
}

async function adminSummary() {
  const [users, cabins, requests, hardware, consumables, roomUtil, counterActions] = await Promise.all([
    User.aggregate([{ $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } }]),
    Cabin.aggregate([{ $match: { active: true } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Request.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    hardwareSummary(),
    consumableSummary(),
    roomUtilization(7),
    HardwareTransaction.countDocuments({ status: { $in: [HARDWARE_TXN_STATUS.APPROVED, HARDWARE_TXN_STATUS.RETURNED] } }),
  ]);

  const byRole = {}; let total = 0; let active = 0; let deactivated = 0; let pending = 0;
  for (const u of users) {
    byRole[u._id.role] = (byRole[u._id.role] || 0) + u.count;
    total += u.count;
    if (u._id.status === USER_STATUS.ACTIVE) active += u.count;
    if (u._id.status === USER_STATUS.DEACTIVATED) deactivated += u.count;
    if (u._id.status === USER_STATUS.PENDING_VERIFICATION) pending += u.count;
  }
  const cabinCounts = countBy(cabins);
  const cabinTotal = Object.values(cabinCounts).reduce((a, b) => a + b, 0);
  const inUse = (cabinCounts[CABIN_STATUS.OCCUPIED] || 0) + (cabinCounts[CABIN_STATUS.RESERVED] || 0);
  const usable = cabinTotal - (cabinCounts[CABIN_STATUS.MAINTENANCE] || 0);
  const reqCounts = countBy(requests);

  return {
    scope: 'admin',
    users: { total, active, deactivated, pending, byRole },
    cabins: { total: cabinTotal, byStatus: cabinCounts, inUse, utilization: pct(inUse, usable) },
    hardware,
    consumables,
    rooms: { utilization: roomUtil },
    requests: {
      total: Object.values(reqCounts).reduce((a, b) => a + b, 0),
      pending: reqCounts[REQUEST_STATUS.PENDING] || 0,
      approved: (reqCounts[REQUEST_STATUS.APPROVED] || 0) + (reqCounts[REQUEST_STATUS.ACTIVE] || 0) + (reqCounts[REQUEST_STATUS.COMPLETED] || 0),
      rejected: reqCounts[REQUEST_STATUS.REJECTED] || 0,
    },
    counterActions: counterActions,
  };
}

async function memberSummary(user) {
  const today = utcMidnight(new Date());
  const [requests, bookings, held, unread] = await Promise.all([
    Request.aggregate([{ $match: { requestedBy: user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    RoomBooking.countDocuments({ bookedBy: user._id, date: { $gte: today }, status: { $in: [BOOKING_STATUS.APPROVED, BOOKING_STATUS.ACTIVE] } }),
    HardwareTransaction.find({
      requestedBy: user._id, status: { $in: [HARDWARE_TXN_STATUS.APPROVED, HARDWARE_TXN_STATUS.ISSUED, HARDWARE_TXN_STATUS.OVERDUE] },
    }).select('quantity status expectedReturnDate').lean(),
    Notification.countDocuments({ userId: user._id, read: false }),
  ]);
  const reqCounts = countBy(requests);
  const now = new Date();
  return {
    scope: 'member',
    requests: { total: Object.values(reqCounts).reduce((a, b) => a + b, 0), pending: reqCounts[REQUEST_STATUS.PENDING] || 0 },
    upcomingBookings: bookings,
    hardwareHeld: held.reduce((s, t) => s + (t.quantity || 1), 0),
    hardwareOverdue: held.filter((t) => t.status === HARDWARE_TXN_STATUS.OVERDUE || (t.status === HARDWARE_TXN_STATUS.ISSUED && t.expectedReturnDate && t.expectedReturnDate < now)).length,
    unreadNotifications: unread,
  };
}

async function getSummary(user) {
  return [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role) ? adminSummary() : memberSummary(user);
}

module.exports = { getSummary, hardwareSummary, consumableSummary, roomUtilization };
