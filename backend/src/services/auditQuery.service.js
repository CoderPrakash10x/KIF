const { AuditLog } = require('../models');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/enums');

const SENSITIVE_KEYS = new Set(['passwordHash', 'refreshTokens', 'emailVerificationToken', 'passwordResetToken', 'tokenHash']);

// ADMIN gets a "limited" view: no authentication noise and no role-assignment records.
const ADMIN_MODULES = ['CABIN', 'HARDWARE', 'ROOM', 'EVENT', 'REQUEST', 'REQUESTS', 'CONSUMABLES', 'CONSUMABLE', 'NO_DUES'];
function scopeFor(actor) {
  if (actor.role === ROLES.SUPER_ADMIN) return {};
  // Admin/Staff: their own actions plus the operational modules they run (never auth/user/role records).
  return { $or: [{ performedBy: actor._id }, { module: { $in: ADMIN_MODULES } }], action: { $ne: 'ASSIGN_ROLE' } };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!SENSITIVE_KEYS.has(k)) out[k] = redact(v);
    return out;
  }
  return value;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildQuery(actor, { module, action, actorId, search, from, to }) {
  const and = [scopeFor(actor)];
  if (module) and.push({ module });
  if (action) and.push({ action });
  if (actorId) and.push({ performedBy: actorId });
  if (from || to) {
    const range = {};
    if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) range.$lte = new Date(`${to}T23:59:59.999Z`);
    and.push({ timestamp: range });
  }
  if (search) {
    const rx = new RegExp(escapeRegex(String(search).slice(0, 80)), 'i');
    and.push({ $or: [{ action: rx }, { module: rx }, { resourceType: rx }] });
  }
  return { $and: and };
}

async function list(actor, filters = {}, { page = 1, limit = 20 } = {}) {
  const query = buildQuery(actor, filters);
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    AuditLog.find(query).select('-oldValue -newValue -userAgent').populate('performedBy', 'name email role')
      .sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(query),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getById(actor, id) {
  const doc = await AuditLog.findOne({ $and: [scopeFor(actor), { _id: id }] })
    .populate('performedBy', 'name email role').lean();
  if (!doc) throw new ApiError(404, 'Audit record not found', 'NOT_FOUND');
  doc.oldValue = redact(doc.oldValue);
  doc.newValue = redact(doc.newValue);
  return doc;
}

async function meta(actor) {
  const scope = scopeFor(actor);
  const [modules, actions, total, adminActions, system] = await Promise.all([
    AuditLog.distinct('module', scope),
    AuditLog.distinct('action', scope),
    AuditLog.countDocuments(scope),
    AuditLog.countDocuments({ ...scope, role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] } }),
    AuditLog.countDocuments({ ...scope, isSystemGenerated: true }),
  ]);
  return { modules: modules.sort(), actions: actions.sort(), total, adminActions, system };
}

// CSV with spreadsheet-formula neutralisation; capped to protect the server.
const EXPORT_CAP = 5000;
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportCsv(actor, filters = {}) {
  const query = buildQuery(actor, filters);
  const rows = await AuditLog.find(query).select('-oldValue -newValue -userAgent')
    .populate('performedBy', 'name email').sort({ timestamp: -1 }).limit(EXPORT_CAP).lean();
  const head = ['Event ID', 'Timestamp', 'Actor', 'Role', 'Action', 'Module', 'Resource type', 'Resource ID', 'IP'];
  const lines = rows.map((r) => [
    r._id, new Date(r.timestamp).toISOString(), r.performedBy?.name || 'System', r.role, r.action, r.module,
    r.resourceType, r.resourceId, r.ipAddress,
  ].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n');
}

module.exports = { list, getById, meta, exportCsv, redact, csvCell };
