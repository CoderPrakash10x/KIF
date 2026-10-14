const router = require('express').Router();
const controller = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');

// Every user only ever sees their own notifications (userId is taken from the token, never the URL).
router.use(authenticate);
router.get('/', controller.list);
router.get('/unread-count', controller.unreadCount);
router.post('/read-all', controller.markAllRead);
router.post('/:id/read', controller.markRead);

module.exports = router;
