const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },

    // FIX: was `required: true` with no accommodation for system-triggered actions
    // (cron jobs). This forced call sites to stuff a founder's ID or, in one
    // confirmed bug, a Consumable's ID into a field typed `ref: 'User'` — corrupting
    // the audit trail. Now nullable, with an explicit system-action flag instead.
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, required: true, default: 'SYSTEM' },
    isSystemGenerated: { type: Boolean, default: false },

    module: { type: String, required: true },
    resourceType: { type: String },
    resourceId: { type: mongoose.Schema.Types.ObjectId },

    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },

    ipAddress: { type: String },
    userAgent: { type: String },

    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ module: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ isSystemGenerated: 1, timestamp: -1 });

function blockMutation() {
  throw new Error('AuditLog records are immutable and cannot be modified or deleted.');
}
auditLogSchema.pre('findOneAndUpdate', blockMutation);
auditLogSchema.pre('updateOne', blockMutation);
auditLogSchema.pre('updateMany', blockMutation);
auditLogSchema.pre('findOneAndDelete', blockMutation);
auditLogSchema.pre('deleteOne', blockMutation);
auditLogSchema.pre('deleteMany', blockMutation);

module.exports = mongoose.model('AuditLog', auditLogSchema);