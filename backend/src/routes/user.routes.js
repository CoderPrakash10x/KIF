const router = require('express').Router();
const controller = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { validate } = require('../middleware/validation');
const { upload } = require('../middleware/upload');
const { updateProfileSchema, assignRoleSchema } = require('../validators/auth.validator');
const { ROLES } = require('../constants/enums');

const adminOnly = authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN);

router.use(authenticate);

// Self-service
router.get('/me/profile', controller.getMyProfile);
router.patch('/me/profile', validate(updateProfileSchema), controller.updateMyProfile);
router.post('/me/photo', upload.single('photo'), controller.updateMyPhoto);

// Admin management
router.get('/', adminOnly, controller.list);
router.get('/:id', adminOnly, controller.getById);
router.post('/assign-role', adminOnly, validate(assignRoleSchema), controller.assignRole);
router.patch('/:id/status', adminOnly, controller.setStatus);
// Registration approval is a Super Admin decision (the service re-checks the role).
router.post('/:id/approve', authorize(ROLES.SUPER_ADMIN), controller.approveRegistration);
router.post('/:id/reject', authorize(ROLES.SUPER_ADMIN), controller.rejectRegistration);

module.exports = router;