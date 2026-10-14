const {
  NoDuesRequest,
  CabinAllotment,
  HardwareTransaction,
  RoomBooking,
  Request,
  User,
} = require('../models');
const {
  NO_DUES_STATUS,
  MODULE_CHECK_STATUS,
  ALLOTMENT_STATUS,
  HARDWARE_TXN_STATUS,
  BOOKING_STATUS,
  REQUEST_STATUS,
  NOTIFICATION_TYPE,
  USER_STATUS,
} = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/db');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const certificateService = require('./certificate.service');

// ---------------------------------------------------------------------------
// MODULE-WISE CHECK FUNCTIONS
// Each returns { status, remarks, pendingItems }
// ---------------------------------------------------------------------------

async function checkCabinModule(userId, session) {
  const blockingStatuses = [
    ALLOTMENT_STATUS.PENDING,
    ALLOTMENT_STATUS.APPROVED,
    ALLOTMENT_STATUS.ACTIVE,
  ];

  const allotments = await CabinAllotment.find({
    $or: [{ founderId: userId }, { members: userId }],
    status: { $in: blockingStatuses },
  })
    .populate('cabinId', 'cabinNumber name')
    .session(session);

  if (allotments.length === 0) {
    return { status: MODULE_CHECK_STATUS.CLEAR, remarks: 'No active cabin allotments.', pendingItems: [] };
  }

  const pendingItems = allotments.map(
    (a) => `Cabin ${a.cabinId?.cabinNumber || a.cabinId} — status: ${a.status} (till ${a.endDate?.toDateString()})`
  );

  return {
    status: MODULE_CHECK_STATUS.BLOCKED,
    remarks: `${allotments.length} active/pending cabin allotment(s) found. Must be vacated/cancelled first.`,
    pendingItems,
  };
}

async function checkHardwareModule(userId, session) {
  const blockingStatuses = [
    HARDWARE_TXN_STATUS.REQUESTED,
    HARDWARE_TXN_STATUS.APPROVED,
    HARDWARE_TXN_STATUS.ISSUED,
    HARDWARE_TXN_STATUS.OVERDUE,
    HARDWARE_TXN_STATUS.RETURNED, // handed back but not yet inspected by an admin
    HARDWARE_TXN_STATUS.INSPECTION,
  ];

  const transactions = await HardwareTransaction.find({
    requestedBy: userId,
    status: { $in: blockingStatuses },
  })
    .populate('hardwareId', 'itemName assetTag')
    .session(session);

  if (transactions.length === 0) {
    return { status: MODULE_CHECK_STATUS.CLEAR, remarks: 'No pending hardware liabilities.', pendingItems: [] };
  }

  const pendingItems = transactions.map((t) => {
    const item = t.hardwareId;
    const tag = item?.assetTag ? ` (Asset: ${item.assetTag})` : '';
    return `${item?.itemName || 'Unknown item'}${tag} — status: ${t.status}, qty: ${t.quantity}`;
  });

  return {
    status: MODULE_CHECK_STATUS.BLOCKED,
    remarks: `${transactions.length} hardware item(s) not yet returned.`,
    pendingItems,
  };
}

// Non-blocking per design decision above — informational only.
async function checkRoomModule(userId, session) {
  const now = new Date();
  const upcomingBookings = await RoomBooking.find({
    bookedBy: userId,
    status: { $in: [BOOKING_STATUS.APPROVED, BOOKING_STATUS.ACTIVE] },
    date: { $gte: now },
  })
    .populate('roomId', 'roomName')
    .session(session);

  if (upcomingBookings.length === 0) {
    return { status: MODULE_CHECK_STATUS.CLEAR, remarks: 'No upcoming room bookings.', pendingItems: [] };
  }

  const pendingItems = upcomingBookings.map(
    (b) => `${b.roomId?.roomName || b.roomId} on ${b.date.toDateString()} (${b.startTime}-${b.endTime})`
  );

  return {
    status: MODULE_CHECK_STATUS.CLEAR, // informational, does NOT block
    remarks: `${upcomingBookings.length} upcoming booking(s) found — will not block clearance, informational only.`,
    pendingItems,
  };
}

