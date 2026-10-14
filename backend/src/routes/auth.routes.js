const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { loginLimiter, forgotPasswordLimiter, registerLimiter } = require('../middleware/rateLimiter');
const {
  registerSchema, loginSchema, forgotPasswordSchema,
  resetPasswordSchema, changePasswordSchema,
} = require('../validators/auth.validator');

router.post('/register', registerLimiter, validate(registerSchema), controller.register);
router.post('/verify-email', controller.verifyEmail); // POST only: state changes must not be triggered by link prefetchers
router.post('/resend-verification', forgotPasswordLimiter, validate(forgotPasswordSchema), controller.resendVerification);

router.post('/login', loginLimiter, validate(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout); // public: identifies the session from the httpOnly cookie

router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword);

// Protected
router.use(authenticate);
router.get('/me', controller.me);
router.post('/logout-all', controller.logoutAllDevices);
router.post('/change-password', validate(changePasswordSchema), controller.changePassword);

module.exports = router;