const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.ACCESS_TOKEN_EXPIRY }
  );
}

// Refresh token carries a unique jti so each issuance is distinguishable,
// even though we also separately hash+store it for revocation checks.
function generateRefreshToken(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    { sub: user._id.toString(), jti },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRY }
  );
  return token;
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken };