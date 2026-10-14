const env = require('../config/env');

// Cross-site deployments (e.g. frontend on Vercel, API on Render) need COOKIE_SAMESITE=none (+ HTTPS).
// Same-site setups (shared parent domain, or both on localhost) should keep the stricter default.
const sameSite = ['strict', 'lax', 'none'].includes(env.COOKIE_SAMESITE) ? env.COOKIE_SAMESITE : 'strict';
const base = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || sameSite === 'none',
  sameSite,
  domain: env.COOKIE_DOMAIN,
  path: '/api/v1/auth', // scoped: only sent to auth endpoints (refresh/logout)
});

function setRefreshTokenCookie(res, token) {
  res.cookie('refreshToken', token, { ...base(), maxAge: env.REFRESH_TOKEN_EXPIRY_MS });
}

// Must repeat the same attributes, otherwise browsers keep the cookie.
function clearRefreshTokenCookie(res) {
  res.clearCookie('refreshToken', base());
}

module.exports = { setRefreshTokenCookie, clearRefreshTokenCookie };
