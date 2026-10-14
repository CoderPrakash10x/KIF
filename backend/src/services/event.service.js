const { Event, EventRegistration, User } = require('../models');
const {
  EVENT_STATUS,
  REGISTRATION_STATUS,
  ATTENDANCE_STATUS,
  CERTIFICATE_STATUS,
  NOTIFICATION_TYPE,
  ROLES,
} = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/db');
const { rangesOverlap } = require('../utils/time');
const { normalizeToMidnightUTC } = require('../utils/date');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const certificateService = require('./certificate.service');

// ---------------------------------------------------------------------------
// SHARED VENUE CONFLICT CHECK — single source of truth.
// Used by: (1) createEvent (Admin direct) below
//          (2) event.handler.js (Founder-hosted Request Engine flow)
// ---------------------------------------------------------------------------
async function checkVenueConflict({ venue, date, startTime, endTime, excludeEventId, session }) {
  const normalizedDate = normalizeToMidnightUTC(date);

  const query = {
    venue,
    date: normalizedDate,
    status: { $in: [EVENT_STATUS.PUBLISHED, EVENT_STATUS.ONGOING] },
  };
  if (excludeEventId) query._id = { $ne: excludeEventId };

  const candidates = await Event.find(query).session(session);
  const conflict = candidates.some((e) => rangesOverlap(e.startTime, e.endTime, startTime, endTime));

  if (conflict) {
    throw new ApiError(409, `Venue "${venue}" is already booked for an overlapping time`, 'VENUE_CONFLICT');
  }

  // Venue auto-blocker (spec 4.5): if the venue is one of the bookable rooms, room bookings and
  // pending room requests for that time also block the event.
  const { Room, RoomBooking, Request: RequestModel } = require('../models');
  const { escapeRegex } = require('../utils/regex');
  const room = await Room.findOne({ roomName: new RegExp(`^${escapeRegex(venue)}$`, 'i'), active: true }).session(session);
  if (room) {
    const [bookings, pending] = await Promise.all([
      RoomBooking.find({ roomId: room._id, date: normalizedDate, status: { $in: ['APPROVED', 'ACTIVE'] } }).session(session),
      RequestModel.find({ type: 'ROOM', resourceId: room._id, startDate: normalizedDate, status: 'PENDING' }).session(session),
    ]);
    if ([...bookings, ...pending].some((b) => rangesOverlap(b.startTime, b.endTime, startTime, endTime))) {
      throw new ApiError(409, `"${venue}" already has a room booking or pending request in that time`, 'VENUE_CONFLICT');
    }
  }
}

