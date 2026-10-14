const { Cabin, CabinAllotment } = require('../../models');
const { CABIN_STATUS, ALLOTMENT_STATUS, REQUEST_STATUS } = require('../../constants/enums');
const ApiError = require('../../utils/ApiError');

async function validate({ resourceId, session }) {
  const cabin = await Cabin.findById(resourceId).session(session);
  if (!cabin || !cabin.active) throw new ApiError(404, 'Cabin not found', 'NOT_FOUND');
  if (cabin.status !== CABIN_STATUS.FREE) {
    throw new ApiError(409, `Cabin is currently ${cabin.status} and not available`, 'CABIN_UNAVAILABLE');
  }
}

// Atomic conditional update — closes the race window between validate() and
// afterCreate() where two concurrent requests could both pass the FREE check.
async function afterCreate({ request, session }) {
  const cabin = await Cabin.findOneAndUpdate(
    { _id: request.resourceId, status: CABIN_STATUS.FREE, active: true },
    { $set: { status: CABIN_STATUS.REQUESTED } },
    { new: true, session }
  );
  if (!cabin) throw new ApiError(409, 'Cabin is no longer available', 'CABIN_UNAVAILABLE');
}

// FIX: now uses the same atomic conditional-update guard that cabin.service.js's
// createDirectAllotment() adopted — previously this used a plain findById + save,
// which was less race-safe than its sibling function and had drifted out of sync.
async function onApprove({ request, adminUser, session }) {
  const now = new Date();
  const isImmediate = new Date(request.startDate) <= now;

  const cabin = await Cabin.findOneAndUpdate(
    { _id: request.resourceId, status: CABIN_STATUS.REQUESTED },
    { $set: { status: isImmediate ? CABIN_STATUS.OCCUPIED : CABIN_STATUS.RESERVED } },
    { new: true, session }
  );
  if (!cabin) throw new ApiError(409, 'Cabin is no longer in a requested state', 'CABIN_STATE_MISMATCH');

  const [allotment] = await CabinAllotment.create(
    [{
      cabinId: cabin._id,
      startupName: request.metadata?.startupName,
      founderId: request.requestedBy,
      members: request.metadata?.members || [],
      startDate: request.startDate,
      endDate: request.endDate,
      purpose: request.purpose,
      documentUrl: request.metadata?.documentUrl,
      status: isImmediate ? ALLOTMENT_STATUS.ACTIVE : ALLOTMENT_STATUS.APPROVED,
      approvedBy: adminUser._id,
      approvedAt: now,
    }],
    { session }
  );

  cabin.currentAllotment = allotment._id;
  await cabin.save({ session });

  return { linkedTransactionId: allotment._id, nextStatus: isImmediate ? REQUEST_STATUS.ACTIVE : REQUEST_STATUS.APPROVED };
}

async function onReject({ request, session }) {
  await Cabin.findByIdAndUpdate(
    request.resourceId,
    { status: CABIN_STATUS.FREE, currentAllotment: null },
    { session }
  );
}

// FIX: now records endedAt/endedBy/endReason (previously silently dropped due to
// the schema bug fixed above), and returns a postCommit hook so the founder's
// No-Dues status can be opportunistically re-checked after a cancellation —
// without request.service.js needing to know anything cabin-specific.
async function onCancel({ request, actorUser, session }) {
  const cabin = await Cabin.findById(request.resourceId).session(session);
  if (!cabin) return {};

  if (request.linkedTransactionId) {
    await CabinAllotment.findByIdAndUpdate(
      request.linkedTransactionId,
      {
        status: ALLOTMENT_STATUS.CANCELLED,
        endedAt: new Date(),
        endedBy: actorUser?._id,
        endReason: 'Cancelled via request cancellation',
      },
      { session }
    );
  }

  cabin.status = CABIN_STATUS.FREE;
  cabin.currentAllotment = null;
  await cabin.save({ session });

  return {
    postCommit: () => {
      const noDuesService = require('../noDues.service');
      return noDuesService.recheckIfExists(request.requestedBy);
    },
  };
}

module.exports = { validate, afterCreate, onApprove, onReject, onCancel };