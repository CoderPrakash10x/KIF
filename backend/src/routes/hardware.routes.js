const router = require('express').Router();
const controller = require('../controllers/hardware.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { upload } = require('../middleware/upload'); // multer memoryStorage instance
const { ROLES } = require('../constants/enums');

const adminOnly = authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN);

router.use(authenticate);

// Catalog — public read for all authenticated users, write restricted to admin
router.get('/', controller.list);
router.get('/my-transactions', controller.myTransactions);
router.get('/pending-actions', adminOnly, controller.pendingCounterActions);
router.get('/summary', require('../controllers/dashboard.controller').hardwareSummary);
router.get('/:id', controller.getById);
router.get('/:id/history', adminOnly, controller.transactionHistory);
router.post('/:id/issue-direct', adminOnly, controller.issueDirect);

router.post('/', adminOnly, controller.create);
router.patch('/:id', adminOnly, controller.update);
router.delete('/:id', adminOnly, controller.deactivate);

router.post('/bulk-import', adminOnly, upload.single('file'), controller.bulkImport);

// Issue / Return operational workflow — transactionId in :id
router.post('/transactions/:id/issue', adminOnly, controller.markIssued);
router.post('/transactions/:id/return', controller.initiateReturn); // owner or admin (checked in service)
router.post('/transactions/:id/inspect', adminOnly, controller.inspectReturn);

module.exports = router;