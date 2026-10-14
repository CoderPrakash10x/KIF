const router = require('express').Router();
const controller = require('../controllers/event.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { ROLES } = require('../constants/enums');

const adminOnly = authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN);

router.use(authenticate);

// Catalog — read for all, write for admin
router.get('/', controller.list);
router.get('/my-registrations', controller.myRegistrations);
router.get('/:id', controller.getById);

router.post('/', adminOnly, controller.create);
router.post('/propose', authorize(ROLES.FOUNDER, ROLES.INTERN), controller.propose);
router.post('/:id/publish', adminOnly, controller.publish);
router.patch('/:id', adminOnly, controller.update);
router.post('/:id/cancel', adminOnly, controller.cancel);
router.post('/:id/complete', adminOnly, controller.markCompleted);

// Registration / RSVP (any authenticated user)
router.post('/:id/register', controller.register);
router.post('/:id/cancel-registration', controller.cancelMyRegistration);
router.get('/:id/registrations', adminOnly, controller.listRegistrations);

// Attendance (admin only, manual — no QR)
router.post('/registrations/:registrationId/attendance', adminOnly, controller.markAttendance);
router.post('/attendance/bulk', adminOnly, controller.bulkMarkAttendance);

// Certificates (admin-triggered bulk action)
router.post('/:id/generate-certificates', adminOnly, controller.generateCertificates);

module.exports = router;