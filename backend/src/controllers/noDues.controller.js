const { parsePage, parseLimit } = require('../utils/pagination');
const noDuesService = require('../services/noDues.service');

exports.initiate = async (req, res, next) => {
  try {
    // Self-initiation: targetUserId = req.user._id
    // Admin-initiation on behalf of an exiting user: targetUserId = req.body.userId
    const isAdminInitiated = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) && req.body.userId;
    const targetUserId = isAdminInitiated ? req.body.userId : req.user._id;
    const initiatedBy = isAdminInitiated ? 'ADMIN' : 'SELF';

    const noDues = await noDuesService.initiateNoDuesRequest(targetUserId, initiatedBy, {
      user: req.user, ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'No-Dues request initiated', data: noDues });
  } catch (err) { next(err); }
};

exports.recheck = async (req, res, next) => {
  try {
    const noDues = await noDuesService.recheckNoDues(req.params.id, {
      user: req.user, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'No-Dues status re-checked', data: noDues });
  } catch (err) { next(err); }
};

exports.adminReview = async (req, res, next) => {
  try {
    const { decision, remarks } = req.body; // decision: 'APPROVE' | 'REJECT'
    const noDues = await noDuesService.adminReviewNoDues(req.params.id, req.user, decision, remarks, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: decision === 'APPROVE' ? 'No-Dues request approved' : 'No-Dues request sent back', data: noDues });
  } catch (err) { next(err); }
};

exports.myStatus = async (req, res, next) => {
  try {
    const noDues = await noDuesService.getNoDuesStatus(req.user._id);
    res.json({ success: true, data: noDues });
  } catch (err) { next(err); }
};

exports.list = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await noDuesService.listNoDuesRequests({ status, page: parsePage(page), limit: parseLimit(limit, 20) });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};