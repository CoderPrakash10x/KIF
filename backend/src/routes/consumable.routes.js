const router = require('express').Router();

const controller = require(
  '../controllers/consumable.controller'
);

const { authenticate } = require(
  '../middleware/auth'
);

const { authorize } = require(
  '../middleware/role'
);

const { ROLES } = require(
  '../constants/enums'
);
const { validate } = require('../middleware/validation');
const { createConsumableSchema, updateConsumableSchema, stockMovementSchema, stockAdjustmentSchema } = require('../validators/consumable.validator');

const adminOnly = authorize(
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN
);


router.use(authenticate);

// Read access can be opened to all authenticated users.
router.get('/', controller.list);
router.get('/summary', require('../controllers/dashboard.controller').consumableSummary);
router.get('/:id/history', controller.history);
router.get('/:id', controller.getById);

// Operational changes restricted to Admin.
router.post('/', adminOnly, validate(createConsumableSchema), controller.create);

router.patch(
  '/:id',
  adminOnly,
  validate(updateConsumableSchema),
  controller.update
);

router.delete(
  '/:id',
  adminOnly,
  controller.deactivate
);

router.post(
  '/:id/stock-in',
  adminOnly,
  validate(stockMovementSchema),
  controller.stockIn
);

router.post(
  '/:id/stock-out',
  adminOnly,
  validate(stockMovementSchema),
  controller.stockOut
);

router.post(
  '/:id/adjust',
  adminOnly,
  validate(stockAdjustmentSchema),
  controller.adjust
);

module.exports = router;