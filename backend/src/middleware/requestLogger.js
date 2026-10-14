const crypto = require('crypto');

// Request id (honours an upstream X-Request-Id) + one structured JSON line per request.
// Never logs bodies, headers or query strings, so passwords/tokens cannot leak into logs.
function requestLogger(req, res, next) {
  const id = String(req.headers['x-request-id'] || '').slice(0, 64) || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test' || req.path === '/api/v1/health' || req.path === '/api/v1/ready') return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(JSON.stringify({ t: new Date().toISOString(), id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms), user: req.user?._id, ip: req.ip }));
  });
  next();
}
module.exports = { requestLogger };
