const { parsePage, parseLimit } = require('../utils/pagination');
const service = require('../services/notification.service');

const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (err) { next(err); }
};

exports.list = wrap(async (req, res) => {
  const { read, type, page, limit } = req.query;
  const result = await service.listForUser(req.user._id, {
    read, type, page: parsePage(page), limit: parseLimit(limit, 20),
  });
  res.json({ success: true, ...result });
});

exports.unreadCount = wrap(async (req, res) => {
  res.json({ success: true, data: { unread: await service.unreadCount(req.user._id) } });
});

exports.markRead = wrap(async (req, res) => {
  const read = req.body?.read === undefined ? true : !!req.body.read;
  res.json({ success: true, data: await service.markRead(req.user._id, req.params.id, read) });
});

exports.markAllRead = wrap(async (req, res) => {
  res.json({ success: true, message: 'All notifications marked as read', data: await service.markAllRead(req.user._id) });
});
