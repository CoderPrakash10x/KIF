const { Cabin, CabinAllotment, Request } = require('../models');
const {
  ALLOTMENT_STATUS,
  CABIN_STATUS,
  REQUEST_STATUS,
  NOTIFICATION_TYPE,
} = require('../constants/enums');
const { withTransaction } = require('../utils/db');
const auditService = require('../services/audit.service');
const notificationService = require('../services/notification.service');
const noDuesService = require('../services/noDues.service');

// ---------------------------------------------------------------------------
// 1. 7-Day Advance Reminder
// ---------------------------------------------------------------------------
async function runCabinExpiryReminders() {
  console.log('[CRON] Running 7-day cabin expiry reminder check...');
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Target allotments that are ACTIVE, ending within 7 days, and haven't had a reminder sent yet
  const expiringAllotments = await CabinAllotment.find({
    status: ALLOTMENT_STATUS.ACTIVE,
    reminderSent: false,
    endDate: { $lte: sevenDaysFromNow, $gt: now },
  })
    .populate('cabinId', 'cabinNumber name')
    .populate('founderId', 'name email');

  let reminderCount = 0;

  for (const allotment of expiringAllotments) {
    try {
      allotment.reminderSent = true;
      await allotment.save();

      const cabinName = allotment.cabinId?.cabinNumber || 'Cabin';
      const formattedDate = allotment.endDate.toDateString();

      // Notify Founder
      await notificationService.notify({
        userId: allotment.founderId._id,
        type: NOTIFICATION_TYPE.CABIN_EXPIRY_REMINDER,
        title: 'Cabin Allotment Expiring Soon',
        message: `Your allotment for ${cabinName} will expire in 7 days on ${formattedDate}. Please plan accordingly.`,
        relatedResourceType: 'CabinAllotment',
        relatedResourceId: allotment._id,
      });

      // Notify Admins
      await notificationService.notifyAdmins({
        type: NOTIFICATION_TYPE.GENERAL,
        title: 'Upcoming Cabin Expiry',
        message: `Allotment for ${cabinName} (${allotment.startupName || allotment.founderId.name}) expires on ${formattedDate}.`,
        relatedResourceType: 'CabinAllotment',
        relatedResourceId: allotment._id,
      });

      reminderCount++;
    } catch (err) {
      console.error(`[CRON] Failed sending reminder for allotment ${allotment._id}:`, err);
    }
  }

  console.log(`[CRON] Sent ${reminderCount} cabin expiry reminder(s).`);
}

// ---------------------------------------------------------------------------
// 2. Auto-Release Ended Allotments (Sets Cabin back to FREE)
// ---------------------------------------------------------------------------
async function processCabinExpiries() {
  console.log('[CRON] Checking for expired cabin allotments...');
  const now = new Date();

  // Find allotments whose endDate has passed, are still ACTIVE, and not yet processed
  const expiredAllotments = await CabinAllotment.find({
    status: ALLOTMENT_STATUS.ACTIVE,
    expiryProcessed: false,
    endDate: { $lte: now },
  }).populate('cabinId founderId');

  let releasedCount = 0;

  for (const allotment of expiredAllotments) {
    try {
      await withTransaction(async (session) => {
        // 1. Mark allotment expired
        allotment.status = ALLOTMENT_STATUS.EXPIRED;
        allotment.expiryProcessed = true;
        await allotment.save({ session });

        // 2. Reset the Cabin to FREE if this allotment was its current occupant
        const cabin = await Cabin.findById(allotment.cabinId._id).session(session);
        if (cabin) {
          if (String(cabin.currentAllotment) === String(allotment._id)) {
            cabin.status = CABIN_STATUS.FREE;
            cabin.currentAllotment = null;
            await cabin.save({ session });
          }
        }

        // 3. Sync associated Request record to EXPIRED
        await Request.updateMany(
          { linkedTransactionId: allotment._id },
          { status: REQUEST_STATUS.EXPIRED },
          { session }
        );
      });

      // Audit Log for the automated release
      await auditService.logSystemAction({
  action: 'AUTO_EXPIRE_CABIN_ALLOTMENT',
  module: 'CABIN', resourceType: 'CabinAllotment', resourceId: allotment._id,
  newValue: { status: ALLOTMENT_STATUS.EXPIRED, cabinStatus: CABIN_STATUS.FREE },
});

      // Notify Founder
      await notificationService.notify({
        userId: allotment.founderId._id,
        type: NOTIFICATION_TYPE.CABIN_EXPIRED,
        title: 'Cabin Allotment Expired',
        message: `Your allotment for Cabin ${allotment.cabinId?.cabinNumber} has ended and the cabin has been released.`,
        relatedResourceType: 'CabinAllotment',
        relatedResourceId: allotment._id,
      });

      // Notify Admins
      await notificationService.notifyAdmins({
        type: NOTIFICATION_TYPE.CABIN_EXPIRED,
        title: 'Cabin Auto-Released to FREE',
        message: `Cabin ${allotment.cabinId?.cabinNumber} allotment has expired and is now available for new bookings.`,
        relatedResourceType: 'Cabin',
        relatedResourceId: allotment.cabinId?._id,
      });

      // Cross-Service Integration: Opportunistically check/unblock No-Dues for the founder
      await noDuesService.recheckIfExists(allotment.founderId._id);

      releasedCount++;
    } catch (err) {
      console.error(`[CRON] Error expiring allotment ${allotment._id}:`, err);
    }
  }

  console.log(`[CRON] Auto-released ${releasedCount} cabin(s).`);
}

module.exports = { runCabinExpiryReminders, processCabinExpiries };