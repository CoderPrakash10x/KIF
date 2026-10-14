const mongoose = require('mongoose');
const { STOCK_TXN_TYPE } = require('../constants/enums');

const stockTransactionSchema = new mongoose.Schema(
  {
    consumableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consumable', required: true },

    type: {
      type: String,
      enum: Object.values(STOCK_TXN_TYPE),
      required: true,
    },

    quantity: { type: Number, required: true }, // positive value; sign interpreted via `type`

    previousQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true },

    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true }, // e.g. 'Used for AI Lab workshop', 'Restocked'
  },
  { timestamps: { createdAt: true, updatedAt: false } } // immutable log, no updatedAt needed
);

stockTransactionSchema.index({ consumableId: 1, createdAt: -1 });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);