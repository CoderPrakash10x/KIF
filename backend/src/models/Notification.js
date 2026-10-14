const mongoose = require('mongoose');
const { NOTIFICATION_TYPE } = require('../constants/enums');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPE),
      required: true,
    },

    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
emailAttempts: { type: Number, default: 0 },
    // Optional link back to whatever triggered this notification
    relatedResourceType: { type: String }, // e.g. 'Request', 'CabinAllotment'
    relatedResourceId: { type: mongoose.Schema.Types.ObjectId },

    read: { type: Boolean, default: false },
    readAt: { type: Date },

    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date },
  },
  
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);