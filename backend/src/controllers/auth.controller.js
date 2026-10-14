const authService = require('../services/auth.service');
const { setRefreshTokenCookie, clearRefreshTokenCookie } = require('../utils/cookies');

exports.register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(202).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    next(err);
  }
};
exports.verifyOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyOtp(req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: result.message, data: result.data });
  } catch (err) { next(err); }
};
exports.resendOtp = async (req, res, next) => {
  try {
    const result = await authService.resendOtp(req.body);
    res.status(202).json({ success: true, message: result.message, data: result.data });
  } catch (err) { next(err); }
};
exports.registrationOptions = (req, res) => {
  const { COLLEGES } = require('../constants/colleges');
  const { SELF_SIGNUP_ROLES } = require('../utils/registrationRules');
  res.json({ success: true, data: { colleges: COLLEGES, roles: SELF_SIGNUP_ROLES } });
};
exports.verifyEmail = async (req, res, next) => {
  try {
    const result = await authService.verifyEmail(req.body.token || req.query.token);
    res.json({ success: true, message: result.message });
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { user, accessToken, refreshToken } = await authService.login(req.body, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    setRefreshTokenCookie(res, refreshToken);

    res.json({
      success: true,
      message: 'Login successful',
      data: { user, accessToken },
    });
  } catch (err) { next(err); }
};

exports.refresh = async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken;
    const { user, accessToken, refreshToken } = await authService.refreshAccessToken(rawRefreshToken, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    setRefreshTokenCookie(res, refreshToken);

    res.json({ success: true, message: 'Token refreshed', data: { user, accessToken } });
  } catch (err) {
    clearRefreshTokenCookie(res);
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken;
    await authService.logout(req.user._id, rawRefreshToken);
    clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) { next(err); }
};

exports.logoutAllDevices = async (req, res, next) => {
  try {
    await authService.logoutAllDevices(req.user._id, req.user);
    clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Logged out from all devices' });
  } catch (err) { next(err); }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    res.json({ success: true, message: result.message });
  } catch (err) { next(err); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const result = await authService.resetPassword(req.body.token, req.body.newPassword);
    res.json({ success: true, message: result.message });
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const result = await authService.changePassword(
      req.user._id, req.body.currentPassword, req.body.newPassword
    );
    res.json({ success: true, message: result.message });
  } catch (err) { next(err); }
};

exports.me = async (req, res) => {
  res.json({ success: true, data: req.user });
};