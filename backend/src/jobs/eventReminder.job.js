const { Event, EventRegistration } = require('../models');
const { EVENT_STATUS, REGISTRATION_STATUS, NOTIFICATION_TYPE } = require('../constants/enums');
const notificationService = require('../services/notification.service');

const DAY = 24 * 60 * 60 * 1000;
const utcMidnight = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };

// Events are stored as UTC-midnight calendar days, so "tomorrow" is the next calendar day, not now+24h.
async function sendEventReminders(now = new Date()) {
  const start = new Date(utcMidnight(now).getTime() + DAY);
  const end = new Date(start.getTime() + DAY);
  const candidates = await Event.find({ status: EVENT_STATUS.PUBLISHED, reminderSent: false, date: { $gte: start, $lt: end } }).select('_id');
  let remindersSent = 0;
  for (const c of candidates) {
    // Atomic claim: safe even if two instances run the job.
    const event = await Event.findOneAndUpdate({ _id: c._id, reminderSent: false }, { reminderSent: true }, { new: true });
    if (!event) continue;
    try {
      const registrations = await EventRegistration.find({ eventId: event._id, status: REGISTRATION_STATUS.REGISTERED });
      await Promise.all(registrations.map((r) => notificationService.notify({
        userId: r.userId, type: NOTIFICATION_TYPE.EVENT_REMINDER, title: 'Event Reminder',
        message: `"${event.title}" is happening tomorrow at ${event.venue} (${event.startTime}-${event.endTime}).`,
        relatedResourceType: 'Event', relatedResourceId: event._id,
      })));
      remindersSent += registrations.length;
    } catch (err) {
      console.error(`[CRON] Failed sending reminders for event ${event._id}:`, err);
      await Event.updateOne({ _id: event._id }, { reminderSent: false }); // release so the next run retries
    }
  }
  console.log(`[CRON] Sent ${remindersSent} event reminder notification(s).`);
}

module.exports = { sendEventReminders };
