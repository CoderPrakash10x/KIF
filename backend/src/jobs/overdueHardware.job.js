const hardwareService = require('../services/hardware.service');
const { HARDWARE_TXN_STATUS, NOTIFICATION_TYPE } = require('../constants/enums');
const auditService = require('../services/audit.service');
const notificationService = require('../services/notification.service');

async function checkOverdueHardware() {
  console.log('[CRON] Running daily overdue hardware scan...');

  try {
    const overdueCandidates = await hardwareService.getOverdueCandidates();

    if (!overdueCandidates.length) {
      console.log('[CRON] No overdue hardware items found.');
      return;
    }

    const txIdsToMark = overdueCandidates.map((t) => t._id);
    await hardwareService.markOverdueBatch(txIdsToMark);

    let notifiedCount = 0;

    for (const txn of overdueCandidates) {
      try {
        const itemName = txn.hardwareId?.itemName || 'Hardware Item';
        const tag = txn.hardwareId?.assetTag ? ` (${txn.hardwareId.assetTag})` : '';
        const dueDate = txn.expectedReturnDate ? txn.expectedReturnDate.toDateString() : 'earlier date';

        // 1. Notify Requester
        await notificationService.notify({
          userId: txn.requestedBy._id,
          type: NOTIFICATION_TYPE.HARDWARE_OVERDUE,
          title: 'Hardware Return Overdue ⚠️',
          message: `Your borrowed item "${itemName}${tag}" was expected back by ${dueDate}. Please return it immediately.`,
          relatedResourceType: 'HardwareTransaction',
          relatedResourceId: txn._id,
        });

        // 2. Notify Admins
        await notificationService.notifyAdmins({
          type: NOTIFICATION_TYPE.HARDWARE_OVERDUE,
          title: 'Overdue Hardware Item',
          message: `${txn.requestedBy.name} has not returned "${itemName}${tag}" (Due: ${dueDate}).`,
          relatedResourceType: 'HardwareTransaction',
          relatedResourceId: txn._id,
        });

        // 3. Audit log
      await auditService.logSystemAction({
  action: 'MARK_HARDWARE_OVERDUE',
  module: 'HARDWARE', resourceType: 'HardwareTransaction', resourceId: txn._id,
  newValue: { status: HARDWARE_TXN_STATUS.OVERDUE },
});

        notifiedCount++;
      } catch (err) {
        console.error(`[CRON] Failed notifying overdue transaction ${txn._id}:`, err);
      }
    }

    console.log(`[CRON] Processed & marked ${notifiedCount} overdue hardware item(s).`);
  } catch (err) {
    console.error('[CRON] Fatal error in checkOverdueHardware job:', err);
  }
}

module.exports = { checkOverdueHardware };