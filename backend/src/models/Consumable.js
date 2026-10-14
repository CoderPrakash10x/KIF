const mongoose = require('mongoose');

const consumableSchema = new mongoose.Schema(
  {
    // FIX: referenced by consumable.service.js's createConsumable() and the
    // unique index below since that deliverable, but never declared.
    sku: { type: String, trim: true, uppercase: true },

    itemName: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    unit: { type: String, required: true, trim: true },

    currentQuantity: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, required: true, min: 0, default: 5 },

    location: { type: String, trim: true },
    description: { type: String, trim: true },

    lowStockAlertSent: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, optimisticConcurrency: true }
);

consumableSchema.index({ itemName: 1 });
consumableSchema.index({ currentQuantity: 1, lowStockThreshold: 1 });
consumableSchema.index({ sku: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Consumable', consumableSchema);