const { User } = require('../models');
const { verifyAccessToken } = require('../utils/jwt');
const { accountGate } = require('../utils/accountGate');
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

    const blocked = accountGate(user); // verified + approved + not deactivated/rejected, on every request
    if (blocked) throw new ApiError(blocked.http, blocked.message, blocked.code);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };