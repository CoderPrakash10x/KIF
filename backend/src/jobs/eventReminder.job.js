const { Event, EventRegistration } = require('../models');
const { EVENT_STATUS, REGISTRATION_STATUS, NOTIFICATION_TYPE } = require('../constants/enums');
const notificationService = require('../services/notification.service');

async function sendEventReminders() {
  console.log('[CRON] Running event reminder check...');
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const upcomingEvents = await Event.find({
    status: EVENT_STATUS.PUBLISHED,
    reminderSent: false,
    date: { $gte: tomorrow, $lt: dayAfterTomorrow },
  });

  let remindersSent = 0;

  for (const event of upcomingEvents) {
    try {
      event.reminderSent = true;
      await event.save();

      const registrations = await EventRegistration.find({
        eventId: event._id, status: REGISTRATION_STATUS.REGISTERED,
      });

      await Promise.all(
        registrations.map((r) =>
          notificationService.notify({
            userId: r.userId,
            type: NOTIFICATION_TYPE.EVENT_REMINDER,
            title: 'Event Reminder ⏰',
            message: `"${event.title}" is happening tomorrow at ${event.venue} (${event.startTime}-${event.endTime}). Don't miss it!`,
            relatedResourceType: 'Event', relatedResourceId: event._id,
          })
        )
      );

      remindersSent += registrations.length;
    } catch (err) {
      console.error(`[CRON] Failed sending reminders for event ${event._id}:`, err);
    }
  }

  console.log(`[CRON] Sent ${remindersSent} event reminder notification(s).`);
}

module.exports = { sendEventReminders };