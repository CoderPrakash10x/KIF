const ApiError = require('../utils/ApiError');

function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Duplicate value violates a unique constraint', code: 'DUPLICATE_KEY' });
  }

  // Mongoose validation
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message, code: 'VALIDATION_ERROR' });
  }

  console.error('UNHANDLED_ERROR:', err);
  return res.status(500).json({ success: false, message: 'Internal server error', code: 'INTERNAL_ERROR' });
}

module.exports = { errorHandler };