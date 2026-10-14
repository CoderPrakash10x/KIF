const { Request, Room } = require('../models');
const { REQUEST_STATUS, ROLES, NOTIFICATION_TYPE } = require('../constants/enums');
const requestHandlers = require('./requestHandlers');
const { withTransaction } = require('../utils/db');
const roomAccess = require('./roomAccess.service');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');

function getHandler(type) {
  const handler = requestHandlers[type];
  if (!handler) throw new ApiError(400, `Unsupported request type: ${type}`, 'INVALID_TYPE');
  return handler;
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
async function createRequest(payload, actor) {
  const { type, resourceId, startDate, endDate, startTime, endTime, purpose, metadata } = payload;
  const { user, ip, userAgent } = actor;

  const handler = getHandler(type);

  const request = await withTransaction(async (session) => {
    // Resource-specific validation (+ possible resource locking, e.g. Cabin -> REQUESTED)
    await handler.validate({ resourceId, requestedBy: user._id, startDate, endDate, startTime, endTime, purpose, metadata, session });

    const [created] = await Request.create(
      [{
        type, resourceId, requestedBy: user._id,
        startDate, endDate, startTime, endTime, purpose,
        metadata: metadata || {},
        status: REQUEST_STATUS.PENDING,
      }],
      { session }
    );

    if (handler.afterCreate) await handler.afterCreate({ request: created, session });

    return created;
  });

  await auditService.log({
    action: 'CREATE_REQUEST', performedBy: user._id, role: user.role,
    module: type, resourceType: 'Request', resourceId: request._id,
    newValue: request.toObject(), ipAddress: ip, userAgent,
  });

  const notifyPayload = {
    type: NOTIFICATION_TYPE.GENERAL,
    title: 'New Resource Request',
    message: `${user.name} raised a new ${type} request (${request.requestNumber}).`,
    relatedResourceType: 'Request', relatedResourceId: request._id,
  };
  if (type === 'ROOM') {
    // Only the assigned room administrator and the Super Admin hear about a room request.
    const room = await Room.findById(request.resourceId).select('assignedAdmin');
    await notificationService.notifySuperAdmins(notifyPayload);
    if (room?.assignedAdmin) await notificationService.notify({ ...notifyPayload, userId: room.assignedAdmin, email: false });
  } else {
    await notificationService.notifyAdmins(notifyPayload);
  }

  return request;
}

// ---------------------------------------------------------------------------
// APPROVE
// ---------------------------------------------------------------------------
async function approveRequest(requestId, adminUser, remarks, meta = {}) {
  const { request, oldValue } = await withTransaction(async (session) => {
    const req = await Request.findById(requestId).session(session);
    if (req) await roomAccess.assertCanDecideRequest(adminUser, req, session);
    if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');
    if (req.status !== REQUEST_STATUS.PENDING) {
      throw new ApiError(409, `Cannot approve a request with status ${req.status}`, 'INVALID_STATE');
    }

    const handler = getHandler(req.type);
    const { linkedTransactionId, nextStatus } = await handler.onApprove({ request: req, adminUser, session });

    const snapshot = req.toObject();
    req.status = nextStatus || REQUEST_STATUS.APPROVED;
    req.adminRemarks = remarks;
    req.reviewedBy = adminUser._id;
    req.reviewedAt = new Date();
    req.linkedTransactionId = linkedTransactionId;
    await req.save({ session });

    return { request: req, oldValue: snapshot };
  });

  await auditService.log({
    action: 'APPROVE_REQUEST', performedBy: adminUser._id, role: adminUser.role,
    module: request.type, resourceType: 'Request', resourceId: request._id,
    oldValue, newValue: request.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  await notificationService.notify({
    userId: request.requestedBy,
    type: NOTIFICATION_TYPE.REQUEST_APPROVED,
    title: 'Request Approved',
    message: `Your ${request.type} request (${request.requestNumber}) has been approved.`,
    relatedResourceType: 'Request', relatedResourceId: request._id,
  });

  return request;
}

// ---------------------------------------------------------------------------
// REJECT
// ---------------------------------------------------------------------------
async function rejectRequest(requestId, adminUser, remarks, meta = {}) {
  const { request, oldValue } = await withTransaction(async (session) => {
    const req = await Request.findById(requestId).session(session);
    if (req) await roomAccess.assertCanDecideRequest(adminUser, req, session);
    if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');
    if (req.status !== REQUEST_STATUS.PENDING) {
      throw new ApiError(409, `Cannot reject a request with status ${req.status}`, 'INVALID_STATE');
    }

    const handler = getHandler(req.type);
    if (handler.onReject) await handler.onReject({ request: req, adminUser, session });

    const snapshot = req.toObject();
    req.status = REQUEST_STATUS.REJECTED;
    req.adminRemarks = remarks;
    req.reviewedBy = adminUser._id;
    req.reviewedAt = new Date();
    await req.save({ session });

    return { request: req, oldValue: snapshot };
  });

  await auditService.log({
    action: 'REJECT_REQUEST', performedBy: adminUser._id, role: adminUser.role,
    module: request.type, resourceType: 'Request', resourceId: request._id,
    oldValue, newValue: request.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  await notificationService.notify({
    userId: request.requestedBy,
    type: NOTIFICATION_TYPE.REQUEST_REJECTED,
    title: 'Request Rejected',
    message: `Your ${request.type} request (${request.requestNumber}) was rejected. Reason: ${remarks || 'Not specified'}`,
    relatedResourceType: 'Request', relatedResourceId: request._id,
  });

  return request;
}

// ---------------------------------------------------------------------------
// CANCEL (by requester or admin)
// ---------------------------------------------------------------------------
async function cancelRequest(requestId, actorUser, meta = {}) {
  let postCommit;

  const { request, oldValue } = await withTransaction(async (session) => {
    const req = await Request.findById(requestId).session(session);
    if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

    const isOwner = String(req.requestedBy) === String(actorUser._id);
    const isAdmin = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(actorUser.role);
    if (!isOwner && !isAdmin) throw new ApiError(403, 'Not authorized to cancel this request', 'FORBIDDEN');
    if (!isOwner) await roomAccess.assertCanDecideRequest(actorUser, req, session); // admin cancelling someone else's room request

    const cancellable = [REQUEST_STATUS.PENDING, REQUEST_STATUS.APPROVED, REQUEST_STATUS.ACTIVE];
    if (!cancellable.includes(req.status)) {
      throw new ApiError(409, `Cannot cancel a request with status ${req.status}`, 'INVALID_STATE');
    }

    const handler = getHandler(req.type);
    if (handler.onCancel) {
      const result = await handler.onCancel({ request: req, actorUser, session });
      postCommit = result?.postCommit;
    }

    const snapshot = req.toObject();
    req.status = REQUEST_STATUS.CANCELLED;
    await req.save({ session });

    return { request: req, oldValue: snapshot };
  });

  await auditService.log({
    action: 'CANCEL_REQUEST', performedBy: actorUser._id, role: actorUser.role,
    module: request.type, resourceType: 'Request', resourceId: request._id,
    oldValue, newValue: request.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  // Post-commit hooks run outside the transaction, deliberately — a No-Dues
  // recheck failure must never roll back a legitimate cancellation.
  if (typeof postCommit === 'function') {
    try { await postCommit(); } catch (err) { console.error('POST_COMMIT_HOOK_FAILED:', err); }
  }

  return request;
}
// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------
async function listRequests({ status, type, requestedBy, search, scope, page = 1, limit = 20 }) {
  const query = {};
  if (scope) query.$and = [scope]; // room-admin visibility (see roomAccess.service)
  if (search) {
    const rx = new RegExp(String(search).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ requestNumber: rx }, { purpose: rx }];
  }
  if (status) query.status = status;
  if (type) query.type = type;
  if (requestedBy) query.requestedBy = requestedBy;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Request.find(query)
      .populate({ path: 'resourceId', select: 'cabinNumber roomName itemName assetTag title venue date startTime endTime' })
      .populate('requestedBy', 'name email role')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Request.countDocuments(query),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getRequestById(requestId) {
  const request = await Request.findById(requestId)
    .populate({ path: 'resourceId', select: 'cabinNumber roomName itemName assetTag title venue date startTime endTime' })
    .populate('requestedBy', 'name email role')
    .populate('reviewedBy', 'name email');
  if (!request) throw new ApiError(404, 'Request not found', 'NOT_FOUND');
  return request;
}

// Used later by cron jobs (e.g. cabinExpiry.job.js) to keep Request.status
// in sync when a linked resource transitions automatically (ACTIVE -> COMPLETED/EXPIRED)
async function syncRequestStatusByLinkedTransaction(linkedTransactionId, newStatus) {
  await Request.findOneAndUpdate({ linkedTransactionId }, { status: newStatus });
}

module.exports = {
  createRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  listRequests,
  getRequestById,
  syncRequestStatusByLinkedTransaction,
};