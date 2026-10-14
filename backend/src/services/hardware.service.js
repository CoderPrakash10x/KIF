const { escapeRegex } = require('../utils/regex');
const {
  Hardware,
  HardwareTransaction,
  Request: RequestModel,
} = require('../models');
const {
  HARDWARE_TXN_STATUS,
  HARDWARE_CONDITION,
  REQUEST_STATUS,
  NOTIFICATION_TYPE,
} = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/db');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const noDuesService = require('./noDues.service');

// ---------------------------------------------------------------------------
// CATALOG CRUD
// ---------------------------------------------------------------------------

async function createHardware(payload, adminUser, meta = {}) {
  if (payload.availableQuantity === undefined) {
    payload.availableQuantity = payload.totalQuantity;
  }
  const hardware = await Hardware.create(payload);

  await auditService.log({
    action: 'CREATE_HARDWARE', performedBy: adminUser._id, role: adminUser.role,
    module: 'HARDWARE', resourceType: 'Hardware', resourceId: hardware._id,
    newValue: hardware.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return hardware;
}

async function updateHardware(hardwareId, updates, adminUser, meta = {}) {
  const hardware = await Hardware.findById(hardwareId);
  if (!hardware) throw new ApiError(404, 'Hardware item not found', 'NOT_FOUND');

  const oldValue = hardware.toObject();

  // Prevent direct manipulation of availableQuantity via generic update —
  // it must only ever change through issue/return/inspection flows below.
  const { availableQuantity: requestedAvailable, ...rest } = updates;
  const openTxns = await HardwareTransaction.countDocuments({
    hardwareId: hardware._id,
    status: { $in: [HARDWARE_TXN_STATUS.APPROVED, HARDWARE_TXN_STATUS.ISSUED, HARDWARE_TXN_STATUS.OVERDUE, HARDWARE_TXN_STATUS.RETURNED] },
  });
  if (rest.totalQuantity !== undefined) {
    const delta = Number(rest.totalQuantity) - hardware.totalQuantity;
    if (!Number.isInteger(Number(rest.totalQuantity)) || Number(rest.totalQuantity) < 0) throw new ApiError(400, 'totalQuantity must be a non-negative whole number', 'VALIDATION_ERROR');
    if (hardware.availableQuantity + delta < 0) throw new ApiError(409, 'Cannot reduce total below the units currently issued', 'INVALID_STATE');
    hardware.availableQuantity += delta; // keeps issued = total - available constant
  }
  // Marking an idle item damaged/under repair zeroes availability; only allowed when no unit is out.
  if (requestedAvailable !== undefined && openTxns === 0 && Number(requestedAvailable) >= 0 && Number(requestedAvailable) <= (rest.totalQuantity ?? hardware.totalQuantity)) {
    hardware.availableQuantity = Number(requestedAvailable);
  }
  updates = rest;

  Object.assign(hardware, updates);
  await hardware.save();

  await auditService.log({
    action: 'UPDATE_HARDWARE', performedBy: adminUser._id, role: adminUser.role,
    module: 'HARDWARE', resourceType: 'Hardware', resourceId: hardware._id,
    oldValue, newValue: hardware.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return hardware;
}

async function deactivateHardware(hardwareId, adminUser, meta = {}) {
  const hardware = await Hardware.findById(hardwareId);
  if (!hardware) throw new ApiError(404, 'Hardware item not found', 'NOT_FOUND');

  hardware.active = false;
  await hardware.save();

  await auditService.log({
    action: 'DEACTIVATE_HARDWARE', performedBy: adminUser._id, role: adminUser.role,
    module: 'HARDWARE', resourceType: 'Hardware', resourceId: hardware._id,
    newValue: { active: false }, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return hardware;
}

async function listHardware({ category, search, page = 1, limit = 20 }) {
  const query = { active: true };
  if (category) query.category = category;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ itemName: rx }, { assetTag: rx }, { category: rx }, { serialNumber: rx }];
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Hardware.find(query).sort({ itemName: 1 }).skip(skip).limit(limit),
    Hardware.countDocuments(query),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getHardwareById(hardwareId) {
  const hardware = await Hardware.findById(hardwareId);
  if (!hardware) throw new ApiError(404, 'Hardware item not found', 'NOT_FOUND');
  return hardware;
}

// ---------------------------------------------------------------------------
// CSV / EXCEL BULK IMPORT
// Expects `rows` already parsed into plain objects (parsing happens in the
// controller via csv-parse — keeps this service format-agnostic).
// ---------------------------------------------------------------------------

const REQUIRED_CSV_FIELDS = ['itemName', 'category', 'type', 'totalQuantity'];

async function bulkImportHardware(rows, adminUser, meta = {}) {
  if (Array.isArray(rows) && rows.length > 2000) throw new ApiError(400, 'Import is limited to 2000 rows per file', 'VALIDATION_ERROR');
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError(400, 'No rows found to import', 'VALIDATION_ERROR');
  }

  const results = { created: 0, updated: 0, skipped: [], errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 accounts for header row + 0-index

    const missing = REQUIRED_CSV_FIELDS.filter((f) => !row[f]);
    if (missing.length > 0) {
      results.errors.push(`Row ${rowNum}: missing required field(s) ${missing.join(', ')}`);
      continue;
    }

    const doc = {
      itemName: row.itemName.trim(),
      category: row.category.trim(),
      type: row.type.trim().toUpperCase(), // QUANTITY_BASED | ASSET_BASED
      assetTag: row.assetTag?.trim() || undefined,
      serialNumber: row.serialNumber?.trim() || undefined,
      totalQuantity: Number(row.totalQuantity),
      availableQuantity: row.availableQuantity !== undefined
        ? Number(row.availableQuantity)
        : Number(row.totalQuantity),
      condition: row.condition?.trim().toUpperCase() || HARDWARE_CONDITION.WORKING,
      location: row.location?.trim(),
      description: row.description?.trim(),
    };

    try {
      if (doc.assetTag) {
        const existing = await Hardware.findOne({ assetTag: doc.assetTag });
        if (existing) {
          // Re-imports update catalog data only. Stock counters belong to the issue/return workflow;
          // blindly resetting availableQuantity would silently 'return' every issued unit.
          const { availableQuantity, totalQuantity, ...catalog } = doc; // eslint-disable-line no-unused-vars
          const delta = Number.isFinite(totalQuantity) ? totalQuantity - existing.totalQuantity : 0;
          Object.assign(existing, catalog);
          if (delta !== 0) { existing.totalQuantity += delta; existing.availableQuantity = Math.max(0, existing.availableQuantity + delta); }
          await existing.save();
          results.updated++;
          continue;
        }
      }
      await Hardware.create(doc);
      results.created++;
    } catch (err) {
      results.errors.push(`Row ${rowNum} (${doc.itemName}): ${err.message}`);
    }
  }

  await auditService.log({
    action: 'BULK_IMPORT_HARDWARE', performedBy: adminUser._id, role: adminUser.role,
    module: 'HARDWARE', resourceType: 'Hardware',
    newValue: results, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return results;
}

// ---------------------------------------------------------------------------
// ISSUE — physical hand-over at the counter (APPROVED -> ISSUED)
// This is the operational step the Request Engine's hardware.handler.js
// stub deferred, per its own comment.
// ---------------------------------------------------------------------------
async function markIssued(transactionId, adminUser, { expectedReturnDate } = {}, meta = {}) {
  const { txn, oldValue } = await withTransaction(async (session) => {
    const transaction = await HardwareTransaction.findById(transactionId).session(session);
    if (!transaction) throw new ApiError(404, 'Hardware transaction not found', 'NOT_FOUND');
    if (transaction.status !== HARDWARE_TXN_STATUS.APPROVED) {
      throw new ApiError(409, `Cannot issue a transaction with status ${transaction.status}`, 'INVALID_STATE');
    }

    const snapshot = transaction.toObject();

    transaction.status = HARDWARE_TXN_STATUS.ISSUED;
    transaction.issuedBy = adminUser._id;
    transaction.issueDate = new Date();
    if (expectedReturnDate) transaction.expectedReturnDate = expectedReturnDate;

    await transaction.save({ session });

    // Sync the parent Request to ACTIVE so "My Requests" reflects real-world state
    if (transaction.requestId) {
      await RequestModel.findByIdAndUpdate(
        transaction.requestId,
        { status: REQUEST_STATUS.ACTIVE },
        { session }
      );
    }

    return { txn: transaction, oldValue: snapshot };
  });

  await auditService.log({
    action: 'ISSUE_HARDWARE', performedBy: adminUser._id, role: adminUser.role,
    module: 'HARDWARE', resourceType: 'HardwareTransaction', resourceId: txn._id,
    oldValue, newValue: txn.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  await notificationService.notify({
    userId: txn.requestedBy,
    type: NOTIFICATION_TYPE.GENERAL,
    title: 'Hardware Issued',
    message: `Your requested item has been issued. Expected return: ${txn.expectedReturnDate?.toDateString() || 'N/A'}.`,
    relatedResourceType: 'HardwareTransaction', relatedResourceId: txn._id,
  });

  return txn;
}

// ---------------------------------------------------------------------------
// INITIATE RETURN — user physically hands item back (ISSUED/OVERDUE -> RETURNED)
// Does NOT yet update stock — awaits admin inspection.
// ---------------------------------------------------------------------------
async function initiateReturn(transactionId, actorUser, meta = {}) {
  const { txn, oldValue } = await withTransaction(async (session) => {
    const transaction = await HardwareTransaction.findById(transactionId).session(session);
    if (!transaction) throw new ApiError(404, 'Hardware transaction not found', 'NOT_FOUND');

    const returnableStatuses = [HARDWARE_TXN_STATUS.ISSUED, HARDWARE_TXN_STATUS.OVERDUE];
    if (!returnableStatuses.includes(transaction.status)) {
      throw new ApiError(409, `Cannot return a transaction with status ${transaction.status}`, 'INVALID_STATE');
    }

    const isOwner = String(transaction.requestedBy) === String(actorUser._id);
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(actorUser.role);
    if (!isOwner && !isAdmin) throw new ApiError(403, 'Not authorized to return this item', 'FORBIDDEN');

    const snapshot = transaction.toObject();

    transaction.status = HARDWARE_TXN_STATUS.RETURNED;
    transaction.returnedTo = actorUser._id; // whoever received it back at the counter (usually admin)
    transaction.actualReturnDate = new Date();

    await transaction.save({ session });
    return { txn: transaction, oldValue: snapshot };
  });

  await auditService.log({
    action: 'INITIATE_HARDWARE_RETURN', performedBy: actorUser._id, role: actorUser.role,
    module: 'HARDWARE', resourceType: 'HardwareTransaction', resourceId: txn._id,
    oldValue, newValue: txn.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  await notificationService.notifyAdmins({
    type: NOTIFICATION_TYPE.GENERAL,
    title: 'Hardware Pending Inspection',
    message: `A returned item requires condition inspection before it's added back to stock.`,
    relatedResourceType: 'HardwareTransaction', relatedResourceId: txn._id,
  });

  return txn;
}

// ---------------------------------------------------------------------------
// INSPECT RETURN — admin confirms condition (RETURNED -> INSPECTION -> CLOSED)
// This is where stock actually gets updated, per Section 9's damage-logging rule.
// ---------------------------------------------------------------------------
async function inspectReturn(transactionId, adminUser, { condition, damageNotes }, meta = {}) {
  if (!Object.values(HARDWARE_CONDITION).includes(condition)) {
    throw new ApiError(400, 'Invalid condition value', 'VALIDATION_ERROR');
  }

  const { txn, hardware, oldValue } = await withTransaction(async (session) => {
    const transaction = await HardwareTransaction.findById(transactionId).session(session);
    if (!transaction) throw new ApiError(404, 'Hardware transaction not found', 'NOT_FOUND');
    if (transaction.status !== HARDWARE_TXN_STATUS.RETURNED) {
      throw new ApiError(409, `Cannot inspect a transaction with status ${transaction.status}`, 'INVALID_STATE');
    }

    const hw = await Hardware.findById(transaction.hardwareId).session(session);
    if (!hw) throw new ApiError(404, 'Hardware item not found', 'NOT_FOUND');

    const snapshot = transaction.toObject();

    transaction.status = HARDWARE_TXN_STATUS.INSPECTION;
    transaction.conditionOnReturn = condition;
    transaction.damageNotes = damageNotes;

    // ---- Stock resolution logic (Section 9: damage logging) ----
    if (condition === HARDWARE_CONDITION.WORKING) {
      hw.availableQuantity += transaction.quantity;
    } else if (condition === HARDWARE_CONDITION.DAMAGED || condition === HARDWARE_CONDITION.LOST) {
      // Permanently remove from circulation — do NOT add back to available.
      hw.totalQuantity = Math.max(0, hw.totalQuantity - transaction.quantity);
      if (hw.type === 'ASSET_BASED') {
        hw.condition = condition; // unique asset's catalog-level condition reflects reality
      }
    } else if (condition === HARDWARE_CONDITION.UNDER_REPAIR) {
      // Neither total nor available changes — item is in limbo until repair resolved.
      // TODO(Phase-2+): build `resolveRepair(hardwareId, outcome)` to release it
      // back into WORKING (increment availableQuantity) or DAMAGED (decrement total).
      if (hw.type === 'ASSET_BASED') {
        hw.condition = HARDWARE_CONDITION.UNDER_REPAIR;
      }
    }

    // Final transaction state — this txn's lifecycle is done.
    transaction.status = HARDWARE_TXN_STATUS.CLOSED;

    await hw.save({ session });
    await transaction.save({ session });

    if (transaction.requestId) {
      await RequestModel.findByIdAndUpdate(
        transaction.requestId,
        { status: REQUEST_STATUS.COMPLETED },
        { session }
      );
    }

    return { txn: transaction, hardware: hw, oldValue: snapshot };
  });

  await auditService.log({
    action: 'INSPECT_HARDWARE_RETURN', performedBy: adminUser._id, role: adminUser.role,
    module: 'HARDWARE', resourceType: 'HardwareTransaction', resourceId: txn._id,
    oldValue, newValue: txn.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  await notificationService.notify({
    userId: txn.requestedBy,
    type: NOTIFICATION_TYPE.GENERAL,
    title: 'Hardware Return Processed',
    message: `Your returned item was inspected — condition recorded as ${condition}.`,
    relatedResourceType: 'HardwareTransaction', relatedResourceId: txn._id,
  });

  // Integration point agreed in No-Dues deliverable — fire-and-forget, outside this transaction.
  await noDuesService.recheckIfExists(txn.requestedBy);

  return { transaction: txn, hardware };
}

// ---------------------------------------------------------------------------
// OVERDUE DETECTION — pure query/update logic used by jobs/overdueHardware.job.js
// (cron scheduling itself lives in the Jobs deliverable, not here)
// ---------------------------------------------------------------------------
async function getOverdueCandidates() {
  const now = new Date();
  return HardwareTransaction.find({
    status: HARDWARE_TXN_STATUS.ISSUED,
    expectedReturnDate: { $lt: now },
  }).populate('requestedBy', 'name email').populate('hardwareId', 'itemName assetTag');
}

async function markOverdueBatch(transactionIds) {
  await HardwareTransaction.updateMany(
    { _id: { $in: transactionIds }, status: HARDWARE_TXN_STATUS.ISSUED },
    { status: HARDWARE_TXN_STATUS.OVERDUE }
  );
}

// ---------------------------------------------------------------------------
// READ / HISTORY
// ---------------------------------------------------------------------------
async function getTransactionHistory(hardwareId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    HardwareTransaction.find({ hardwareId })
      .populate('requestedBy', 'name email role')
      .populate('issuedBy', 'name')
      .populate('returnedTo', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    HardwareTransaction.countDocuments({ hardwareId }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function listMyTransactions(userId, { status, page = 1, limit = 20 } = {}) {
  const query = { requestedBy: userId };
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    HardwareTransaction.find(query)
      .populate('hardwareId', 'itemName assetTag category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    HardwareTransaction.countDocuments(query),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function listPendingCounterActions({ page = 1, limit = 20 } = {}) {
  // Items admin needs to act on: APPROVED (needs issuing) or RETURNED (needs inspection)
  const query = { status: { $in: [HARDWARE_TXN_STATUS.APPROVED, HARDWARE_TXN_STATUS.RETURNED] } };

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    HardwareTransaction.find(query)
      .populate('requestedBy', 'name email')
      .populate('hardwareId', 'itemName assetTag')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit),
    HardwareTransaction.countDocuments(query),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// Admin issues stock directly to a user (walk-up counter issue). Creates an ISSUED transaction.
async function issueDirect(hardwareId, adminUser, { userId, quantity = 1, expectedReturnDate } = {}, meta = {}) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) throw new ApiError(400, 'Quantity must be a whole number of at least 1', 'VALIDATION_ERROR');
  if (!userId) throw new ApiError(400, 'userId is required', 'VALIDATION_ERROR');
  if (!expectedReturnDate || Number.isNaN(new Date(expectedReturnDate).getTime())) {
    throw new ApiError(400, 'A valid expectedReturnDate is required', 'VALIDATION_ERROR');
  }
  const { User } = require('../models');
  const txn = await withTransaction(async (session) => {
    const recipient = await User.findById(userId).session(session);
    if (!recipient || recipient.status !== 'ACTIVE') throw new ApiError(404, 'Recipient not found or not active', 'NOT_FOUND');
    const hardware = await Hardware.findOneAndUpdate(
      { _id: hardwareId, active: true, availableQuantity: { $gte: qty } },
      { $inc: { availableQuantity: -qty } },
      { new: true, session },
    );
    if (!hardware) throw new ApiError(409, 'Item not found or not enough units available', 'INSUFFICIENT_STOCK');
    const [created] = await HardwareTransaction.create([{
      hardwareId, requestedBy: userId, issuedBy: adminUser._id, quantity: qty,
      status: HARDWARE_TXN_STATUS.ISSUED, issueDate: new Date(),
      expectedReturnDate: new Date(expectedReturnDate), conditionOnIssue: hardware.condition,
    }], { session });
    return created;
  });
  await auditService.log({
    action: 'ISSUE_HARDWARE_DIRECT', performedBy: adminUser._id, role: adminUser.role,
    module: 'HARDWARE', resourceType: 'HardwareTransaction', resourceId: txn._id,
    newValue: txn.toObject(), ipAddress: meta.ip, userAgent: meta.userAgent,
  });
  await notificationService.notify({
    userId, type: NOTIFICATION_TYPE.GENERAL, title: 'Hardware Issued',
    message: `An item has been issued to you. Expected return: ${txn.expectedReturnDate.toDateString()}.`,
    relatedResourceType: 'HardwareTransaction', relatedResourceId: txn._id,
  });
  return txn;
}

module.exports = {
  issueDirect,
  createHardware,
  updateHardware,
  deactivateHardware,
  listHardware,
  getHardwareById,
  bulkImportHardware,
  markIssued,
  initiateReturn,
  inspectReturn,
  getOverdueCandidates,
  markOverdueBatch,
  getTransactionHistory,
  listMyTransactions,
  listPendingCounterActions,
};