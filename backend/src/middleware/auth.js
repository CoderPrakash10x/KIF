const { User } = require('../models');
const { verifyAccessToken } = require('../utils/jwt');
const { USER_STATUS } = require('../constants/enums');
const ApiError = require('../utils/ApiError');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) throw new ApiError(401, 'Authentication token missing', 'UNAUTHENTICATED');

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      throw new ApiError(401, 'Invalid or expired access token', code);
    }

    const user = await User.findById(decoded.sub);
    if (!user) throw new ApiError(401, 'User no longer exists', 'UNAUTHENTICATED');

    if (user.status === USER_STATUS.DEACTIVATED) {
      throw new ApiError(403, 'Your account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };