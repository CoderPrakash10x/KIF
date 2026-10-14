const mongoose = require('mongoose');
const { ALLOTMENT_STATUS } = require('../constants/enums');

const cabinAllotmentSchema = new mongoose.Schema(
  {
    cabinId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cabin', required: true },

    startupName: { type: String, trim: true },
    founderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    purpose: { type: String, trim: true },

    documentUrl: { url: { type: String }, publicId: { type: String } },

    status: { type: String, enum: Object.values(ALLOTMENT_STATUS), default: ALLOTMENT_STATUS.PENDING },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },

    expiryProcessed: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },

    // FIX: referenced by cabin.service.js's vacateCabin() since that deliverable,
    // but never declared. Data was silently dropped — a vacated/cancelled allotment
    // had no persisted trace of WHEN it ended, WHO ended it, or WHY.
    endedAt: { type: Date },
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    endReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

cabinAllotmentSchema.index({ cabinId: 1, status: 1 });
cabinAllotmentSchema.index({ founderId: 1 });
cabinAllotmentSchema.index({ endDate: 1, status: 1 });
cabinAllotmentSchema.index({ members: 1, status: 1 });

cabinAllotmentSchema.pre('validate', function () {
  if (this.endDate <= this.startDate) {
    throw new Error('endDate must be after startDate');
  }
});

module.exports = mongoose.model('CabinAllotment', cabinAllotmentSchema);