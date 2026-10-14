const { Notification } = require('../models');
const notificationService = require('../services/notification.service');

async function retryFailedEmailNotifications() {
  console.log('[CRON] Retrying failed notification email deliveries...');

  const candidates = await Notification.find({
    emailSent: false,
    emailAttempts: { $lt: notificationService.MAX_EMAIL_ATTEMPTS },
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // only last 24h — stale ones aren't worth retrying
  }).limit(200).select('_id');

  let retried = 0;
  for (const n of candidates) {
    try {
      await notificationService.retryEmailDelivery(n._id);
      retried++;
    } catch (err) {
      console.error(`[CRON] Retry failed for notification ${n._id}:`, err);
    }
  }

  console.log(`[CRON] Retried ${retried} notification email(s).`);
}

module.exports = { retryFailedEmailNotifications };