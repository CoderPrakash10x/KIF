const mongoose = require('mongoose');
const { BOOKING_STATUS } = require('../constants/enums');

const equipmentChecklistItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    checkedOut: { type: Boolean, default: false },
    checkedIn: { type: Boolean, default: false },
    remarks: { type: String, trim: true },
  },
  { _id: false }
);

const roomBookingSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },

    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },

    purpose: { type: String, required: true, trim: true },

    status: { type: String, enum: Object.values(BOOKING_STATUS), default: BOOKING_STATUS.PENDING },

    equipmentChecklist: { type: [equipmentChecklistItemSchema], default: [] },

    adminRemarks: { type: String, trim: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // CRITICAL FIX: referenced by room.service.js's blockMaintenanceSlot() and
    // unblockMaintenanceSlot() since that deliverable, but never declared here.
    // Mongoose silently stripped it on create — meaning unblockMaintenanceSlot()
    // would ALWAYS throw "This is not a maintenance block", since the field was
    // permanently undefined regardless of what was set at creation time.
    isMaintenanceBlock: { type: Boolean, default: false },
  },
  { timestamps: true }
);

roomBookingSchema.index({ roomId: 1, date: 1, status: 1 });
// Database-level double-booking guard (in addition to the transactional overlap check).
roomBookingSchema.index(
  { roomId: 1, date: 1, startTime: 1, endTime: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['PENDING', 'APPROVED', 'ACTIVE'] } } },
);

module.exports = mongoose.model('RoomBooking', roomBookingSchema);