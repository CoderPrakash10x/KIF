const mongoose = require('mongoose');
const { ROOM_TYPE } = require('../constants/enums');

const roomSchema = new mongoose.Schema(
  {
    roomName: { type: String, required: true, trim: true },

    type: {
      type: String,
      enum: Object.values(ROOM_TYPE),
      required: true,
    },

    capacity: { type: Number, default: 1 },
    location: { type: String, trim: true },

    // Standard equipment attached to the room, used as checklist template for bookings
    equipmentList: [
      {
        name: { type: String, required: true }, // e.g. 'GPU Workstation', 'Podcast Mic'
        quantity: { type: Number, default: 1 },
      },
    ],

    active: { type: Boolean, default: true },
    bookingSeq: { type: Number, default: 0, select: false }, // concurrency lock counter for slot checks
  },
  { timestamps: true }
);

roomSchema.index({ type: 1 });

module.exports = mongoose.model('Room', roomSchema);