// ---------------------------------------------------------------------------
// EVENT CRUD (Admin — direct, per RBAC "Event Creation: Full")
// ---------------------------------------------------------------------------
async function createEvent(payload, adminUser, meta = {}) {
  const { title, description, venue, date, startTime, endTime, capacity, certificateEnabled, publishImmediately } = payload;

  const event = await withTransaction(async (session) => {
    if (publishImmediately !== false) {
      await checkVenueConflict({ venue, date, startTime, endTime, session });
    }

    const [created] = await Event.create(
      [{
        title, description, venue, date, startTime, endTime,
        capacity: capacity || 0,
        certificateEnabled: !!certificateEnabled,
        status: publishImmediately !== false ? EVENT_STATUS.PUBLISHED : EVENT_STATUS.DRAFT,
        createdBy: adminUser._id,
      }],
      { session }
    );
    return created;
  });

  await auditService.log({
    action: 'CREATE_EVENT', performedBy: adminUser._id, role: adminUser.role,
    module: 'EVENT', resourceType: 'Event', resourceId: event._id,
    newValue: event.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return event;
}

async function publishDraftEvent(eventId, adminUser, meta = {}) {
  const event = await withTransaction(async (session) => {
    const e = await Event.findById(eventId).session(session);
    if (!e) throw new ApiError(404, 'Event not found', 'NOT_FOUND');
    if (e.status !== EVENT_STATUS.DRAFT) {
      throw new ApiError(409, 'Only draft events can be published', 'INVALID_STATE');
    }

    await checkVenueConflict({ venue: e.venue, date: e.date, startTime: e.startTime, endTime: e.endTime, excludeEventId: e._id, session });

    e.status = EVENT_STATUS.PUBLISHED;
    await e.save({ session });
    return e;
  });

  await auditService.log({
    action: 'PUBLISH_EVENT', performedBy: adminUser._id, role: adminUser.role,
    module: 'EVENT', resourceType: 'Event', resourceId: event._id,
    newValue: { status: EVENT_STATUS.PUBLISHED }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return event;
}

async function updateEvent(eventId, updates, adminUser, meta = {}) {
  const event = await Event.findById(eventId);
  if (!event) throw new ApiError(404, 'Event not found', 'NOT_FOUND');

  const oldValue = event.toObject();

  // If date/time/venue is changing on a published event, re-verify no new conflict is introduced
  const scheduleFieldsChanged = ['venue', 'date', 'startTime', 'endTime'].some((f) => updates[f] !== undefined);
  if (scheduleFieldsChanged && event.status === EVENT_STATUS.PUBLISHED) {
    await checkVenueConflict({
      venue: updates.venue || event.venue,
      date: updates.date || event.date,
      startTime: updates.startTime || event.startTime,
      endTime: updates.endTime || event.endTime,
      excludeEventId: event._id,
    });
  }

  Object.assign(event, updates);
  await event.save();

  await auditService.log({
    action: 'UPDATE_EVENT', performedBy: adminUser._id, role: adminUser.role,
    module: 'EVENT', resourceType: 'Event', resourceId: event._id,
    oldValue, newValue: event.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return event;
}

async function cancelEvent(eventId, adminUser, reason, meta = {}) {
  const event = await Event.findById(eventId);
  if (!event) throw new ApiError(404, 'Event not found', 'NOT_FOUND');

  const oldValue = event.toObject();
  event.status = EVENT_STATUS.CANCELLED;
  await event.save();

  await auditService.log({
    action: 'CANCEL_EVENT', performedBy: adminUser._id, role: adminUser.role,
    module: 'EVENT', resourceType: 'Event', resourceId: event._id,
    oldValue, newValue: event.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  // Notify all active registrants
  const registrations = await EventRegistration.find({
    eventId, status: { $in: [REGISTRATION_STATUS.REGISTERED, REGISTRATION_STATUS.WAITLISTED] },
  });

  await Promise.all(
    registrations.map((r) =>
      notificationService.notify({
        userId: r.userId,
        type: NOTIFICATION_TYPE.GENERAL,
        title: 'Event Cancelled',
        message: `"${event.title}" scheduled on ${event.date.toDateString()} has been cancelled. ${reason ? 'Reason: ' + reason : ''}`,
        relatedResourceType: 'Event', relatedResourceId: event._id,
      })
    )
  );

   const requestService = require('./request.service');
  await requestService.syncRequestStatusByLinkedTransaction(event._id, REQUEST_STATUS.CANCELLED);

  return event;
}

async function markCompleted(eventId, adminUser, meta = {}) {
  const event = await Event.findById(eventId);
  if (!event) throw new ApiError(404, 'Event not found', 'NOT_FOUND');
  if (![EVENT_STATUS.PUBLISHED, EVENT_STATUS.ONGOING].includes(event.status)) {
    throw new ApiError(409, `Cannot complete an event with status ${event.status}`, 'INVALID_STATE');
  }

  const oldValue = event.toObject();
  event.status = EVENT_STATUS.COMPLETED;
  await event.save();

  await auditService.log({
    action: 'COMPLETE_EVENT', performedBy: adminUser._id, role: adminUser.role,
    module: 'EVENT', resourceType: 'Event', resourceId: event._id,
    oldValue, newValue: event.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });
   const requestService = require('./request.service'); // lazy require, same reasoning as room.service.js
  await requestService.syncRequestStatusByLinkedTransaction(event._id, REQUEST_STATUS.COMPLETED);

  return event;
}

async function listEvents({ status, upcoming, page = 1, limit = 20, visibleStatuses } = {}) {
  const query = {};
  if (visibleStatuses) query.status = { $in: visibleStatuses };
  if (status) query.status = status;
  if (upcoming) query.date = { $gte: normalizeToMidnightUTC(new Date()) };

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Event.find(query).sort({ date: 1 }).skip(skip).limit(limit),
    Event.countDocuments(query),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getEventById(eventId) {
  const event = await Event.findById(eventId).populate('createdBy', 'name email');
  if (!event) throw new ApiError(404, 'Event not found', 'NOT_FOUND');
  return event;
}

// ---------------------------------------------------------------------------
// REGISTRATION / RSVP — with atomic capacity + waitlist handling
// ---------------------------------------------------------------------------
async function registerForEvent(eventId, actorUser, meta = {}) {
  const userId = actorUser._id;
  const registration = await withTransaction(async (session) => {
    const event = await Event.findById(eventId).session(session);
    if (!event) throw new ApiError(404, 'Event not found', 'NOT_FOUND');
    if (![EVENT_STATUS.PUBLISHED, EVENT_STATUS.ONGOING].includes(event.status)) {
      throw new ApiError(409, 'Registration is not open for this event', 'INVALID_STATE');
    }

    const existing = await EventRegistration.findOne({ eventId, userId }).session(session);
    if (existing && existing.status !== REGISTRATION_STATUS.CANCELLED) {
      throw new ApiError(409, 'You are already registered for this event', 'ALREADY_REGISTERED');
    }

    let status = REGISTRATION_STATUS.REGISTERED;
    if (event.capacity > 0) {
      const registeredCount = await EventRegistration.countDocuments({
        eventId, status: REGISTRATION_STATUS.REGISTERED,
      }).session(session);
      if (registeredCount >= event.capacity) {
        status = REGISTRATION_STATUS.WAITLISTED;
      }
    }

    let record;
    if (existing) {
      // Re-registering after a previous cancellation — reuse the document (unique index constraint)
      existing.status = status;
      existing.registeredAt = new Date();
      existing.attendanceStatus = ATTENDANCE_STATUS.NOT_MARKED;
      existing.certificateStatus = event.certificateEnabled ? CERTIFICATE_STATUS.NOT_GENERATED : CERTIFICATE_STATUS.NOT_APPLICABLE;
      await existing.save({ session });
      record = existing;
    } else {
      const [created] = await EventRegistration.create(
        [{
          eventId, userId, status,
          certificateStatus: event.certificateEnabled ? CERTIFICATE_STATUS.NOT_GENERATED : CERTIFICATE_STATUS.NOT_APPLICABLE,
        }],
        { session }
      );
      record = created;
    }

    return record;
  });

  await auditService.log({
    action: 'REGISTER_FOR_EVENT', performedBy: actorUser._id, role: actorUser.role,
    module: 'EVENT', resourceType: 'EventRegistration', resourceId: registration._id,
    newValue: registration.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  await notificationService.notify({
    userId,
    type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
    title: registration.status === REGISTRATION_STATUS.WAITLISTED ? 'Added to Waitlist' : 'Event Registration Confirmed',
    message: registration.status === REGISTRATION_STATUS.WAITLISTED
      ? 'The event is currently full. You have been added to the waitlist and will be notified if a spot opens up.'
      : 'Your registration has been confirmed. See you there!',
    relatedResourceType: 'EventRegistration', relatedResourceId: registration._id,
  });

  return registration;
}

async function cancelRegistration(eventId, actorUser, meta = {}) {
  const userId = actorUser._id;
  const { registration, promoted } = await withTransaction(async (session) => {
    const reg = await EventRegistration.findOne({ eventId, userId }).session(session);
    if (!reg) throw new ApiError(404, 'Registration not found', 'NOT_FOUND');
    if (reg.status === REGISTRATION_STATUS.CANCELLED) {
      throw new ApiError(409, 'Registration is already cancelled', 'INVALID_STATE');
    }

    const wasRegistered = reg.status === REGISTRATION_STATUS.REGISTERED;
    reg.status = REGISTRATION_STATUS.CANCELLED;
    await reg.save({ session });

    let promotedRecord = null;

    // Auto-promote the earliest waitlisted registrant, if a REGISTERED slot just freed up
    if (wasRegistered) {
      promotedRecord = await EventRegistration.findOne({
        eventId, status: REGISTRATION_STATUS.WAITLISTED,
      }).sort({ registeredAt: 1 }).session(session);

      if (promotedRecord) {
        promotedRecord.status = REGISTRATION_STATUS.REGISTERED;
        await promotedRecord.save({ session });
      }
    }

    return { registration: reg, promoted: promotedRecord };
  });

  await auditService.log({
    action: 'CANCEL_EVENT_REGISTRATION', performedBy: actorUser._id, role: actorUser.role,
    module: 'EVENT', resourceType: 'EventRegistration', resourceId: registration._id,
    newValue: { status: REGISTRATION_STATUS.CANCELLED }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  if (promoted) {
    await notificationService.notify({
      userId: promoted.userId,
      type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
      title: 'You\'re In! 🎉',
      message: 'A spot opened up and you have been moved from the waitlist to confirmed registration.',
      relatedResourceType: 'EventRegistration', relatedResourceId: promoted._id,
    });
  }

  return registration;
}

async function listMyRegistrations(userId, { status, page = 1, limit = 20 } = {}) {
  const query = { userId };
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    EventRegistration.find(query)
      .populate('eventId', 'title venue date startTime endTime status')
      .sort({ registeredAt: -1 })
      .skip(skip)
      .limit(limit),
    EventRegistration.countDocuments(query),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function listEventRegistrations(eventId, { status, page = 1, limit = 50 } = {}) {
  const query = { eventId };
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    EventRegistration.find(query)
      .populate('userId', 'name email role department startupName')
      .sort({ registeredAt: 1 })
      .skip(skip)
      .limit(limit),
    EventRegistration.countDocuments(query),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// ---------------------------------------------------------------------------
// ATTENDANCE — manual, per Section 33 (no QR)
// ---------------------------------------------------------------------------
async function markAttendance(registrationId, status, adminUser, meta = {}) {
  if (!Object.values(ATTENDANCE_STATUS).includes(status)) {
    throw new ApiError(400, 'Invalid attendance status', 'VALIDATION_ERROR');
  }

  const registration = await EventRegistration.findById(registrationId);
  if (!registration) throw new ApiError(404, 'Registration not found', 'NOT_FOUND');
  if (registration.status !== REGISTRATION_STATUS.REGISTERED) {
    throw new ApiError(409, 'Only confirmed registrations can have attendance marked', 'INVALID_STATE');
  }

  const oldValue = registration.toObject();
  registration.attendanceStatus = status;
  registration.attendanceMarkedBy = adminUser._id;
  registration.attendanceMarkedAt = new Date();
  await registration.save();

  await auditService.log({
    action: 'MARK_ATTENDANCE', performedBy: adminUser._id, role: adminUser.role,
    module: 'EVENT', resourceType: 'EventRegistration', resourceId: registration._id,
    oldValue, newValue: registration.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return registration;
}

// Bulk variant — admin submits an array of { registrationId, status } from a checklist UI
async function bulkMarkAttendance(entries, adminUser, meta = {}) {
  const results = { updated: 0, errors: [] };

  for (const entry of entries) {
    try {
      await markAttendance(entry.registrationId, entry.status, adminUser, meta);
      results.updated++;
    } catch (err) {
      results.errors.push({ registrationId: entry.registrationId, error: err.message });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// CERTIFICATE GENERATION — manual, bulk-triggered by admin, no QR dependency
// ---------------------------------------------------------------------------
async function generateCertificatesForEvent(eventId, adminUser, meta = {}) {
  const event = await Event.findById(eventId);
  if (!event) throw new ApiError(404, 'Event not found', 'NOT_FOUND');
  if (!event.certificateEnabled) {
    throw new ApiError(400, 'Certificates are not enabled for this event', 'CERTIFICATES_DISABLED');
  }

  const eligibleRegistrations = await EventRegistration.find({
    eventId,
    attendanceStatus: ATTENDANCE_STATUS.ATTENDED,
    certificateStatus: { $in: [CERTIFICATE_STATUS.NOT_GENERATED, CERTIFICATE_STATUS.FAILED] },
  }).populate('userId', 'name email');

  if (eligibleRegistrations.length === 0) {
    return { generated: 0, failed: 0, message: 'No eligible attendees found for certificate generation.' };
  }

  let generated = 0;
  let failed = 0;

  for (const reg of eligibleRegistrations) {
    try {
      const certUrl = await certificateService.generateEventCertificate(reg.userId, event);

      reg.certificateUrl = certUrl;
      reg.certificateGeneratedAt = new Date();
      reg.certificateStatus = CERTIFICATE_STATUS.GENERATED;
      await reg.save();

      const emailSent = await certificateService.emailCertificate(
        reg.userId,
        `Your Certificate for ${event.title}`,
        `Congratulations on participating in "${event.title}"! Your certificate is attached below.`,
        certUrl
      );

      if (emailSent) {
        reg.certificateStatus = CERTIFICATE_STATUS.SENT;
        await reg.save();
      }

      await notificationService.notify({
        userId: reg.userId._id,
        type: NOTIFICATION_TYPE.GENERAL,
        title: 'Certificate Ready 🎓',
        message: `Your certificate for "${event.title}" has been generated and emailed to you.`,
        relatedResourceType: 'EventRegistration', relatedResourceId: reg._id,
      });

      generated++;
    } catch (err) {
      console.error(`[CERTIFICATE] Failed for registration ${reg._id}:`, err);
      reg.certificateStatus = CERTIFICATE_STATUS.FAILED;
      await reg.save().catch(() => {});
      failed++;
    }
  }

  await auditService.log({
    action: 'GENERATE_EVENT_CERTIFICATES', performedBy: adminUser._id, role: adminUser.role,
    module: 'EVENT', resourceType: 'Event', resourceId: event._id,
    newValue: { generated, failed }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return { generated, failed, total: eligibleRegistrations.length };
}

module.exports = {
  checkVenueConflict,
  createEvent, publishDraftEvent, updateEvent, cancelEvent, markCompleted,
  listEvents, getEventById,
  registerForEvent, cancelRegistration, listMyRegistrations, listEventRegistrations,
  markAttendance, bulkMarkAttendance,
  generateCertificatesForEvent,
};