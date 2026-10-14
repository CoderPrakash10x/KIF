const { Room, RoomBooking } = require('../../models');
const { BOOKING_STATUS, REQUEST_STATUS } = require('../../constants/enums');
const ApiError = require('../../utils/ApiError');
const roomService = require('../room.service'); // ← now the single source of truth

async function validate({ resourceId, startDate, startTime, endTime, session }) {
  const room = await Room.findById(resourceId).session(session);
  if (!room || !room.active) throw new ApiError(404, 'Room not found', 'NOT_FOUND');
  if (!startDate || !startTime || !endTime) {
    throw new ApiError(400, 'date, startTime and endTime are required', 'VALIDATION_ERROR');
  }
  await roomService.checkSlotConflict({ roomId: resourceId, date: startDate, startTime, endTime, session });
}

async function onApprove({ request, adminUser, session }) {
  // Defense-in-depth recheck at approval time (excluding this request itself)
  await roomService.checkSlotConflict({
    roomId: request.resourceId,
    date: request.startDate,
    startTime: request.startTime,
    endTime: request.endTime,
    excludeRequestId: request._id,
    session,
  });

  const room = await Room.findById(request.resourceId).session(session);

  const [booking] = await RoomBooking.create(
    [{
      roomId: room._id,
      bookedBy: request.requestedBy,
      requestId: request._id,
      date: request.startDate,
      startTime: request.startTime,
      endTime: request.endTime,
      purpose: request.purpose,
      status: BOOKING_STATUS.APPROVED,
      equipmentChecklist: (room.equipmentList || []).map((e) => ({ name: e.name })),
      approvedBy: adminUser._id,
    }],
    { session }
  );

  return { linkedTransactionId: booking._id, nextStatus: REQUEST_STATUS.APPROVED };
}

async function onReject() {
  // Nothing to roll back — RoomBooking is only created on approval.
}

async function onCancel({ request, session }) {
  if (!request.linkedTransactionId) return;
  await RoomBooking.findByIdAndUpdate(request.linkedTransactionId, { status: BOOKING_STATUS.CANCELLED }, { session });
}

module.exports = { validate, onApprove, onReject, onCancel };