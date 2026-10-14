const mongoose = require('mongoose');
const { HARDWARE_TXN_STATUS, HARDWARE_CONDITION } = require('../constants/enums');

const hardwareTransactionSchema = new mongoose.Schema(
  {
    hardwareId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hardware', required: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' }, // originating request, if any

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    returnedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    quantity: { type: Number, default: 1, min: 1 }, // for quantity-based items

    status: {
      type: String,
      enum: Object.values(HARDWARE_TXN_STATUS),
      default: HARDWARE_TXN_STATUS.REQUESTED,
    },

    issueDate: { type: Date },
    expectedReturnDate: { type: Date },
    actualReturnDate: { type: Date },

    conditionOnIssue: { type: String, enum: Object.values(HARDWARE_CONDITION) },
    conditionOnReturn: { type: String, enum: Object.values(HARDWARE_CONDITION) },

    damageNotes: { type: String, trim: true },
    overdueNotified: { type: Boolean, default: false }, // cron idempotency guard
  },
  { timestamps: true }
);

hardwareTransactionSchema.index({ hardwareId: 1, status: 1 });
hardwareTransactionSchema.index({ requestedBy: 1 });
hardwareTransactionSchema.index({ status: 1, expectedReturnDate: 1 }); // for overdue cron

module.exports = mongoose.model('HardwareTransaction', hardwareTransactionSchema);