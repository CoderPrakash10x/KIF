const { AuditLog } = require('../models');

async function log({ action, performedBy, role, module, resourceType, resourceId, oldValue, newValue, ipAddress, userAgent, isSystemGenerated = false }) {
  try {
    await AuditLog.create({
      action, performedBy: performedBy || null, role: role || 'SYSTEM',
      module, resourceType, resourceId, oldValue, newValue, ipAddress, userAgent,
      isSystemGenerated,
    });
  } catch (err) {
    console.error('AUDIT_LOG_FAILURE:', err);
  }
}

// Convenience wrapper for cron jobs / automated processes — guarantees a
// consistent, unambiguous audit trail entry for actions no human triggered,
// instead of call sites improvising by stuffing a random user's ID into
// `performedBy` (the bug found in cabinExpiry.job.js, overdueHardware.job.js,
// and consumable.service.js's low-stock notifier).
async function logSystemAction({ action, module, resourceType, resourceId, oldValue, newValue }) {
  return log({
    action, performedBy: null, role: 'SYSTEM', isSystemGenerated: true,
    module, resourceType, resourceId, oldValue, newValue,
  });
}

module.exports = { log, logSystemAction };