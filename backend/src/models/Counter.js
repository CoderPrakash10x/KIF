const mongoose = require('mongoose');

// Atomic sequence generator (used for human-readable request numbers).
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function (name, session) {
  const doc = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session: session || null },
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
