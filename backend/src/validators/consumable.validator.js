const { z } = require('zod');

const createConsumableSchema = z.object({
  sku: z.string().max(50).optional(),
  itemName: z.string().min(1).max(150),
  category: z.string().max(100).optional(),
  unit: z.string().min(1).max(50),
  currentQuantity: z.number().min(0).default(0),
  lowStockThreshold: z.number().min(0),
  location: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  openingReason: z.string().max(500).optional(),
});

const stockMovementSchema = z.object({
  quantity: z.number().positive(),
  reason: z.string().min(2).max(500),
});

const stockAdjustmentSchema = z.object({
  newQuantity: z.number().min(0),
  reason: z.string().min(2).max(500),
});

module.exports = {
  createConsumableSchema,
  stockMovementSchema,
  stockAdjustmentSchema,
};