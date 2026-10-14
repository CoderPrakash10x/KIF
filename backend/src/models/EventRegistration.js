const mongoose = require('mongoose');
const {
  REGISTRATION_STATUS,
  ATTENDANCE_STATUS,
  CERTIFICATE_STATUS,
} = require('../constants/enums');

const eventRegistrationSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: Object.values(REGISTRATION_STATUS),
      default: REGISTRATION_STATUS.REGISTERED,
    },

    registeredAt: { type: Date, default: Date.now },

    // Manually set by Admin — no QR dependency
    attendanceStatus: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.NOT_MARKED,
    },
    attendanceMarkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attendanceMarkedAt: { type: Date },

    // Manual-trigger PDF certificate generation — no QR
    certificateStatus: {
      type: String,
      enum: Object.values(CERTIFICATE_STATUS),
      default: CERTIFICATE_STATUS.NOT_APPLICABLE,
    },
    certificateUrl: { type: String },
    certificateGeneratedAt: { type: Date },
  },
  { timestamps: true }
);

// One user can register only once per event
eventRegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });
eventRegistrationSchema.index({ userId: 1 });

module.exports = mongoose.model('EventRegistration', eventRegistrationSchema);