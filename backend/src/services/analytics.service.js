const { Cabin, CabinAllotment, Room, RoomBooking, Request, Hardware, Consumable } = require('../models');
const { CABIN_STATUS, ALLOTMENT_STATUS, BOOKING_STATUS, REQUEST_STATUS, REQUEST_TYPE, ROOM_TYPE } = require('../constants/enums');
const { timeToMinutes: toMinutes } = require('../utils/time');

const DAY = 86400000;
const OPEN_MINUTES_PER_DAY = 11 * 60; // rooms are scheduled 09:00-20:00
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utcMidnight = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const round1 = (n) => Math.round(n * 10) / 10;

// 30d -> 6 x 5-day buckets, 90d -> 6 x 15-day buckets, 1y -> 12 calendar months.
function buildBuckets(period, now = new Date()) {
  const today = utcMidnight(now);
  const end = new Date(today.getTime() + DAY); // exclusive
  if (period === '1y') {
    const buckets = [];
    for (let i = 11; i >= 0; i -= 1) {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i + 1, 1));
      buckets.push({ start, end: next > end ? end : next, label: MONTHS[start.getUTCMonth()] });
    }
    return buckets;
  }
  const days = period === '90d' ? 90 : 30;
  const size = days / 6;
  const first = new Date(end.getTime() - days * DAY);
  return Array.from({ length: 6 }, (_, i) => {
    const start = new Date(first.getTime() + i * size * DAY);
    return { start, end: new Date(start.getTime() + size * DAY), label: `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}` };
  });
}

const bucketIndex = (buckets, d) => buckets.findIndex((b) => d >= b.start && d < b.end);

async function overview(period = '30d') {
  if (!['30d', '90d', '1y'].includes(period)) period = '30d';
  const now = new Date();
  const buckets = buildBuckets(period, now);
  const from = buckets[0].start;
  const to = buckets[buckets.length - 1].end;
  const n = buckets.length;

  const [requests, cabinTotal, allotments, rooms, bookings] = await Promise.all([
    Request.find({ createdAt: { $gte: from } }).select('createdAt reviewedAt status type resourceId metadata').lean(),
    Cabin.countDocuments({ active: true }),
    CabinAllotment.find({
      status: { $in: [ALLOTMENT_STATUS.ACTIVE, ALLOTMENT_STATUS.APPROVED, ALLOTMENT_STATUS.EXPIRED] },
      startDate: { $lt: to }, endDate: { $gt: from },
    }).select('startDate endDate endedAt').lean(),
    Room.find({ active: true }).select('type').lean(),
    RoomBooking.find({
      date: { $gte: from, $lt: to }, isMaintenanceBlock: { $ne: true },
      status: { $in: [BOOKING_STATUS.APPROVED, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED] },
    }).populate('roomId', 'type').select('date startTime endTime roomId').lean(),
  ]);

  // Requests: volume, approvals, turnaround
  const volume = Array(n).fill(0); const approved = Array(n).fill(0);
  const turnSum = Array(n).fill(0); const turnCnt = Array(n).fill(0);
  const demand = new Map();
  const okStatuses = [REQUEST_STATUS.APPROVED, REQUEST_STATUS.ACTIVE, REQUEST_STATUS.COMPLETED];
  for (const r of requests) {
    const i = bucketIndex(buckets, new Date(r.createdAt));
    if (i < 0) continue;
    volume[i] += 1;
    if (okStatuses.includes(r.status)) approved[i] += 1;
    if (r.reviewedAt) { turnSum[i] += (new Date(r.reviewedAt) - new Date(r.createdAt)) / 3600000; turnCnt[i] += 1; }
    if (r.type === REQUEST_TYPE.HARDWARE) {
      const key = String(r.resourceId);
      demand.set(key, (demand.get(key) || 0) + (Number(r.metadata?.quantity) || 1));
    }
  }
  const turnaround = turnSum.map((s, i) => (turnCnt[i] ? round1(s / turnCnt[i]) : 0));

  // Cabin utilisation: allotted cabin-days / available cabin-days per bucket
  const cabinUtil = buckets.map((b) => {
    const days = (b.end - b.start) / DAY;
    let used = 0;
    for (const a of allotments) {
      const s = Math.max(new Date(a.startDate), b.start);
      const e = Math.min(a.endedAt ? new Date(a.endedAt) : new Date(a.endDate), b.end);
      if (e > s) used += (e - s) / DAY;
    }
    return Math.min(100, pct(used, cabinTotal * days));
  });

  // Room utilisation per room type
  const roomsOfType = (t) => rooms.filter((r) => r.type === t).length;
  const roomSeries = (type) => buckets.map((b) => {
    const days = (b.end - b.start) / DAY;
    const minutes = bookings
      .filter((bk) => bk.roomId?.type === type && new Date(bk.date) >= b.start && new Date(bk.date) < b.end)
      .reduce((s, bk) => s + Math.max(0, toMinutes(bk.endTime) - toMinutes(bk.startTime)), 0);
    return Math.min(100, pct(minutes, roomsOfType(type) * days * OPEN_MINUTES_PER_DAY));
  });

  // Hardware demand (top 6)
  const top = [...demand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const names = await Hardware.find({ _id: { $in: top.map(([id]) => id) } }).select('itemName').lean();
  const nameOf = new Map(names.map((h) => [String(h._id), h.itemName]));
  const hardwareDemand = top.map(([id, value]) => ({ label: nameOf.get(id) || 'Unknown item', value }));

  // Live snapshot
  const [cabinsByStatus, expiredAllotments, hw, stock] = await Promise.all([
    Cabin.aggregate([{ $match: { active: true } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    CabinAllotment.countDocuments({ status: ALLOTMENT_STATUS.ACTIVE, endDate: { $lt: now } }),
    Hardware.aggregate([{ $match: { active: true } }, { $group: { _id: null, total: { $sum: '$totalQuantity' }, available: { $sum: '$availableQuantity' } } }]),
    Consumable.aggregate([{ $match: { active: true } }, { $group: { _id: null, total: { $sum: 1 }, low: { $sum: { $cond: [{ $lte: ['$currentQuantity', '$lowStockThreshold'] }, 1, 0] } } } }]),
  ]);
  const statusCount = Object.fromEntries(cabinsByStatus.map((c) => [c._id, c.count]));
  const inUse = (statusCount[CABIN_STATUS.OCCUPIED] || 0) + (statusCount[CABIN_STATUS.RESERVED] || 0);
  const usable = cabinTotal - (statusCount[CABIN_STATUS.MAINTENANCE] || 0);
  const hwRow = hw[0] || { total: 0, available: 0 };

  return {
    period,
    labels: buckets.map((b) => b.label),
    requests: volume,
    approved,
    turnaround,
    cabinUtil,
    roomAI: roomSeries(ROOM_TYPE.AI_NEURAL_LAB),
    roomPod: roomSeries(ROOM_TYPE.PODCAST_ROOM),
    hardwareDemand,
    snapshot: {
      cabins: { total: cabinTotal, inUse, usable, utilization: pct(inUse, usable), byStatus: statusCount },
      expiredAllotments,
      hardware: { total: hwRow.total, available: hwRow.available, issued: hwRow.total - hwRow.available, utilization: pct(hwRow.total - hwRow.available, hwRow.total) },
      consumables: stock[0] || { total: 0, low: 0 },
    },
    generatedAt: now,
  };
}

module.exports = { overview, buildBuckets };
