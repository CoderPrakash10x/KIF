const { escapeRegex } = require('../utils/regex');
const {
  Consumable,
  StockTransaction,
} = require('../models');

const {
  STOCK_TXN_TYPE,
  NOTIFICATION_TYPE,
} = require('../constants/enums');

const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/db');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function validatePositiveQuantity(quantity) {
  const parsedQuantity = Number(quantity);

  if (
    !Number.isFinite(parsedQuantity) ||
    parsedQuantity <= 0
  ) {
    throw new ApiError(
      400,
      'quantity must be a positive number',
      'INVALID_QUANTITY'
    );
  }

  return parsedQuantity;
}

async function sendLowStockNotificationIfNeeded(
  consumableId
) {
  try {
    // Atomic claim: only one process can transition alertSent false -> true.
    const item = await Consumable.findOneAndUpdate(
      {
        _id: consumableId,
        active: true,
        lowStockAlertSent: false,
        $expr: {
          $lte: [
            '$currentQuantity',
            '$lowStockThreshold',
          ],
        },
      },
      {
        $set: {
          lowStockAlertSent: true,
        },
      },
      {
        new: true,
      }
    );

    if (!item) return;

    await notificationService.notifyAdmins({
      type: NOTIFICATION_TYPE.LOW_STOCK,
      title: 'Low Stock Alert',
      message:
        `${item.itemName} is running low: ` +
        `${item.currentQuantity} ${item.unit} remaining. ` +
        `Threshold: ${item.lowStockThreshold} ${item.unit}.`,
      relatedResourceType: 'Consumable',
      relatedResourceId: item._id,
    });

    await auditService.logSystemAction({
  action: 'LOW_STOCK_ALERT_TRIGGERED',
  module: 'CONSUMABLES', resourceType: 'Consumable', resourceId: item._id,
  newValue: { currentQuantity: item.currentQuantity, lowStockThreshold: item.lowStockThreshold },
});
  } catch (error) {
    // Cron remains the fallback if immediate notification fails.
    console.error(
      'IMMEDIATE_LOW_STOCK_NOTIFICATION_FAILED:',
      error
    );
  }
}

// ---------------------------------------------------------------------------
// CATALOG CRUD
// ---------------------------------------------------------------------------

