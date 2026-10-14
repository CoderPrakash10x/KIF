const { z } = require('zod');
const { timeToMinutes } = require('../utils/time');
const { OPEN, CLOSE, MAX_MINUTES } = require('../constants/rooms');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const slot = (d, ctx) => {
  const s = timeToMinutes(d.startTime); const e = timeToMinutes(d.endTime);
  if (e <= s) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'endTime must be after startTime' });
  else if (s < timeToMinutes(OPEN) || e > timeToMinutes(CLOSE)) ctx.addIssue({ code: 'custom', path: ['startTime'], message: `Rooms are bookable ${OPEN}-${CLOSE}` });
  else if (e - s > MAX_MINUTES) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Bookings are limited to 4 hours' });
};

const directBookingSchema = z.object({
  roomId: objectId, date: z.coerce.date(), startTime: hhmm, endTime: hhmm,
  purpose: z.string().trim().min(3).max(500), bookedForUserId: objectId.optional(),
}).superRefine(slot);

const blockSchema = z.object({
  roomId: objectId, date: z.coerce.date(), startTime: hhmm, endTime: hhmm, reason: z.string().trim().min(2).max(300),
}).superRefine(slot);

module.exports = { directBookingSchema, blockSchema, slotRules: slot };
