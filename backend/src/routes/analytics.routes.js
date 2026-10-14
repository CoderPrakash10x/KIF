const router = require('express').Router();
const controller = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { ROLES } = require('../constants/enums');

router.use(authenticate, authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN));
router.get('/overview', controller.analytics);

module.exports = router;
