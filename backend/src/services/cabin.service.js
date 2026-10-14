const { escapeRegex } = require('../utils/regex');
const {
  Cabin,
  CabinAllotment,
  Request: RequestModel,
} = require('../models');

const {
  CABIN_STATUS,
  ALLOTMENT_STATUS,
  REQUEST_STATUS,
  NOTIFICATION_TYPE,
} = require('../constants/enums');

const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/db');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const noDuesService = require('./noDues.service');

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function validateDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ApiError(
      400,
      'Valid startDate and endDate are required',
      'VALIDATION_ERROR'
    );
  }

  if (end <= start) {
    throw new ApiError(
      400,
      'endDate must be after startDate',
      'INVALID_DATE_RANGE'
    );
  }

  return { start, end };
}

async function recheckNoDuesForOccupants(allotment) {
  const userIds = [
    allotment.founderId,
    ...(allotment.members || []),
  ]
    .filter(Boolean)
    .map((id) => id._id || id);

  const uniqueUserIds = [
    ...new Set(userIds.map((id) => id.toString())),
  ];

  await Promise.all(
    uniqueUserIds.map((userId) =>
      noDuesService.recheckIfExists(userId)
    )
  );
}

// ---------------------------------------------------------------------------
// CABIN CATALOG CRUD
// ---------------------------------------------------------------------------

