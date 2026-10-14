// Escape user input before using it inside a RegExp / $regex (prevents regex injection and ReDoS).
const escapeRegex = (s) => String(s).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
module.exports = { escapeRegex };
