const router = require('express').Router();
const controller = require('../controllers/request.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { validate } = require('../middleware/validation');
const { createRequestSchema, reviewRequestSchema } = require('../validators/request.validator');
const { ROLES } = require('../constants/enums');

const adminOnly = authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN);

router.use(authenticate);

router.post('/', validate(createRequestSchema), controller.create);
router.get('/my-requests', controller.myRequests);
router.get('/:id', controller.getById);
router.post('/:id/cancel', controller.cancel); // owner or admin, checked in service

// Admin unified inbox — filter by ?type=CABIN|HARDWARE|ROOM|EVENT for the tabbed view
router.get('/', adminOnly, controller.list);
router.post('/:id/approve', adminOnly, validate(reviewRequestSchema), controller.approve);
router.post('/:id/reject', adminOnly, validate(reviewRequestSchema), controller.reject);

module.exports = router;