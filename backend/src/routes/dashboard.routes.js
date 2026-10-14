const router = require('express').Router();
const controller = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/summary', controller.summary); // shape depends on the caller's role (computed server-side)

module.exports = router;
