const cron = require('node-cron');
const { runCabinExpiryReminders, processCabinExpiries } = require('./cabinExpiry.job');
const { checkOverdueHardware } = require('./overdueHardware.job');
const { checkLowStockConsumables } = require('./lowStock.job');
const { sendEventReminders } = require('./eventReminder.job');
const { retryFailedEmailNotifications } = require('./notification.job');
const { purgeAbandonedRegistrations } = require('./unverifiedCleanup.job');

function initJobs() {
  if (process.env.NODE_ENV === 'test') {
    console.log('[CRON] Background jobs skipped in test environment.');
    return;
  }

  console.log('[CRON] Initializing KIF-RMS background automation schedules...');

  // 1. Daily @ 09:00 AM — Cabin 7-day reminder
  cron.schedule('0 9 * * *', async () => {
    try {
      await runCabinExpiryReminders();
    } catch (err) {
      console.error('[CRON][FATAL] Cabin reminder job crashed:', err);
    }
  });

  // 2. Hourly @ minute 5 — Auto-release expired cabins to FREE
  cron.schedule('5 * * * *', async () => {
    try {
      await processCabinExpiries();
    } catch (err) {
      console.error('[CRON][FATAL] Cabin auto-release job crashed:', err);
    }
  });

  // 3. Daily @ 08:30 AM — Mark hardware overdue and notify
  cron.schedule('30 8 * * *', async () => {
    try {
      await checkOverdueHardware();
    } catch (err) {
      console.error('[CRON][FATAL] Overdue hardware job crashed:', err);
    }
  });

  // 4. Daily @ 10:00 AM — Scan low-stock consumables
  cron.schedule('0 10 * * *', async () => {
    try {
      await checkLowStockConsumables();
    } catch (err) {
      console.error('[CRON][FATAL] Low-stock scan job crashed:', err);
    }
  });
// 5. Daily @ 09:30 AM — Event reminders (1 day before)
  cron.schedule('30 9 * * *', async () => {
  try {
    await sendEventReminders();
  } catch (err) {
    console.error('[CRON][FATAL] Event reminder job crashed:', err);
  }
});

cron.schedule('*/30 * * * *', async () => {
  try {
    await retryFailedEmailNotifications();
  } catch (err) {
    console.error('[CRON][FATAL] Notification retry job crashed:', err);
  }
});


  // Daily: remove registrations that were never e-mail verified (see UNVERIFIED_REGISTRATION_TTL_DAYS).
  cron.schedule('30 3 * * *', async () => {
    try { const n = await purgeAbandonedRegistrations(); if (n) console.log(`[CRON] Removed ${n} abandoned unverified registrations.`); } catch (e) { console.error('[CRON] cleanup failed:', e.message); }
  });

  console.log('[CRON] All automation schedules initialized successfully.');
}

module.exports = { initJobs };