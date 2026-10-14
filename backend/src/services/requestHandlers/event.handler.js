const { Event } = require('../../models');
const { EVENT_STATUS, REQUEST_STATUS } = require('../../constants/enums');
const ApiError = require('../../utils/ApiError');
const eventService = require('../event.service'); // ← single source of truth now

async function validate({ resourceId, requestedBy, session }) {
  const event = await Event.findById(resourceId).session(session);
  if (!event) throw new ApiError(404, 'Event not found', 'NOT_FOUND');
  if (String(event.createdBy) !== String(requestedBy)) throw new ApiError(403, 'Only the event creator can submit it for approval', 'FORBIDDEN');
  const dup = await require('../../models').Request.exists({ type: 'EVENT', resourceId, status: 'PENDING' }).session(session);
  if (dup) throw new ApiError(409, 'This event already has a pending approval request', 'ALREADY_REQUESTED');
  if (event.status !== EVENT_STATUS.DRAFT) {
    throw new ApiError(409, 'Only draft events can be submitted for approval', 'INVALID_STATE');
  }

  await eventService.checkVenueConflict({
    venue: event.venue, date: event.date, startTime: event.startTime, endTime: event.endTime,
    excludeEventId: event._id, session,
  });
}

async function onApprove({ request, adminUser, session }) {
  const event = await Event.findById(request.resourceId).session(session);
  if (!event) throw new ApiError(404, 'Event not found', 'NOT_FOUND');

  // Defense-in-depth recheck at approval time
  await eventService.checkVenueConflict({
    venue: event.venue, date: event.date, startTime: event.startTime, endTime: event.endTime,
    excludeEventId: event._id, session,
  });

  event.status = EVENT_STATUS.PUBLISHED;
  event.approvedBy = adminUser._id;
  await event.save({ session });

  return { linkedTransactionId: event._id, nextStatus: REQUEST_STATUS.APPROVED };
}

async function onReject({ request, session }) {
  await Event.updateOne({ _id: request.resourceId, status: EVENT_STATUS.DRAFT }, { status: EVENT_STATUS.CANCELLED }, { session });
}

async function onCancel({ request, session }) {
  // Only a still-draft event is withdrawn; a published event must never be cancelled by a stale request.
  await Event.updateOne({ _id: request.resourceId, status: EVENT_STATUS.DRAFT }, { status: EVENT_STATUS.CANCELLED }, { session });
}

module.exports = { validate, onApprove, onReject, onCancel };