const mongoose = require('mongoose');
const { CABIN_TYPE, CABIN_STATUS } = require('../constants/enums');

const cabinSchema = new mongoose.Schema(
  {
    cabinNumber: { type: String, required: true, unique: true, trim: true },
    name: { type: String, trim: true },

    type: {
      type: String,
      enum: Object.values(CABIN_TYPE),
      default: CABIN_TYPE.CABIN,
    },

    status: {
      type: String,
      enum: Object.values(CABIN_STATUS),
      default: CABIN_STATUS.FREE,
    },

    capacity: { type: Number, default: 1, min: 1 },
    location: { type: String, trim: true },
    facilities: { type: [String], default: [] }, 

    currentAllotment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CabinAllotment',
      default: null,
    },

    maintenanceReason: { type: String, trim: true },

    active: { type: Boolean, default: true }, 
  },
  { timestamps: true }
);

cabinSchema.index({ status: 1 });

module.exports = mongoose.model('Cabin', cabinSchema);