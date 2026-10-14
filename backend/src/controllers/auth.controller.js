const authService = require('../services/auth.service');
const { setRefreshTokenCookie, clearRefreshTokenCookie } = require('../utils/cookies');

exports.register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, message: result.message, data: null });
  } catch (err) { next(err); }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const result = await authService.verifyEmail(req.body?.token ?? req.query?.token);
    res.json({ success: true, message: result.message });
  } catch (err) { next(err); }
};

exports.resendVerification = async (req, res, next) => {
  try {
    const result = await authService.resendVerification(req.body.email);
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
    await authService.logout(rawRefreshToken);
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
      req.user._id, req.body.currentPassword, req.body.newPassword,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
    setRefreshTokenCookie(res, result.refreshToken);
    res.json({ success: true, message: result.message });
  } catch (err) { next(err); }
};

exports.me = async (req, res) => {
  res.json({ success: true, data: req.user });
};