const router = require('express').Router();
const controller = require('../controllers/noDues.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { ROLES } = require('../constants/enums');

router.use(authenticate);

router.post('/initiate', controller.initiate); // self or admin (body.userId)
router.get('/my-status', controller.myStatus);
router.post('/:id/recheck', controller.recheck);

router.get('/', authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN), controller.list);
router.post('/:id/review', authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN), controller.adminReview);

module.exports = router;