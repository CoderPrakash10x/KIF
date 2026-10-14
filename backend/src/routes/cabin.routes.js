const router = require('express').Router();

const controller = require('../controllers/cabin.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { ROLES } = require('../constants/enums');
const { validate } = require('../middleware/validation');
const { createCabinSchema, updateCabinSchema, maintenanceSchema, directAllotmentSchema, vacateSchema } = require('../validators/cabin.validator');

const adminOnly = authorize(
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN
);

router.use(authenticate);

// User-specific routes
router.get('/my-history', controller.getMyHistory);

// Allotment routes
router.post('/allotments/upload-letter', adminOnly, require('../middleware/upload').upload.single('letter'), controller.uploadLetter);
router.post(
  '/allotments/direct',
  adminOnly,
  validate(directAllotmentSchema),
  controller.createDirectAllotment
);

router.get(
  '/allotments/:id',
  adminOnly,
  controller.getAllotmentById
);

router.post(
  '/allotments/:id/activate',
  adminOnly,
  controller.activateAllotment
);

router.post(
  '/allotments/:id/vacate',
  adminOnly,
  validate(vacateSchema),
  controller.vacate
);

// Cabin catalog
router.get('/', controller.list);
router.post('/', adminOnly, validate(createCabinSchema), controller.create);

router.get(
  '/:id/history',
  adminOnly,
  controller.getCabinHistory
);

router.post(
  '/:id/maintenance',
  adminOnly,
  validate(maintenanceSchema),
  controller.markMaintenance
);

router.post(
  '/:id/maintenance/clear',
  adminOnly,
  controller.clearMaintenance
);

router.get('/:id', controller.getById);
router.patch('/:id', adminOnly, validate(updateCabinSchema), controller.update);
router.delete(
  '/:id',
  adminOnly,
  controller.deactivate
);

module.exports = router;