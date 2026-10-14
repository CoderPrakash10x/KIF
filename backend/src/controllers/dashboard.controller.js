const dashboard = require('../services/dashboard.service');
const analytics = require('../services/analytics.service');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

exports.summary = wrap(async (req, res) => res.json({ success: true, data: await dashboard.getSummary(req.user) }));
exports.analytics = wrap(async (req, res) => res.json({ success: true, data: await analytics.overview(req.query.period) }));
exports.hardwareSummary = wrap(async (req, res) => res.json({ success: true, data: await dashboard.hardwareSummary() }));
exports.consumableSummary = wrap(async (req, res) => res.json({ success: true, data: await dashboard.consumableSummary() }));
