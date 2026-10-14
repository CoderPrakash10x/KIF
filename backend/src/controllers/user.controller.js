const ApiError = require('../utils/ApiError');
const { parsePage, parseLimit } = require('../utils/pagination');
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
    if (!req.file) throw new ApiError(400, 'Photo file is required', 'VALIDATION_ERROR');
    const user = await userService.updateProfilePhoto(req.user._id, req.file.buffer);
    res.json({ success: true, message: 'Profile photo updated', data: user });
  } catch (err) { next(err); }
};

// ---- Admin management ----
exports.list = async (req, res, next) => {
  try {
    const { role, status, search, page, limit } = req.query;
    const result = await userService.listUsers({
      role, status, search, page: parsePage(page), limit: parseLimit(limit, 20),
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

exports.setStatus = async (req, res, next) => {
  try {
    const user = await userService.setUserStatus(req.params.id, req.body.status, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'User status updated', data: user });
  } catch (err) { next(err); }
};