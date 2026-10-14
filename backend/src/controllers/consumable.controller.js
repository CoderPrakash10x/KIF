const consumableService = require(
  '../services/consumable.service'
);

exports.create = async (req, res, next) => {
  try {
    const result =
      await consumableService.createConsumable(
        req.body,
        req.user,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

    res.status(201).json({
      success: true,
      message: 'Consumable created successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const consumable =
      await consumableService.updateConsumable(
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
      message: 'Consumable updated successfully',
      data: consumable,
    });
  } catch (error) {
    next(error);
  }
};

exports.deactivate = async (req, res, next) => {
  try {
    const consumable =
      await consumableService.deactivateConsumable(
        req.params.id,
        req.user,
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

    res.json({
      success: true,
      message: 'Consumable deactivated',
      data: consumable,
    });
  } catch (error) {
    next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    const {
      category,
      search,
      lowStock,
      active,
      page,
      limit,
    } = req.query;

    const result =
      await consumableService.listConsumables({
        category,
        search,
        lowStock,
        active:
          active === undefined
            ? true
            : active === 'true',
        page: Number(page) || 1,
        limit: Number(limit) || 20,
      });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const consumable =
      await consumableService.getConsumableById(
        req.params.id
      );

    res.json({
      success: true,
      data: consumable,
    });
  } catch (error) {
    next(error);
  }
};

exports.stockIn = async (req, res, next) => {
  try {
    const result =
      await consumableService.addStock(
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
      message: 'Stock added successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.stockOut = async (req, res, next) => {
  try {
    const result =
      await consumableService.consumeStock(
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
      message: 'Stock consumed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.adjust = async (req, res, next) => {
  try {
    const result =
      await consumableService.adjustStock(
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
      message: 'Stock adjusted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.history = async (req, res, next) => {
  try {
    const {
      type,
      fromDate,
      toDate,
      page,
      limit,
    } = req.query;

    const result =
      await consumableService.getStockHistory(
        req.params.id,
        {
          type,
          fromDate,
          toDate,
          page: Number(page) || 1,
          limit: Number(limit) || 20,
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