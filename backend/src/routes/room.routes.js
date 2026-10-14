const router = require('express').Router();
const controller = require('../controllers/room.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { ROLES } = require('../constants/enums');
const { validate } = require('../middleware/validation');
const { directBookingSchema, blockSchema } = require('../validators/room.validator');

const adminOnly = authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN);

router.use(authenticate);

// Catalog — read for all, write for admin
router.get('/', controller.listRooms);
router.get('/:id', controller.getRoomById);
router.post('/', adminOnly, controller.createRoom);
router.patch('/:id', adminOnly, controller.updateRoom);
router.delete('/:id', adminOnly, controller.deactivateRoom);

// Availability / calendar
router.get('/:id/availability', controller.getAvailability);

// Bookings
router.get('/bookings/all', adminOnly, controller.listBookings);
router.get('/bookings/my', controller.myBookings);
router.get('/bookings/:id', controller.getBookingById);

router.post('/bookings/direct', adminOnly, validate(directBookingSchema), controller.createDirectBooking);
router.post('/bookings/block-maintenance', adminOnly, validate(blockSchema), controller.blockMaintenance);
router.post('/bookings/:id/unblock-maintenance', adminOnly, controller.unblockMaintenance);

router.post('/bookings/:id/activate', adminOnly, controller.activateBooking);
router.post('/bookings/:id/complete', adminOnly, controller.completeBooking);
router.post('/bookings/:id/cancel', controller.cancelBooking); // owner or admin, checked in service

// Equipment checklist
router.post('/bookings/:id/equipment/checkout', adminOnly, controller.checkOutEquipment);
router.post('/bookings/:id/equipment/checkin', adminOnly, controller.checkInEquipment);

module.exports = router;