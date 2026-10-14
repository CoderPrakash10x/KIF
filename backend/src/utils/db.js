const mongoose = require('mongoose');

/**
 * Runs `work` inside a MongoDB session transaction.
 * Requires a replica set (MongoDB Atlas provides this by default).
 * Guarantees: the read-check + write happen atomically — prevents
 * race conditions where two simultaneous requests both pass validation.
 */
async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    session.endSession();
  }
}

module.exports = { withTransaction };