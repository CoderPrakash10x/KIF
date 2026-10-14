const { Event, CabinAllotment, Cabin, Request } = require('../models');
const { EVENT_STATUS, ALLOTMENT_STATUS, CABIN_STATUS, REQUEST_STATUS } = require('../constants/enums');
const { withTransaction } = require('../utils/db');

// Mark PUBLISHED/ONGOING events COMPLETED once their end time has passed (otherwise they vanish from every list).
async function completePastEvents(now = new Date()) {
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
  const candidates = await Event.find({ status: { $in: [EVENT_STATUS.PUBLISHED, EVENT_STATUS.ONGOING] }, date: { $lte: today } }).select('date endTime');
  const ids = candidates
    .filter((e) => { const [h, m] = e.endTime.split(':').map(Number); return new Date(e.date.getTime() + (h * 60 + m) * 60000 - 330 * 60000) <= now; }) // end time is IST wall-clock
    .map((e) => e._id);
  if (ids.length) await Event.updateMany({ _id: { $in: ids }, status: { $in: [EVENT_STATUS.PUBLISHED, EVENT_STATUS.ONGOING] } }, { status: EVENT_STATUS.COMPLETED });
  console.log(`[CRON] Auto-completed ${ids.length} event(s).`);
}

// Reserved (APPROVED) allotments whose start date has arrived become ACTIVE / cabin OCCUPIED.
async function activateDueAllotments(now = new Date()) {
  const due = await CabinAllotment.find({ status: ALLOTMENT_STATUS.APPROVED, startDate: { $lte: now }, endDate: { $gt: now } }).select('_id cabinId');
  let n = 0;
  for (const a of due) {
    try {
      await withTransaction(async (session) => {
        const cabin = await Cabin.findOneAndUpdate({ _id: a.cabinId, currentAllotment: a._id, status: CABIN_STATUS.RESERVED }, { status: CABIN_STATUS.OCCUPIED }, { session });
        if (!cabin) return;
        await CabinAllotment.updateOne({ _id: a._id, status: ALLOTMENT_STATUS.APPROVED }, { status: ALLOTMENT_STATUS.ACTIVE }, { session });
        await Request.updateMany({ linkedTransactionId: a._id, status: REQUEST_STATUS.APPROVED }, { status: REQUEST_STATUS.ACTIVE }, { session });
        n += 1;
      });
    } catch (err) { console.error(`[CRON] Could not activate allotment ${a._id}:`, err); }
  }
  console.log(`[CRON] Activated ${n} due allotment(s).`);
}

module.exports = { completePastEvents, activateDueAllotments };
