const ApiError = require('../utils/ApiError');

// Generic Zod-validation middleware — validates req.body against the given schema
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = (result.error.issues || result.error.errors || []).map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      return next(new ApiError(400, message, 'VALIDATION_ERROR'));
    }
    req.body = result.data; // use the parsed/sanitized data going forward
    next();
  };
}

module.exports = { validate };