const mongoose = require('mongoose');

const {
  REQUEST_TYPE,
  REQUEST_STATUS,
  REQUEST_TYPE_MODEL_MAP,
} = require('../constants/enums');

const requestSchema = new mongoose.Schema(
  {
    requestNumber: {
      type: String,
      unique: true,
    },

    type: {
      type: String,
      enum: Object.values(REQUEST_TYPE),
      required: true,
    },

    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'onModel',
    },

    onModel: {
      type: String,
      required: true,
      enum: Object.values(REQUEST_TYPE_MODEL_MAP),
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    startDate: {
      type: Date,
    },

    endDate: {
      type: Date,
    },

    startTime: {
      type: String,
    },

    endTime: {
      type: String,
    },

    purpose: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: Object.values(REQUEST_STATUS),
      default: REQUEST_STATUS.PENDING,
    },

    adminRemarks: {
      type: String,
      trim: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    reviewedAt: {
      type: Date,
    },

    linkedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    // Stores additional information used by cabin and hardware handlers.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// ---------- Indexes ----------

// requestNumber already has unique: true in its field definition.
// Do not define the same index again here.
requestSchema.index({ requestedBy: 1, status: 1 });
requestSchema.index({ type: 1, status: 1 });

// ---------- Hooks ----------
// onModel is `required`, and validation runs BEFORE pre('save') hooks, so it must be derived in pre('validate').
requestSchema.pre('validate', function () {
  if (this.type) this.onModel = REQUEST_TYPE_MODEL_MAP[this.type];
});

requestSchema.pre('save', async function () {
  if (this.isNew && !this.requestNumber) {
    const seq = await mongoose
      .model('Counter')
      .next('request', this.$session());

    this.requestNumber = `REQ-${String(seq).padStart(6, '0')}`;
  }
});

// ---------- Export ----------
module.exports = mongoose.model('Request', requestSchema);