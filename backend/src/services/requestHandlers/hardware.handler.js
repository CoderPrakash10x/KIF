const { Hardware, HardwareTransaction } = require('../../models');
const { HARDWARE_TXN_STATUS, REQUEST_STATUS } = require('../../constants/enums');
const ApiError = require('../../utils/ApiError');

const getQty = (request) => Number(request.metadata?.quantity) || 1;
const assertQty = (q) => { if (!Number.isInteger(q) || q < 1 || q > 1000) throw new ApiError(400, 'quantity must be a whole number between 1 and 1000', 'VALIDATION_ERROR'); };

// Availability is checked but NOT reserved at request time — reserving stock
// for a request that might get rejected would block other genuine requesters.
async function validate({ resourceId, metadata, session }) {
  const hardware = await Hardware.findById(resourceId).session(session);
  if (!hardware || !hardware.active) throw new ApiError(404, 'Hardware item not found', 'NOT_FOUND');

  const quantity = metadata?.quantity === undefined ? 1 : Number(metadata.quantity);
  assertQty(quantity);
  if (hardware.condition !== 'WORKING') throw new ApiError(409, 'This item is not in working condition', 'ITEM_UNAVAILABLE');
  if (hardware.availableQuantity < quantity) {
    throw new ApiError(409, `Only ${hardware.availableQuantity} unit(s) of ${hardware.itemName} available`, 'INSUFFICIENT_STOCK');
  }
}

async function onApprove({ request, session }) {
  const hardware = await Hardware.findById(request.resourceId).session(session);
  if (!hardware) throw new ApiError(404, 'Hardware item not found', 'NOT_FOUND');

  const quantity = getQty(request);
  if (hardware.availableQuantity < quantity) {
    // Stock may have changed between request creation and admin approval — recheck.
    throw new ApiError(409, 'Insufficient stock at approval time', 'INSUFFICIENT_STOCK');
  }

  hardware.availableQuantity -= quantity;
  await hardware.save({ session });

  const [txn] = await HardwareTransaction.create(
    [{
      hardwareId: hardware._id,
      requestId: request._id,
      requestedBy: request.requestedBy,
      quantity,
      status: HARDWARE_TXN_STATUS.APPROVED,
      expectedReturnDate: request.endDate,
      conditionOnIssue: hardware.condition,
    }],
    { session }
  );

  // NOTE: physical hand-over (APPROVED -> ISSUED) is a separate operational
  // action performed at the counter by admin — see hardware.service.js#markIssued
  // (built in the Hardware Module deliverable, not part of the generic engine).
  return { linkedTransactionId: txn._id, nextStatus: REQUEST_STATUS.APPROVED };
}

async function onReject() {
  // No stock was reserved at request-time — nothing to roll back.
}

async function onCancel({ request, session }) {
  if (!request.linkedTransactionId) return;

  const txn = await HardwareTransaction.findById(request.linkedTransactionId).session(session);
  if (!txn) return;
  if (txn.status !== HARDWARE_TXN_STATUS.APPROVED) throw new ApiError(409, 'The item has already been handed over; return it instead of cancelling', 'INVALID_STATE');

  const hardware = await Hardware.findById(txn.hardwareId).session(session);
  hardware.availableQuantity += txn.quantity;
  await hardware.save({ session });

  txn.status = HARDWARE_TXN_STATUS.CLOSED;
  await txn.save({ session });
}

module.exports = { validate, onApprove, onReject, onCancel };