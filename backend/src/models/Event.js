const mongoose = require('mongoose');
const { EVENT_STATUS } = require('../constants/enums');

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    venue: { type: String, required: true, trim: true },

    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: { type: String, enum: Object.values(EVENT_STATUS), default: EVENT_STATUS.DRAFT },

    capacity: { type: Number, default: 0, min: 0 },
    bannerImage: { url: String, publicId: String },
    certificateEnabled: { type: Boolean, default: false },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // CRITICAL FIX: referenced by jobs/eventReminder.job.js's query
    // { reminderSent: false, ... } since that deliverable, but never declared here.
    // Since NO document ever had this field stored, the query condition
    // `reminderSent: false` matched ZERO documents at the MongoDB level
    // (absent field ≠ false) — event reminders were completely dead on arrival.
    reminderSent: { type: Boolean, default: false },
    regSeq: { type: Number, default: 0, select: false }, // concurrency lock counter for registrations

  },
  { timestamps: true }
);

eventSchema.index({ date: 1, status: 1 });
eventSchema.index({ venue: 1, date: 1 });

module.exports = mongoose.model('Event', eventSchema);