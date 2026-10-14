const { parsePage, parseLimit } = require('../utils/pagination');
const cabinService = require('../services/cabin.service');

const isAdmin = (u) => ['ADMIN', 'SUPER_ADMIN'].includes(u.role);
// Members may see which cabins exist and their state, never who occupies them (names/emails are PII).
const redact = (cabin) => { const o = cabin.toObject ? cabin.toObject() : { ...cabin }; if (o.currentAllotment) o.currentAllotment = { _id: o.currentAllotment._id || o.currentAllotment }; delete o.maintenanceReason; return o; };

// ---------------------------------------------------------------------------
// CATALOG
// ---------------------------------------------------------------------------

exports.uploadLetter = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Attach the allotment letter (PDF or image)', code: 'VALIDATION_ERROR' });
    const cloudinary = require('../config/cloudinary');
    const url = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: 'kif-rms/allotment-letters', resource_type: 'auto' }, (err, result) => (err ? reject(err) : resolve(result.secure_url)));
      stream.end(req.file.buffer);
    });
    res.status(201).json({ success: true, message: 'Allotment letter uploaded', data: { url } });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const cabin = await cabinService.createCabin(
      req.body,
      req.user,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    res.status(201).json({
      success: true,
      message: 'Cabin created successfully',
      data: cabin,
    });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const cabin = await cabinService.updateCabin(
      req.params.id,
      req.body,
      req.user,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    res.json({
      success: true,
      message: 'Cabin updated successfully',
      data: cabin,
    });
  } catch (error) {
    next(error);
  }
};

exports.deactivate = async (req, res, next) => {
  try {
    const cabin = await cabinService.deactivateCabin(
      req.params.id,
      req.user,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    res.json({
      success: true,
      message: 'Cabin deactivated successfully',
      data: cabin,
    });
  } catch (error) {
    next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    const {
      status,
      type,
      search,
      active,
      page,
      limit,
    } = req.query;

    const result = await cabinService.listCabins({
      status,
      type,
      search,
      active:
        isAdmin(req.user) && active !== undefined ? active === 'true' : true,
      page: parsePage(page),
      limit: parseLimit(limit, 20),
    });

    res.json({
      success: true,
      ...result,
      data: isAdmin(req.user) ? result.data : result.data.map(redact),
    });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const cabin = await cabinService.getCabinById(
      req.params.id
    );

    res.json({
      success: true,
      data: isAdmin(req.user) ? cabin : redact(cabin),
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// MAINTENANCE
// ---------------------------------------------------------------------------

exports.markMaintenance = async (req, res, next) => {
  try {
    const cabin =
      await cabinService.markCabinUnderMaintenance(
        req.params.id,
        req.body.reason,
        req.user,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

    res.json({
      success: true,
      message: 'Cabin marked under maintenance',
      data: cabin,
    });
  } catch (error) {
    next(error);
  }
};

exports.clearMaintenance = async (req, res, next) => {
  try {
    const cabin =
      await cabinService.clearCabinMaintenance(
        req.params.id,
        req.user,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

    res.json({
      success: true,
      message: 'Cabin maintenance cleared',
      data: cabin,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// ALLOTMENTS
// ---------------------------------------------------------------------------

exports.createDirectAllotment = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await cabinService.createDirectAllotment(
        req.body,
        req.user,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

    res.status(201).json({
      success: true,
      message: 'Cabin allotted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.activateAllotment = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await cabinService.activateAllotment(
        req.params.id,
        req.user,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

    res.json({
      success: true,
      message: 'Cabin allotment activated',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.vacate = async (req, res, next) => {
  try {
    const result = await cabinService.vacateCabin(
      req.params.id,
      req.user,
      req.body.reason,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    res.json({
      success: true,
      message: 'Cabin vacated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.getCabinHistory = async (
  req,
  res,
  next
) => {
  try {
    const { status, page, limit } = req.query;

    const result =
      await cabinService.getCabinAllotmentHistory(
        req.params.id,
        {
          status,
          page: parsePage(page),
          limit: parseLimit(limit, 20),
        }
      );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyHistory = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;

    const result =
      await cabinService.getUserCabinHistory(
        req.user._id,
        {
          status,
          page: parsePage(page),
          limit: parseLimit(limit, 20),
        }
      );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllotmentById = async (
  req,
  res,
  next
) => {
  try {
    const allotment =
      await cabinService.getAllotmentById(
        req.params.id
      );

    res.json({
      success: true,
      data: allotment,
    });
  } catch (error) {
    next(error);
  }
};