const ApiError = require('../utils/ApiError');

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required', 'UNAUTHENTICATED'));

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You are not authorized to perform this action', 'FORBIDDEN'));
    }
    next();
  };
}

module.exports = { authorize };