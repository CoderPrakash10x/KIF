const router = require('express').Router();
const controller = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { ROLES } = require('../constants/enums');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN));
router.get('/', controller.list);
router.get('/meta', controller.meta);
router.get('/export', controller.export);
router.get('/:id', controller.getById);

module.exports = router;