async function createConsumable(
  payload,
  adminUser,
  meta = {}
) {
  const initialQuantity = Number(
    payload.currentQuantity || 0
  );

  if (
    !Number.isFinite(initialQuantity) ||
    initialQuantity < 0
  ) {
    throw new ApiError(
      400,
      'Initial quantity cannot be negative',
      'INVALID_QUANTITY'
    );
  }

  const { consumable, transaction } =
    await withTransaction(async (session) => {
      const [created] = await Consumable.create(
        [
          {
            sku: payload.sku,
            itemName: payload.itemName,
            category: payload.category,
            unit: payload.unit,
            currentQuantity: initialQuantity,
            lowStockThreshold:
              payload.lowStockThreshold ?? 5,
            location: payload.location,
            description: payload.description,
            active: true,
            lowStockAlertSent: false,
          },
        ],
        { session }
      );

      let openingTransaction = null;

      if (initialQuantity > 0) {
        [openingTransaction] =
          await StockTransaction.create(
            [
              {
                consumableId: created._id,
                type: STOCK_TXN_TYPE.STOCK_IN,
                quantity: initialQuantity,
                previousQuantity: 0,
                newQuantity: initialQuantity,
                performedBy: adminUser._id,
                reason:
                  payload.openingReason ||
                  'Opening stock',
              },
            ],
            { session }
          );
      }

      return {
        consumable: created,
        transaction: openingTransaction,
      };
    });

  await auditService.log({
    action: 'CREATE_CONSUMABLE',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CONSUMABLES',
    resourceType: 'Consumable',
    resourceId: consumable._id,
    newValue: consumable.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  await sendLowStockNotificationIfNeeded(
    consumable._id
  );

  return { consumable, transaction };
}

async function updateConsumable(
  consumableId,
  updates,
  adminUser,
  meta = {}
) {
  const consumable = await Consumable.findById(
    consumableId
  );

  if (!consumable) {
    throw new ApiError(
      404,
      'Consumable not found',
      'NOT_FOUND'
    );
  }

  const oldValue = consumable.toObject();

  // Quantity must only change through a StockTransaction.
  delete updates.currentQuantity;
  delete updates.lowStockAlertSent;
  delete updates.active;

  Object.assign(consumable, updates);

  // If updated threshold is now above current stock, allow alert.
  if (
    updates.lowStockThreshold !== undefined &&
    consumable.currentQuantity >
      consumable.lowStockThreshold
  ) {
    consumable.lowStockAlertSent = false;
  }

  await consumable.save();

  await auditService.log({
    action: 'UPDATE_CONSUMABLE',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CONSUMABLES',
    resourceType: 'Consumable',
    resourceId: consumable._id,
    oldValue,
    newValue: consumable.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  await sendLowStockNotificationIfNeeded(
    consumable._id
  );

  return consumable;
}

async function deactivateConsumable(
  consumableId,
  adminUser,
  meta = {}
) {
  const consumable = await Consumable.findById(
    consumableId
  );

  if (!consumable) {
    throw new ApiError(
      404,
      'Consumable not found',
      'NOT_FOUND'
    );
  }

  const oldValue = consumable.toObject();

  consumable.active = false;
  await consumable.save();

  await auditService.log({
    action: 'DEACTIVATE_CONSUMABLE',
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CONSUMABLES',
    resourceType: 'Consumable',
    resourceId: consumable._id,
    oldValue,
    newValue: consumable.toObject(),
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return consumable;
}

async function listConsumables({
  category,
  search,
  lowStock,
  active = true,
  page = 1,
  limit = 20,
} = {}) {
  const query = { active };

  if (category) query.category = category;

  if (search) {
    query.$or = [
      {
        itemName: {
          $regex: escapeRegex(search),
          $options: 'i',
        },
      },
      {
        sku: {
          $regex: escapeRegex(search),
          $options: 'i',
        },
      },
      {
        description: {
          $regex: escapeRegex(search),
          $options: 'i',
        },
      },
    ];
  }

  if (lowStock === true || lowStock === 'true') {
    query.$expr = {
      $lte: [
        '$currentQuantity',
        '$lowStockThreshold',
      ],
    };
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Consumable.find(query)
      .sort({ itemName: 1 })
      .skip(skip)
      .limit(limit),

    Consumable.countDocuments(query),
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

async function getConsumableById(consumableId) {
  const consumable = await Consumable.findById(
    consumableId
  );

  if (!consumable) {
    throw new ApiError(
      404,
      'Consumable not found',
      'NOT_FOUND'
    );
  }

  return consumable;
}

// ---------------------------------------------------------------------------
// STOCK TRANSACTION ENGINE
// ---------------------------------------------------------------------------

async function processStockTransaction(
  consumableId,
  payload,
  adminUser,
  meta = {}
) {
  const { type, reason } = payload;

  if (!Object.values(STOCK_TXN_TYPE).includes(type)) {
    throw new ApiError(
      400,
      'Invalid stock transaction type',
      'VALIDATION_ERROR'
    );
  }

  const result = await withTransaction(
    async (session) => {
      const item = await Consumable.findOne({
        _id: consumableId,
        active: true,
      }).session(session);

      if (!item) {
        throw new ApiError(
          404,
          'Active consumable not found',
          'NOT_FOUND'
        );
      }

      const previousQuantity =
        item.currentQuantity;

      let transactionQuantity;
      let newQuantity;

      if (type === STOCK_TXN_TYPE.STOCK_IN) {
        transactionQuantity =
          validatePositiveQuantity(
            payload.quantity
          );

        newQuantity =
          previousQuantity + transactionQuantity;
      } else if (
        type === STOCK_TXN_TYPE.STOCK_OUT
      ) {
        transactionQuantity =
          validatePositiveQuantity(
            payload.quantity
          );

        if (
          previousQuantity <
          transactionQuantity
        ) {
          throw new ApiError(
            409,
            `Insufficient stock. Available: ${previousQuantity} ${item.unit}`,
            'INSUFFICIENT_STOCK'
          );
        }

        newQuantity =
          previousQuantity - transactionQuantity;
      } else {
        const adjustedQuantity = Number(
          payload.newQuantity
        );

        if (
          !Number.isFinite(adjustedQuantity) ||
          adjustedQuantity < 0
        ) {
          throw new ApiError(
            400,
            'newQuantity must be zero or greater',
            'INVALID_QUANTITY'
          );
        }

        newQuantity = adjustedQuantity;
        transactionQuantity = Math.abs(
          newQuantity - previousQuantity
        );

        if (newQuantity === previousQuantity) {
          throw new ApiError(
            400,
            'Adjustment does not change current stock',
            'NO_STOCK_CHANGE'
          );
        }
      }

      item.currentQuantity = newQuantity;

      // Reset alert state when stock is restored above threshold.
      // If still low, false allows immediate notification after commit.
      item.lowStockAlertSent =
        newQuantity >
        item.lowStockThreshold
          ? false
          : false;

      await item.save({ session });

      const [transaction] =
        await StockTransaction.create(
          [
            {
              consumableId: item._id,
              type,
              quantity: transactionQuantity,
              previousQuantity,
              newQuantity,
              performedBy: adminUser._id,
              reason:
                reason ||
                `${type} inventory transaction`,
            },
          ],
          { session }
        );

      return {
        consumable: item,
        transaction,
      };
    }
  );

  await auditService.log({
    action: `CONSUMABLE_${type}`,
    performedBy: adminUser._id,
    role: adminUser.role,
    module: 'CONSUMABLES',
    resourceType: 'StockTransaction',
    resourceId: result.transaction._id,
    oldValue: {
      currentQuantity:
        result.transaction.previousQuantity,
    },
    newValue: {
      currentQuantity:
        result.transaction.newQuantity,
    },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  await sendLowStockNotificationIfNeeded(
    result.consumable._id
  );

  return result;
}

// Convenience wrappers
async function addStock(
  consumableId,
  payload,
  adminUser,
  meta
) {
  return processStockTransaction(
    consumableId,
    {
      ...payload,
      type: STOCK_TXN_TYPE.STOCK_IN,
    },
    adminUser,
    meta
  );
}

async function consumeStock(
  consumableId,
  payload,
  adminUser,
  meta
) {
  return processStockTransaction(
    consumableId,
    {
      ...payload,
      type: STOCK_TXN_TYPE.STOCK_OUT,
    },
    adminUser,
    meta
  );
}

async function adjustStock(
  consumableId,
  payload,
  adminUser,
  meta
) {
  return processStockTransaction(
    consumableId,
    {
      ...payload,
      type: STOCK_TXN_TYPE.ADJUSTMENT,
    },
    adminUser,
    meta
  );
}

// ---------------------------------------------------------------------------
// STOCK HISTORY
// ---------------------------------------------------------------------------

async function getStockHistory(
  consumableId,
  { type, fromDate, toDate, page = 1, limit = 20 } = {}
) {
  const query = { consumableId };

  if (type) query.type = type;

  if (fromDate || toDate) {
    query.createdAt = {};

    if (fromDate) {
      query.createdAt.$gte = new Date(fromDate);
    }

    if (toDate) {
      query.createdAt.$lte = new Date(toDate);
    }
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    StockTransaction.find(query)
      .populate(
        'performedBy',
        'name email role'
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    StockTransaction.countDocuments(query),
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

module.exports = {
  createConsumable,
  updateConsumable,
  deactivateConsumable,
  listConsumables,
  getConsumableById,

  processStockTransaction,
  addStock,
  consumeStock,
  adjustStock,

  getStockHistory,
};