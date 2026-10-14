// Prints two distinct random secrets for JWT_SECRET / JWT_REFRESH_SECRET.   Usage: npm run secrets
const c = require('crypto');
console.log(`JWT_SECRET=${c.randomBytes(48).toString('hex')}\nJWT_REFRESH_SECRET=${c.randomBytes(48).toString('hex')}`);
