// Shared, bounded pagination parsing. Never trust ?page / ?limit from the client.
const MAX_LIMIT = 100;
function parsePage(page) { const n = parseInt(page, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 1; }
function parseLimit(limit, def = 20, max = MAX_LIMIT) { const n = parseInt(limit, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def; }
module.exports = { parsePage, parseLimit, MAX_LIMIT };