async function createCabin(payload, adminUser, meta = {}) {
  const cabin = await Cabin.create({
    cabinNumber: payload.cabinNumber,
    name: payload.name,
    type: payload.type,
    capacity: payload.capacity,
    location: payload.location,
    facilities: payload.facilities || [],
    status: CABIN_STATUS.FREE,
    active: true,
  });

  await auditService.log({
    action: 'CREATE_CABIN',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CABIN',
    resourceType: 'Cabin',
    resourceId: cabin._id,
    newValue: cabin.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return cabin;
}

async function updateCabin(cabinId, updates, adminUser, meta = {}) {
  const cabin = await Cabin.findById(cabinId);

  if (!cabin) {
    throw new ApiError(404, 'Cabin not found', 'NOT_FOUND');
  }

  const oldValue = cabin.toObject();

  // Lifecycle fields cannot be changed through generic catalog update.
  delete updates.status;
  delete updates.currentAllotment;
  delete updates.maintenanceReason;
  delete updates.active;

  Object.assign(cabin, updates);
  await cabin.save();

  await auditService.log({
    action: 'UPDATE_CABIN',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CABIN',
    resourceType: 'Cabin',
    resourceId: cabin._id,
    oldValue,
    newValue: cabin.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return cabin;
}

async function deactivateCabin(cabinId, adminUser, meta = {}) {
  const cabin = await Cabin.findById(cabinId);

  if (!cabin) {
    throw new ApiError(404, 'Cabin not found', 'NOT_FOUND');
  }

  if (
    cabin.currentAllotment ||
    [
      CABIN_STATUS.REQUESTED,
      CABIN_STATUS.RESERVED,
      CABIN_STATUS.OCCUPIED,
    ].includes(cabin.status)
  ) {
    throw new ApiError(
      409,
      'Cabin cannot be deactivated while it has an active request or allotment',
      'CABIN_IN_USE'
    );
  }

  const oldValue = cabin.toObject();

  cabin.active = false;
  await cabin.save();

  await auditService.log({
    action: 'DEACTIVATE_CABIN',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CABIN',
    resourceType: 'Cabin',
    resourceId: cabin._id,
    oldValue,
    newValue: cabin.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return cabin;
}

async function listCabins({
  status,
  type,
  search,
  active = true,
  page = 1,
  limit = 20,
} = {}) {
  const query = { active };

  if (status) query.status = status;
  if (type) query.type = type;

  if (search) {
    query.$or = [
      { cabinNumber: { $regex: escapeRegex(search), $options: 'i' } },
      { name: { $regex: escapeRegex(search), $options: 'i' } },
      { location: { $regex: escapeRegex(search), $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Cabin.find(query)
      .populate({
        path: 'currentAllotment',
        populate: {
          path: 'founderId',
          select: 'name email startupName',
        },
      })
      .sort({ cabinNumber: 1 })
      .skip(skip)
      .limit(limit),

    Cabin.countDocuments(query),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getCabinById(cabinId) {
  const cabin = await Cabin.findById(cabinId).populate({
    path: 'currentAllotment',
    populate: [
      {
        path: 'founderId',
        select: 'name email role startupName',
      },
      {
        path: 'members',
        select: 'name email role',
      },
    ],
  });

  if (!cabin) {
    throw new ApiError(404, 'Cabin not found', 'NOT_FOUND');
  }

  return cabin;
}

// ---------------------------------------------------------------------------
// MAINTENANCE LIFECYCLE
// ---------------------------------------------------------------------------

async function markCabinUnderMaintenance(
  cabinId,
  reason,
  adminUser,
  meta = {}
) {
  if (!reason?.trim()) {
    throw new ApiError(
      400,
      'Maintenance reason is required',
      'VALIDATION_ERROR'
    );
  }

  const cabin = await Cabin.findOneAndUpdate(
    {
      _id: cabinId,
      active: true,
      status: CABIN_STATUS.FREE,
      currentAllotment: null,
    },
    {
      $set: {
        status: CABIN_STATUS.MAINTENANCE,
        maintenanceReason: reason.trim(),
      },
    },
    {
      new: true,
    }
  );

  if (!cabin) {
    throw new ApiError(
      409,
      'Only a free cabin without an active allotment can be placed under maintenance',
      'CABIN_NOT_FREE'
    );
  }

  await auditService.log({
    action: 'MARK_CABIN_MAINTENANCE',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CABIN',
    resourceType: 'Cabin',
    resourceId: cabin._id,
    newValue: {
      status: cabin.status,
      maintenanceReason: cabin.maintenanceReason,
    },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return cabin;
}

async function clearCabinMaintenance(cabinId, adminUser, meta = {}) {
  const cabin = await Cabin.findOneAndUpdate(
    {
      _id: cabinId,
      active: true,
      status: CABIN_STATUS.MAINTENANCE,
    },
    {
      $set: {
        status: CABIN_STATUS.FREE,
        maintenanceReason: null,
      },
    },
    {
      new: true,
    }
  );

  if (!cabin) {
    throw new ApiError(
      409,
      'Cabin is not currently under maintenance',
      'INVALID_STATE'
    );
  }

  await auditService.log({
    action: 'CLEAR_CABIN_MAINTENANCE',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CABIN',
    resourceType: 'Cabin',
    resourceId: cabin._id,
    newValue: {
      status: CABIN_STATUS.FREE,
      maintenanceReason: null,
    },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return cabin;
}

// ---------------------------------------------------------------------------
// DIRECT ADMIN ALLOTMENT
// ---------------------------------------------------------------------------

async function createDirectAllotment(
  payload,
  adminUser,
  meta = {}
) {
  const {
    cabinId,
    founderId,
    members = [],
    startupName,
    startDate,
    endDate,
    purpose,
    documentUrl,
  } = payload;

  const { start, end } = validateDateRange(startDate, endDate);
  const now = new Date();
  const isImmediate = start <= now;

  const { cabin, allotment } = await withTransaction(
    async (session) => {
      // Conditional status transition prevents concurrent allotments.
      const reservedCabin = await Cabin.findOneAndUpdate(
        {
          _id: cabinId,
          active: true,
          status: CABIN_STATUS.FREE,
          currentAllotment: null,
        },
        {
          $set: {
            status: isImmediate
              ? CABIN_STATUS.OCCUPIED
              : CABIN_STATUS.RESERVED,
          },
        },
        {
          new: true,
          session,
        }
      );

      if (!reservedCabin) {
        throw new ApiError(
          409,
          'Cabin is no longer available',
          'CABIN_UNAVAILABLE'
        );
      }

      const [createdAllotment] =
        await CabinAllotment.create(
          [
            {
              cabinId,
              startupName,
              founderId,
              members,
              startDate: start,
              endDate: end,
              purpose,
              documentUrl,
              status: isImmediate
                ? ALLOTMENT_STATUS.ACTIVE
                : ALLOTMENT_STATUS.APPROVED,
              approvedBy: adminUser._id,
              approvedAt: now,
            },
          ],
          { session }
        );

      reservedCabin.currentAllotment =
        createdAllotment._id;

      await reservedCabin.save({ session });

      return {
        cabin: reservedCabin,
        allotment: createdAllotment,
      };
    }
  );

  await auditService.log({
    action: 'CREATE_DIRECT_CABIN_ALLOTMENT',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CABIN',
    resourceType: 'CabinAllotment',
    resourceId: allotment._id,
    newValue: allotment.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  await notificationService.notify({
    userId: founderId,
    type: NOTIFICATION_TYPE.GENERAL,
    title: 'Cabin Allotted',
    message: isImmediate
      ? `A cabin has been allotted to you until ${end.toDateString()}.`
      : `A cabin has been reserved for you from ${start.toDateString()} to ${end.toDateString()}.`,
    relatedResourceType: 'CabinAllotment',
    relatedResourceId: allotment._id,
  });

  return { cabin, allotment };
}

// ---------------------------------------------------------------------------
// ACTIVATE FUTURE/RESERVED ALLOTMENT
// ---------------------------------------------------------------------------

async function activateAllotment(
  allotmentId,
  adminUser,
  meta = {}
) {
  const { allotment, cabin, oldValue } =
    await withTransaction(async (session) => {
      const record = await CabinAllotment.findById(
        allotmentId
      ).session(session);

      if (!record) {
        throw new ApiError(
          404,
          'Cabin allotment not found',
          'NOT_FOUND'
        );
      }

      if (record.status !== ALLOTMENT_STATUS.APPROVED) {
        throw new ApiError(
          409,
          `Cannot activate allotment with status ${record.status}`,
          'INVALID_STATE'
        );
      }

      if (record.endDate <= new Date()) {
        throw new ApiError(
          409,
          'Expired allotment cannot be activated',
          'ALLOTMENT_EXPIRED'
        );
      }

      const linkedCabin = await Cabin.findOne({
        _id: record.cabinId,
        currentAllotment: record._id,
        status: CABIN_STATUS.RESERVED,
        active: true,
      }).session(session);

      if (!linkedCabin) {
        throw new ApiError(
          409,
          'Cabin is not reserved for this allotment',
          'CABIN_STATE_MISMATCH'
        );
      }

      const snapshot = record.toObject();

      record.status = ALLOTMENT_STATUS.ACTIVE;
      linkedCabin.status = CABIN_STATUS.OCCUPIED;

      await record.save({ session });
      await linkedCabin.save({ session });

      await RequestModel.updateMany(
        {
          linkedTransactionId: record._id,
          status: REQUEST_STATUS.APPROVED,
        },
        {
          $set: { status: REQUEST_STATUS.ACTIVE },
        },
        { session }
      );

      return {
        allotment: record,
        cabin: linkedCabin,
        oldValue: snapshot,
      };
    });

  await auditService.log({
    action: 'ACTIVATE_CABIN_ALLOTMENT',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CABIN',
    resourceType: 'CabinAllotment',
    resourceId: allotment._id,
    oldValue,
    newValue: allotment.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  await notificationService.notify({
    userId: allotment.founderId,
    type: NOTIFICATION_TYPE.GENERAL,
    title: 'Cabin Allotment Activated',
    message: 'Your cabin allotment is now active.',
    relatedResourceType: 'CabinAllotment',
    relatedResourceId: allotment._id,
  });

  return { allotment, cabin };
}

// ---------------------------------------------------------------------------
// VACATE / CLOSE ALLOTMENT
// ---------------------------------------------------------------------------

async function vacateCabin(
  allotmentId,
  adminUser,
  reason,
  meta = {}
) {
  const { allotment, cabin, oldValue } =
    await withTransaction(async (session) => {
      const record = await CabinAllotment.findById(
        allotmentId
      ).session(session);

      if (!record) {
        throw new ApiError(
          404,
          'Cabin allotment not found',
          'NOT_FOUND'
        );
      }

      if (
        ![
          ALLOTMENT_STATUS.APPROVED,
          ALLOTMENT_STATUS.ACTIVE,
        ].includes(record.status)
      ) {
        throw new ApiError(
          409,
          `Cannot vacate allotment with status ${record.status}`,
          'INVALID_STATE'
        );
      }

      const linkedCabin = await Cabin.findById(
        record.cabinId
      ).session(session);

      const snapshot = record.toObject();

      record.status =
        record.status === ALLOTMENT_STATUS.APPROVED
          ? ALLOTMENT_STATUS.CANCELLED
          : ALLOTMENT_STATUS.EXPIRED;

      record.endedAt = new Date();
      record.endedBy = adminUser._id;
      record.endReason =
        reason || 'Cabin manually vacated by Admin';

      await record.save({ session });

      if (
        linkedCabin &&
        String(linkedCabin.currentAllotment) ===
          String(record._id)
      ) {
        linkedCabin.status = CABIN_STATUS.FREE;
        linkedCabin.currentAllotment = null;
        linkedCabin.maintenanceReason = null;

        await linkedCabin.save({ session });
      }

      await RequestModel.updateMany(
        { linkedTransactionId: record._id },
        {
          $set: {
            status:
              record.status ===
              ALLOTMENT_STATUS.CANCELLED
                ? REQUEST_STATUS.CANCELLED
                : REQUEST_STATUS.COMPLETED,
          },
        },
        { session }
      );

      return {
        allotment: record,
        cabin: linkedCabin,
        oldValue: snapshot,
      };
    });

  await auditService.log({
    action: 'VACATE_CABIN',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CABIN',
    resourceType: 'CabinAllotment',
    resourceId: allotment._id,
    oldValue,
    newValue: allotment.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  await notificationService.notify({
    userId: allotment.founderId,
    type: NOTIFICATION_TYPE.GENERAL,
    title: 'Cabin Allotment Closed',
    message:
      'Your cabin allotment has been closed and the cabin has been released.',
    relatedResourceType: 'CabinAllotment',
    relatedResourceId: allotment._id,
  });

  // No-Dues integration after transaction commit.
  await recheckNoDuesForOccupants(allotment);

  return { allotment, cabin };
}

// ---------------------------------------------------------------------------
// HISTORY / READ
// ---------------------------------------------------------------------------

async function getCabinAllotmentHistory(
  cabinId,
  { status, page = 1, limit = 20 } = {}
) {
  const query = { cabinId };
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    CabinAllotment.find(query)
      .populate(
        'founderId',
        'name email role startupName'
      )
      .populate('members', 'name email role')
      .populate('approvedBy', 'name email')
      .populate('endedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    CabinAllotment.countDocuments(query),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getUserCabinHistory(
  userId,
  { status, page = 1, limit = 20 } = {}
) {
  const query = {
    $or: [{ founderId: userId }, { members: userId }],
  };

  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    CabinAllotment.find(query)
      .populate(
        'cabinId',
        'cabinNumber name type location'
      )
      .populate('founderId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    CabinAllotment.countDocuments(query),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getAllotmentById(allotmentId) {
  const allotment = await CabinAllotment.findById(
    allotmentId
  )
    .populate(
      'cabinId',
      'cabinNumber name type location facilities'
    )
    .populate(
      'founderId',
      'name email role startupName'
    )
    .populate('members', 'name email role')
    .populate('approvedBy', 'name email')
    .populate('endedBy', 'name email');

  if (!allotment) {
    throw new ApiError(
      404,
      'Cabin allotment not found',
      'NOT_FOUND'
    );
  }

  return allotment;
}

module.exports = {
  createCabin,
  updateCabin,
  deactivateCabin,
  listCabins,
  getCabinById,

  markCabinUnderMaintenance,
  clearCabinMaintenance,

  createDirectAllotment,
  activateAllotment,
  vacateCabin,

  getCabinAllotmentHistory,
  getUserCabinHistory,
  getAllotmentById,
};