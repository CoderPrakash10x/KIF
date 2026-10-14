const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { loginLimiter, forgotPasswordLimiter, registerLimiter, otpVerifyLimiter, otpResendLimiter } = require('../middleware/rateLimiter');
const { registrationSchema, emailOnlySchema, verifyOtpSchema } = require('../utils/registrationRules');
const {
  loginSchema, forgotPasswordSchema,
  resetPasswordSchema, changePasswordSchema,
} = require('../validators/auth.validator');

router.get('/registration-options', controller.registrationOptions);
router.post('/register', registerLimiter, validate(registrationSchema), controller.register);
router.post('/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), controller.verifyOtp);
router.post('/resend-otp', otpResendLimiter, validate(emailOnlySchema), controller.resendOtp);
router.get('/verify-email', controller.verifyEmail);
router.post('/verify-email', controller.verifyEmail);

router.post('/login', loginLimiter, validate(loginSchema), controller.login);
router.post('/refresh', controller.refresh);

router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword);

// Protected
router.use(authenticate);
router.get('/me', controller.me);
router.post('/logout', controller.logout);
router.post('/logout-all', controller.logoutAllDevices);
router.post('/change-password', validate(changePasswordSchema), controller.changePassword);

module.exports = router;