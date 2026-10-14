/* eslint-disable no-console */
// Idempotent, non-destructive migration for: registration approval + institutional fields + six rooms.
//   npm run migrate        (safe to run repeatedly; never drops, resets or overwrites existing data)
require('dotenv').config();
const mongoose = require('mongoose');
const { User, Room } = require('../src/models');

// Rooms added by this release. Capacity / location are intentionally NOT set: they are not known yet and
// must be confirmed by the Super Admin (Rooms > Manage room). Opening hours use the platform-wide slot window.
const NEW_ROOMS = [
  { roomName: 'Co-working Space', type: 'CO_WORKING_SPACE' },
  { roomName: 'Conference Room', type: 'CONFERENCE_ROOM' },
  { roomName: 'Fabrication Lab', type: 'FABRICATION_LAB' },
  { roomName: '3D Maker Lab', type: 'MAKER_LAB_3D' },
];
const EXISTING_ROOMS = [
  { roomName: 'AI / Neural Lab', type: 'AI_NEURAL_LAB' },
  { roomName: 'Podcast Room', type: 'PODCAST_ROOM' },
];

async function ensureRoom({ roomName, type }) {
  const found = await Room.findOne({ $or: [{ type }, { roomName: new RegExp(`^${roomName.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'i') }] });
  if (found) return { room: found, created: false };
  return { room: await Room.create({ roomName, type, active: true }), created: true };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([User.syncIndexes(), Room.syncIndexes()]);

  // 1) Users created before the approval workflow are already trusted: record that explicitly.
  const approved = await User.updateMany(
    { approvalStatus: { $exists: false }, emailVerified: true },
    { $set: { approvalStatus: 'APPROVED' } },
  );
  // Unverified legacy self-registrations must verify via OTP (use "Resend code" on the sign-up page).
  const pending = await User.updateMany(
    { approvalStatus: { $exists: false }, emailVerified: { $ne: true } },
    { $set: { approvalStatus: 'PENDING' } },
  );
  console.log(`users: ${approved.modifiedCount} marked APPROVED, ${pending.modifiedCount} marked PENDING`);

  // 2) Rooms: existing rooms keep their _id, bookings and assignments; missing ones are created once.
  for (const r of [...EXISTING_ROOMS, ...NEW_ROOMS]) {
    const { room, created } = await ensureRoom(r);
    console.log(`${created ? 'created ' : 'present '} ${room.roomName} (${room.type})${created ? ' - capacity/location to be confirmed' : ''}`);
  }
  await mongoose.disconnect();
}

main().catch(async (e) => { console.error('Migration failed:', e.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
