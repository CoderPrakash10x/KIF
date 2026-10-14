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

    // No default: a room whose capacity has not been confirmed shows as "not configured" instead of a made-up number.
    capacity: { type: Number, min: 1 },
    location: { type: String, trim: true },

    // Standard equipment attached to the room, used as checklist template for bookings
    equipmentList: [
      {
        name: { type: String, required: true }, // e.g. 'GPU Workstation', 'Podcast Mic'
        quantity: { type: Number, default: 1 },
      },
    ],

    active: { type: Boolean, default: true },
    description: { type: String, trim: true },
    // Room-specific administrator. Only this ADMIN (and the Super Admin) may manage the room's workflow.
    assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
  },
  { timestamps: true }
);

roomSchema.index({ type: 1 });
roomSchema.index({ assignedAdmin: 1 });
roomSchema.virtual('setupRequired').get(function () { return !this.capacity || !this.location; });
roomSchema.set('toJSON', { virtuals: true });
roomSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Room', roomSchema);