// Non-blocking per design decision above — informational only.
async function checkRequestsModule(userId, session) {
  const pending = await Request.find({
    requestedBy: userId,
    status: REQUEST_STATUS.PENDING,
  }).session(session);

  if (pending.length === 0) {
    return { status: MODULE_CHECK_STATUS.CLEAR, remarks: 'No pending requests.', pendingItems: [] };
  }

  return {
    status: MODULE_CHECK_STATUS.CLEAR, // informational, does NOT block
    remarks: `${pending.length} pending request(s) exist — informational only, does not block clearance.`,
    pendingItems: pending.map((r) => `${r.requestNumber} (${r.type})`),
  };
}

function computeOverallStatus(moduleChecks) {
  const blockingModules = [moduleChecks.cabin, moduleChecks.hardware]; // only these two can block
  const hasBlocked = blockingModules.some((m) => m.status === MODULE_CHECK_STATUS.BLOCKED);
  return hasBlocked ? NO_DUES_STATUS.BLOCKED : NO_DUES_STATUS.IN_REVIEW;
}

// ---------------------------------------------------------------------------
// CORE: Run (or re-run) the auto-check for a user's No-Dues record
// ---------------------------------------------------------------------------
async function runAutoCheck(noDuesRequestId, session) {
  const noDues = await NoDuesRequest.findById(noDuesRequestId).session(session);
  if (!noDues) throw new ApiError(404, 'No-Dues request not found', 'NOT_FOUND');

  // Don't re-run checks on an already CLEARED record — it's a finalized document.
  if (noDues.status === NO_DUES_STATUS.CLEARED) {
    return noDues;
  }

  const [cabin, hardware, room, requests] = await Promise.all([
    checkCabinModule(noDues.userId, session),
    checkHardwareModule(noDues.userId, session),
    checkRoomModule(noDues.userId, session),
    checkRequestsModule(noDues.userId, session),
  ]);

  noDues.moduleChecks = { cabin, hardware, room, requests };
  noDues.overallStatus = computeOverallStatus(noDues.moduleChecks);
  const sentBack = noDues.status === NO_DUES_STATUS.PENDING && noDues.reviewedAt; // admin rejected: stays with the admin
  noDues.status =
    noDues.overallStatus === NO_DUES_STATUS.BLOCKED
      ? NO_DUES_STATUS.BLOCKED
      : (sentBack ? NO_DUES_STATUS.PENDING : NO_DUES_STATUS.IN_REVIEW);
  noDues.lastCheckedAt = new Date();

  await noDues.save({ session });
  return noDues;
}

// ---------------------------------------------------------------------------
// INITIATE — creates a new No-Dues request (self or admin-initiated)
// ---------------------------------------------------------------------------
async function initiateNoDuesRequest(targetUserId, initiatedBy, actor) {
  if (!/^[a-f\d]{24}$/i.test(String(targetUserId))) throw new ApiError(400, 'Invalid userId', 'VALIDATION_ERROR');
  const existing = await NoDuesRequest.findOne({
    userId: targetUserId,
    status: { $in: [NO_DUES_STATUS.PENDING, NO_DUES_STATUS.IN_REVIEW, NO_DUES_STATUS.BLOCKED] },
  });
  if (existing) {
    throw new ApiError(409, 'An active No-Dues request already exists for this user', 'ALREADY_EXISTS');
  }

  const user = await User.findById(targetUserId);
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  const noDues = await withTransaction(async (session) => {
    const [created] = await NoDuesRequest.create(
      [{ userId: targetUserId, initiatedBy, status: NO_DUES_STATUS.PENDING }],
      { session }
    );
    return runAutoCheck(created._id, session);
  });

  await auditService.log({
    action: 'INITIATE_NO_DUES', performedBy: actor.user._id, role: actor.user.role,
    module: 'NO_DUES', resourceType: 'NoDuesRequest', resourceId: noDues._id,
    newValue: noDues.toObject(), ipAddress: actor.ip, userAgent: actor.userAgent,
  });

  if (noDues.overallStatus === NO_DUES_STATUS.BLOCKED) {
    await notificationService.notify({
      userId: targetUserId,
      type: NOTIFICATION_TYPE.NO_DUES_BLOCKED,
      title: 'No-Dues Clearance Blocked',
      message: 'Your No-Dues request has pending items. Please check details and resolve them.',
      relatedResourceType: 'NoDuesRequest', relatedResourceId: noDues._id,
    });
  } else {
    await notificationService.notifyAdmins({
      type: NOTIFICATION_TYPE.GENERAL,
      title: 'No-Dues Request Awaiting Review',
      message: `${user.name}'s No-Dues request has auto-cleared all modules and awaits final admin sign-off.`,
      relatedResourceType: 'NoDuesRequest', relatedResourceId: noDues._id,
    });
  }

  return noDues;
}

