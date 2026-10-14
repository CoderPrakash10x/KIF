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
    metadata: z.record(z.any()).optional(),
  })
  .refine(
    (data) => {
      if (data.type === REQUEST_TYPE.ROOM) return !!(data.startDate && data.startTime && data.endTime);
      if (data.type === REQUEST_TYPE.CABIN) return !!(data.startDate && data.endDate);
      return true;
    },
    { message: 'Missing required date/time fields for the selected request type' }
  );

const reviewRequestSchema = z.object({
  remarks: z.string().max(1000).optional(),
});

module.exports = { createRequestSchema, reviewRequestSchema };