const { parsePage, parseLimit } = require('../utils/pagination');
const requestService = require('../services/request.service');

exports.create = async (req, res, next) => {
  try {
    const request = await requestService.createRequest(req.body, {
      user: req.user, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ success: true, message: 'Request submitted successfully', data: request });
  } catch (err) { next(err); }
};

exports.approve = async (req, res, next) => {
  try {
    const request = await requestService.approveRequest(req.params.id, req.user, req.body.remarks, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Request approved successfully', data: request });
  } catch (err) { next(err); }
};

exports.reject = async (req, res, next) => {
  try {
    const request = await requestService.rejectRequest(req.params.id, req.user, req.body.remarks, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Request rejected', data: request });
  } catch (err) { next(err); }
};

exports.cancel = async (req, res, next) => {
  try {
    const request = await requestService.cancelRequest(req.params.id, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Request cancelled', data: request });
  } catch (err) { next(err); }
};

exports.list = async (req, res, next) => {
  try {
    const { status, type, search, page, limit } = req.query;
    const result = await requestService.listRequests({ status, type, search, page: parsePage(page), limit: parseLimit(limit, 20) });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.myRequests = async (req, res, next) => {
  try {
    const { status, type, search, page, limit } = req.query;
    const result = await requestService.listRequests({
      status, type, search, requestedBy: req.user._id, page: parsePage(page), limit: parseLimit(limit, 20),
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const request = await requestService.getRequestById(req.params.id);
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    const ownerId = String(request.requestedBy?._id || request.requestedBy);
    if (!isAdmin && ownerId !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this request', code: 'FORBIDDEN' });
    }
    res.json({ success: true, data: request });
  } catch (err) { next(err); }
};