// ---------------------------------------------------------------------------
// RE-CHECK — manually triggered by user/admin, OR opportunistically called
// by other services (hardware return, cabin vacate) to auto-unblock.
// ---------------------------------------------------------------------------
async function recheckNoDues(noDuesRequestId, actor) {
  if (actor?.user) { // user-initiated: owner or admin only (closes IDOR)
    const rec = await NoDuesRequest.findById(noDuesRequestId).select('userId');
    if (!rec) throw new ApiError(404, 'No-Dues request not found', 'NOT_FOUND');
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(actor.user.role);
    if (!isAdmin && String(rec.userId) !== String(actor.user._id)) throw new ApiError(403, 'Not authorized for this No-Dues request', 'FORBIDDEN');
  }
  const noDues = await withTransaction((session) => runAutoCheck(noDuesRequestId, session));

  if (actor?.user) {
    await auditService.log({
      action: 'RECHECK_NO_DUES', performedBy: actor.user._id, role: actor.user.role,
      module: 'NO_DUES', resourceType: 'NoDuesRequest', resourceId: noDues._id,
      newValue: noDues.toObject(), ipAddress: actor.ip, userAgent: actor.userAgent,
    });
  } else {
    await auditService.logSystemAction({
      action: 'RECHECK_NO_DUES',
      module: 'NO_DUES', resourceType: 'NoDuesRequest', resourceId: noDues._id,
      newValue: noDues.toObject(),
    });
  }


  if (noDues.overallStatus === NO_DUES_STATUS.IN_REVIEW) {
    await notificationService.notify({
      userId: noDues.userId,
      type: NOTIFICATION_TYPE.GENERAL,
      title: 'No-Dues Auto-Cleared',
      message: 'All pending items resolved. Your No-Dues request now awaits final admin approval.',
      relatedResourceType: 'NoDuesRequest', relatedResourceId: noDues._id,
    });
  }

  return noDues;
}

/**
 * Fire-and-forget helper — other services (hardware.service.js on return,
 * cabinExpiry.job.js on vacate) call this AFTER their own transaction commits,
 * so an unresolved No-Dues request can auto-unblock without the user having
 * to manually click "re-check". Errors here must never break the caller's flow.
 */
async function recheckIfExists(userId) {
  try {
    const noDues = await NoDuesRequest.findOne({
      userId,
      status: { $in: [NO_DUES_STATUS.PENDING, NO_DUES_STATUS.BLOCKED] },
    });
    if (noDues) await recheckNoDues(noDues._id, null);
  } catch (err) {
    console.error('NO_DUES_OPPORTUNISTIC_RECHECK_FAILED:', err);
  }
}

