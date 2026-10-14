const router = require('express').Router();
const controller = require('../controllers/room.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { ROLES } = require('../constants/enums');

const adminOnly = authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN);

router.use(authenticate);

// Catalog — read for all, write for admin
router.get('/', controller.listRooms);
router.get('/:id', controller.getRoomById);
const superAdminOnly = authorize(ROLES.SUPER_ADMIN);
router.post('/', superAdminOnly, controller.createRoom);
router.patch('/:id', adminOnly, controller.updateRoom);
router.delete('/:id', superAdminOnly, controller.deactivateRoom);
// Room-administrator assignment: Super Admin only (service re-checks). Granting it confers no global privileges.
router.put('/:id/admin', superAdminOnly, controller.assignAdmin);

// Availability / calendar
router.get('/:id/availability', controller.getAvailability);

// Bookings
router.get('/bookings/all', adminOnly, controller.listBookings);
router.get('/bookings/my', controller.myBookings);
router.get('/bookings/:id', controller.getBookingById);

router.post('/bookings/direct', adminOnly, controller.createDirectBooking);
router.post('/bookings/block-maintenance', adminOnly, controller.blockMaintenance);
router.post('/bookings/:id/unblock-maintenance', adminOnly, controller.unblockMaintenance);

router.post('/bookings/:id/activate', adminOnly, controller.activateBooking);
router.post('/bookings/:id/complete', adminOnly, controller.completeBooking);
router.post('/bookings/:id/cancel', controller.cancelBooking); // owner or admin, checked in service

// Equipment checklist
router.post('/bookings/:id/equipment/checkout', adminOnly, controller.checkOutEquipment);
router.post('/bookings/:id/equipment/checkin', adminOnly, controller.checkInEquipment);

module.exports = router;