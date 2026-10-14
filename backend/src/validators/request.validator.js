const { z } = require('zod');
const { REQUEST_TYPE } = require('../constants/enums');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

const createRequestSchema = z
  .object({
    type: z.enum(Object.values(REQUEST_TYPE)),
    resourceId: objectId,
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    purpose: z.string().min(3).max(1000),
    metadata: z.object({
      quantity: z.number().int().min(1).max(1000).optional(),
      startupName: z.string().trim().max(150).optional(),
      attendees: z.number().int().min(1).max(500).optional(),
      equipment: z.array(z.string().max(100)).max(30).optional(),
    }).strip().optional(),
  })
  .refine(
    (data) => {
      if (data.type === REQUEST_TYPE.ROOM) return !!(data.startDate && data.startTime && data.endTime);
      if (data.type === REQUEST_TYPE.CABIN) return !!(data.startDate && data.endDate);
      return true;
    },
    { message: 'Missing required date/time fields for the selected request type' }
  )
  .refine((d) => !(d.startDate && d.endDate) || d.endDate > d.startDate, { message: 'endDate must be after startDate', path: ['endDate'] })
  .refine((d) => !(d.startTime && d.endTime) || d.endTime > d.startTime, { message: 'endTime must be after startTime', path: ['endTime'] });

const reviewRequestSchema = z.object({
  remarks: z.string().max(1000).optional(),
});

module.exports = { createRequestSchema, reviewRequestSchema };