const { z } = require('zod');
const {
  CABIN_TYPE,
} = require('../constants/enums');

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

const createCabinSchema = z.object({
  cabinNumber: z.string().min(1).max(50),
  name: z.string().max(100).optional(),
  type: z.enum(Object.values(CABIN_TYPE)),
  capacity: z.number().int().min(1),
  location: z.string().max(200).optional(),
  facilities: z
    .array(z.string().max(100))
    .default([]),
});

const maintenanceSchema = z.object({
  reason: z.string().min(3).max(500),
});

const directAllotmentSchema = z.object({
  cabinId: objectId,
  founderId: objectId,
  members: z.array(objectId).default([]),
  startupName: z.string().max(150).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  purpose: z.string().min(3).max(1000),
  documentUrl: z
    .object({
      url: z.string().url(),
      publicId: z.string().optional(),
    })
    .optional(),
});

const vacateSchema = z.object({
  reason: z.string().max(500).optional(),
});

module.exports = {
  createCabinSchema,
  maintenanceSchema,
  directAllotmentSchema,
  vacateSchema,
};