// ---------------------------------------------------------------------------
// ADMIN FINAL SIGN-OFF — required even after all modules auto-clear
// ---------------------------------------------------------------------------
async function adminReviewNoDues(noDuesRequestId, adminUser, decision, remarks, meta = {}) {
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    throw new ApiError(400, 'decision must be APPROVE or REJECT', 'VALIDATION_ERROR');
  }

  const { noDues, oldValue } = await withTransaction(async (session) => {
    const record = await NoDuesRequest.findById(noDuesRequestId).session(session);
    if (!record) throw new ApiError(404, 'No-Dues request not found', 'NOT_FOUND');

    if (record.status !== NO_DUES_STATUS.IN_REVIEW) {
      throw new ApiError(
        409,
        `Cannot review a request with status ${record.status}. All modules must auto-clear first.`,
        'INVALID_STATE'
      );
    }

    if (decision === 'APPROVE') {
      // Re-verify at sign-off: liabilities may have appeared since the last auto-check.
      const [cabin, hardware] = await Promise.all([checkCabinModule(record.userId, session), checkHardwareModule(record.userId, session)]);
      if (cabin.status === MODULE_CHECK_STATUS.BLOCKED || hardware.status === MODULE_CHECK_STATUS.BLOCKED) {
        throw new ApiError(409, 'Pending liabilities found at sign-off. Re-check the request first.', 'LIABILITIES_PENDING');
      }
    }
    const snapshot = record.toObject();

    if (decision === 'APPROVE') {
      record.status = NO_DUES_STATUS.CLEARED;
      record.overallStatus = NO_DUES_STATUS.CLEARED;
    } else {
      record.status = NO_DUES_STATUS.PENDING; // sent back — admin found something the auto-check missed
    }

    record.reviewedBy = adminUser._id;
    record.reviewedAt = new Date();
    record.reviewRemarks = remarks;

    await record.save({ session });
    return { noDues: record, oldValue: snapshot };
  });

  await auditService.log({
    action: decision === 'APPROVE' ? 'APPROVE_NO_DUES' : 'REJECT_NO_DUES_REVIEW',
    performedBy: adminUser._id, role: adminUser.role,
    module: 'NO_DUES', resourceType: 'NoDuesRequest', resourceId: noDues._id,
    oldValue, newValue: noDues.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  if (decision === 'APPROVE') {
    // Certificate generation is decoupled — failure here shouldn't undo the clearance.
    try {
      const { url } = await certificateService.generateNoDuesCertificate(noDues);
      noDues.certificateUrl = url;
      noDues.certificateGeneratedAt = new Date();
      await noDues.save();
    } catch (err) {
      console.error('NO_DUES_CERTIFICATE_GENERATION_FAILED:', err);
    }

    await notificationService.notify({
      userId: noDues.userId,
      type: NOTIFICATION_TYPE.NO_DUES_CLEARED,
      title: 'No-Dues Cleared ✅',
      message: 'Your No-Dues clearance has been approved. You can download your certificate from the No-dues page.',
      relatedResourceType: 'NoDuesRequest', relatedResourceId: noDues._id,
    });
  } else {
    await notificationService.notify({
      userId: noDues.userId,
      type: NOTIFICATION_TYPE.NO_DUES_BLOCKED,
      title: 'No-Dues Sent Back',
      message: `Admin sent your No-Dues request back for review. Remarks: ${remarks || 'Not specified'}`,
      relatedResourceType: 'NoDuesRequest', relatedResourceId: noDues._id,
    });
  }

  return noDues;
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------
async function getNoDuesStatus(userId) {
  const noDues = await NoDuesRequest.findOne({ userId }).sort({ createdAt: -1 });
  if (!noDues) {
    return { status: NO_DUES_STATUS.NOT_STARTED, overallStatus: NO_DUES_STATUS.NOT_STARTED };
  }
  return noDues;
}

async function listNoDuesRequests({ status, page = 1, limit = 20 }) {
  const query = {};
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    NoDuesRequest.find(query)
      .populate('userId', 'name email role department startupName')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    NoDuesRequest.countDocuments(query),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

module.exports = {
  initiateNoDuesRequest,
  recheckNoDues,
  recheckIfExists,
  adminReviewNoDues,
  getNoDuesStatus,
  listNoDuesRequests,
};