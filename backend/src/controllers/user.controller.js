const userService = require('../services/user.service');

// ---- Self-service ----
exports.getMyProfile = async (req, res, next) => {
  try {
    const user = await userService.getProfile(req.user._id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

exports.updateMyProfile = async (req, res, next) => {
  try {
    const user = await userService.updateProfile(req.user._id, req.body);
    res.json({ success: true, message: 'Profile updated', data: user });
  } catch (err) { next(err); }
};

exports.updateMyPhoto = async (req, res, next) => {
  try {
    if (!req.file) throw { statusCode: 400, message: 'Photo file is required', code: 'VALIDATION_ERROR' };
    const user = await userService.updateProfilePhoto(req.user._id, req.file.buffer);
    res.json({ success: true, message: 'Profile photo updated', data: user });
  } catch (err) { next(err); }
};

// ---- Admin management ----
exports.list = async (req, res, next) => {
  try {
    const { role, status, search, approvalStatus, emailVerified, page, limit } = req.query;
    const result = await userService.listUsers({
      role, status, search, approvalStatus, emailVerified, page: Number(page) || 1, limit: Math.min(Number(limit) || 20, 100),
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

exports.assignRole = async (req, res, next) => {
  try {
    const user = await userService.assignRole(req.body.userId, req.body.role, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Role updated successfully', data: user });
  } catch (err) { next(err); }
};

const reviewHandler = (decision) => async (req, res, next) => {
  try {
    const user = await userService.reviewRegistration(req.params.id, decision, req.user, { role: req.body?.role, remarks: req.body?.remarks }, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: decision === 'APPROVE' ? 'Registration approved' : 'Registration rejected', data: user });
  } catch (err) { next(err); }
};
exports.approveRegistration = reviewHandler('APPROVE');
exports.rejectRegistration = reviewHandler('REJECT');
exports.setStatus = async (req, res, next) => {
  try {
    const user = await userService.setUserStatus(req.params.id, req.body.status, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'User status updated', data: user });
  } catch (err) { next(err); }
};