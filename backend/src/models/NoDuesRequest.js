const mongoose = require('mongoose');
const { NO_DUES_STATUS, MODULE_CHECK_STATUS } = require('../constants/enums');

const moduleCheckSchema = new mongoose.Schema(
  {
    status: { type: String, enum: Object.values(MODULE_CHECK_STATUS), default: MODULE_CHECK_STATUS.PENDING },
    remarks: { type: String, trim: true },
    pendingItems: { type: [String], default: [] },
  },
  { _id: false }
);

const noDuesRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initiatedBy: { type: String, enum: ['SELF', 'ADMIN'], required: true },

    status: { type: String, enum: Object.values(NO_DUES_STATUS), default: NO_DUES_STATUS.PENDING },

    moduleChecks: {
      cabin: { type: moduleCheckSchema, default: () => ({}) },
      hardware: { type: moduleCheckSchema, default: () => ({}) },
      room: { type: moduleCheckSchema, default: () => ({}) },
      requests: { type: moduleCheckSchema, default: () => ({}) },
    },

    // FIX: enum previously excluded IN_REVIEW despite it being a valid business
    // state actively assigned by noDues.service.js#computeOverallStatus().
    overallStatus: { type: String, enum: Object.values(NO_DUES_STATUS), default: NO_DUES_STATUS.PENDING },

    lastCheckedAt: { type: Date, default: Date.now },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewRemarks: { type: String, trim: true },

    certificateUrl: { type: String },
    certificateGeneratedAt: { type: Date },
  },
  { timestamps: true }
  // NOTE: the pre('save') hook that previously duplicated computeOverallStatus()
  // logic here has been intentionally REMOVED. It contained a dead ternary
  // (`NO_DUES_STATUS.IN_REVIEW ? X : Y` — always truthy, always took the same
  // branch) and created a second source of truth that could silently disagree
  // with the service layer's explicit status assignments during admin review.
);

noDuesRequestSchema.index({ userId: 1, status: 1 });
noDuesRequestSchema.index({ overallStatus: 1 });

module.exports = mongoose.model('NoDuesRequest', noDuesRequestSchema);