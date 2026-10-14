const { Consumable } = require('../models');
const {
  NOTIFICATION_TYPE,
} = require('../constants/enums');

const notificationService = require(
  '../services/notification.service'
);

async function checkLowStockConsumables() {
  const candidates = await Consumable.find({
    active: true,
    lowStockAlertSent: false,
    $expr: {
      $lte: [
        '$currentQuantity',
        '$lowStockThreshold',
      ],
    },
  }).select('_id');

  for (const candidate of candidates) {
    try {
      // Atomic alert claim prevents duplicate notifications.
      const item =
        await Consumable.findOneAndUpdate(
          {
            _id: candidate._id,
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

      if (!item) continue;

      try {
        await notificationService.notifyAdmins({
          type: NOTIFICATION_TYPE.LOW_STOCK,
          title: 'Low Stock Alert',
          message:
            `${item.itemName}: ` +
            `${item.currentQuantity} ${item.unit} remaining.`,
          relatedResourceType: 'Consumable',
          relatedResourceId: item._id,
        });
      } catch (notificationError) {
        // Release the claim so next cron execution can retry.
        await Consumable.updateOne(
          { _id: item._id },
          {
            $set: {
              lowStockAlertSent: false,
            },
          }
        );

        throw notificationError;
      }
    } catch (error) {
      console.error(
        `[CRON] Low-stock processing failed for ${candidate._id}:`,
        error
      );
    }
  }
}

module.exports = {
  checkLowStockConsumables,
};