// Room-scoped authorization (pure functions; the DB-backed helpers live in services/roomAccess.service.js).
//   SUPER_ADMIN  -> every room (including rooms with no assigned administrator)
//   ADMIN        -> only rooms where room.assignedAdmin === user._id
//   everyone else-> no administrative access
const idOf = (v) => (v && v._id ? String(v._id) : v ? String(v) : null);

function canManageRoom(user, room) {
  if (!user || !room) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'ADMIN') return false;
  const assigned = idOf(room.assignedAdmin);
  return !!assigned && assigned === idOf(user._id);
}

// Mongo filter limiting a Request query to what this caller may see.
// ADMIN: all non-room requests + room requests for rooms they manage. SUPER_ADMIN: everything.
function requestScopeFilter(user, managedRoomIds = []) {
  if (user.role === 'SUPER_ADMIN') return null;
  return { $or: [{ type: { $ne: 'ROOM' } }, { type: 'ROOM', resourceId: { $in: managedRoomIds } }] };
}

module.exports = { canManageRoom, requestScopeFilter, idOf };
