const { User, EmailOtp } = require('../models');
const env = require('../config/env');

// Abandoned registrations (never verified, never able to sign in) would otherwise hold a roll number and
// an e-mail address forever. Verified or approved accounts are never touched.
async function purgeAbandonedRegistrations(now = Date.now()) {
  const cutoff = new Date(now - env.UNVERIFIED_REGISTRATION_TTL_DAYS * 86400000);
  const stale = await User.find({
    emailVerified: false, approvalStatus: 'PENDING', status: 'PENDING_VERIFICATION', createdAt: { $lt: cutoff },
    lastLogin: { $exists: false },
  }).select('_id');
  if (!stale.length) return 0;
  const ids = stale.map((u) => u._id);
  await EmailOtp.deleteMany({ userId: { $in: ids } });
  const res = await User.deleteMany({ _id: { $in: ids }, emailVerified: false });
  return res.deletedCount;
}

module.exports = { purgeAbandonedRegistrations };
