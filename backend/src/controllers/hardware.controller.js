const { parse } = require('csv-parse/sync');
const hardwareService = require('../services/hardware.service');

// ---- Catalog ----
exports.create = async (req, res, next) => {
  try {
    const hardware = await hardwareService.createHardware(req.body, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ success: true, message: 'Hardware item created', data: hardware });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const hardware = await hardwareService.updateHardware(req.params.id, req.body, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Hardware item updated', data: hardware });
  } catch (err) { next(err); }
};

exports.deactivate = async (req, res, next) => {
  try {
    const hardware = await hardwareService.deactivateHardware(req.params.id, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Hardware item deactivated', data: hardware });
  } catch (err) { next(err); }
};

exports.list = async (req, res, next) => {
  try {
    const { category, search, page, limit } = req.query;
    const result = await hardwareService.listHardware({
      category, search, page: Number(page) || 1, limit: Number(limit) || 20,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const hardware = await hardwareService.getHardwareById(req.params.id);
    res.json({ success: true, data: hardware });
  } catch (err) { next(err); }
};

// ---- CSV Bulk Import ----
// Assumes `upload.js` middleware (multer, memoryStorage) populates req.file.buffer
exports.bulkImport = async (req, res, next) => {
  try {
    if (!req.file) throw { statusCode: 400, message: 'CSV file is required', code: 'VALIDATION_ERROR' };

    const rows = parse(req.file.buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const result = await hardwareService.bulkImportHardware(rows, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Bulk import processed', data: result });
  } catch (err) { next(err); }
};

exports.issueDirect = async (req, res, next) => {
  try {
    const txn = await hardwareService.issueDirect(req.params.id, req.user, req.body, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ success: true, message: 'Hardware issued successfully', data: txn });
  } catch (err) { next(err); }
};

// ---- Issue / Return Workflow ----
exports.markIssued = async (req, res, next) => {
  try {
    const txn = await hardwareService.markIssued(req.params.id, req.user, req.body, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Hardware issued successfully', data: txn });
  } catch (err) { next(err); }
};

exports.initiateReturn = async (req, res, next) => {
  try {
    const txn = await hardwareService.initiateReturn(req.params.id, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Return initiated, pending inspection', data: txn });
  } catch (err) { next(err); }
};

exports.inspectReturn = async (req, res, next) => {
  try {
    const result = await hardwareService.inspectReturn(req.params.id, req.user, req.body, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Return inspected and processed', data: result });
  } catch (err) { next(err); }
};

// ---- History / Dashboards ----
exports.transactionHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await hardwareService.getTransactionHistory(req.params.id, {
      page: Number(page) || 1, limit: Number(limit) || 20,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.myTransactions = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await hardwareService.listMyTransactions(req.user._id, {
      status, page: Number(page) || 1, limit: Number(limit) || 20,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.pendingCounterActions = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await hardwareService.listPendingCounterActions({
      page: Number(page) || 1, limit: Number(limit) || 20,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};