const { parsePage, parseLimit } = require('../utils/pagination');
const service = require('../services/auditQuery.service');
const auditService = require('../services/audit.service');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const filtersOf = (q) => ({
  module: q.module, action: q.action, actorId: /^[a-f\d]{24}$/i.test(q.actorId || '') ? q.actorId : undefined,
  search: q.search, from: /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : undefined,
  to: /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : undefined,
});

// Audit data is strictly read-only here: there is intentionally no update/delete handler.
exports.list = wrap(async (req, res) => {
  const result = await service.list(req.user, filtersOf(req.query), {
    page: parsePage(req.query.page), limit: parseLimit(req.query.limit, 20),
  });
  res.json({ success: true, ...result });
});
exports.meta = wrap(async (req, res) => res.json({ success: true, data: await service.meta(req.user) }));
exports.getById = wrap(async (req, res) => res.json({ success: true, data: await service.getById(req.user, req.params.id) }));
exports.export = wrap(async (req, res) => {
  const csv = await service.exportCsv(req.user, filtersOf(req.query));
  await auditService.log({
    action: 'EXPORT_AUDIT_LOG', performedBy: req.user._id, role: req.user.role, module: 'AUDIT',
    ipAddress: req.ip, userAgent: req.headers['user-agent'],
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kif-audit-log.csv"');
  res.send(csv);
});
