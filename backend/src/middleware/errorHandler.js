const ApiError = require('../utils/ApiError');

const send = (res, status, message, code) => res.status(status).json({ success: false, message, code, requestId: res.getHeader && res.getHeader('X-Request-Id') });

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);
  if (err instanceof ApiError) return send(res, err.statusCode, err.message, err.code);

  // body-parser: malformed JSON (400), payload too large (413), bad charset (415) ...
  if (err.type === 'entity.parse.failed') return send(res, 400, 'Malformed JSON body', 'BAD_REQUEST');
  if (err.type === 'entity.too.large') return send(res, 413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');
  // multer (file size, unexpected field, our fileFilter)
  if (err.name === 'MulterError') {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return send(res, tooBig ? 413 : 400, tooBig ? 'File is too large (max 5 MB)' : 'Invalid file upload', 'UPLOAD_ERROR');
  }
  if (err.code === 'UNSUPPORTED_FILE_TYPE') return send(res, 400, err.message, 'UPLOAD_ERROR');
  // csv-parse
  if (err.code && String(err.code).startsWith('CSV_')) return send(res, 400, 'The CSV file could not be parsed', 'INVALID_CSV');

  if (err.name === 'CastError') return send(res, 400, `Invalid value for "${err.path}"`, 'INVALID_ID');
  if (err.code === 11000) return send(res, 409, 'Duplicate value violates a unique constraint', 'DUPLICATE_KEY');
  if (err.name === 'ValidationError') {
    const msg = Object.values(err.errors || {}).map((e) => e.message).join('; ') || 'Validation failed';
    return send(res, 400, msg, 'VALIDATION_ERROR');
  }
  // Legacy call sites that threw plain objects { statusCode, message, code }
  if (err && Number.isInteger(err.statusCode) && err.statusCode < 500 && err.message) {
    return send(res, err.statusCode, err.message, err.code || 'ERROR');
  }

  console.error('UNHANDLED_ERROR:', { requestId: req.id, path: req.originalUrl, method: req.method, user: req.user?._id, err });
  return send(res, 500, 'Internal server error', 'INTERNAL_ERROR');
}

module.exports = { errorHandler };
