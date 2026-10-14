const test = require('node:test');
const assert = require('node:assert/strict');
const { canManageRoom, requestScopeFilter } = require('../../src/utils/roomAccess');
const { ROOM_TYPE } = require('../../src/constants/enums');

const ROOMS = ['AI / Neural Lab', 'Podcast Room', 'Co-working Space', 'Conference Room', 'Fabrication Lab', '3D Maker Lab'];
const adminA = { _id: 'adminA', role: 'ADMIN' };
const adminB = { _id: 'adminB', role: 'ADMIN' };
const sa = { _id: 'sa', role: 'SUPER_ADMIN' };
const room = (name, assignedAdmin) => ({ _id: `room-${name}`, roomName: name, assignedAdmin });

test('six room types exist (the two original ones unchanged)', () => {
  assert.deepEqual(Object.values(ROOM_TYPE).sort(), ['AI_NEURAL_LAB', 'CONFERENCE_ROOM', 'CO_WORKING_SPACE', 'FABRICATION_LAB', 'MAKER_LAB_3D', 'PODCAST_ROOM']);
  assert.equal(ROOM_TYPE.AI_NEURAL_LAB, 'AI_NEURAL_LAB');
  assert.equal(ROOM_TYPE.PODCAST_ROOM, 'PODCAST_ROOM');
});

test('an admin manages ONLY the room(s) they are assigned to, for every room', () => {
  for (const target of ROOMS) {
    const rooms = ROOMS.map((n) => room(n, n === target ? 'adminA' : 'adminB'));
    for (const r of rooms) {
      assert.equal(canManageRoom(adminA, r), r.roomName === target, `adminA on ${r.roomName}`);
      assert.equal(canManageRoom(adminB, r), r.roomName !== target, `adminB on ${r.roomName}`);
    }
  }
});

test('Super Admin manages every room, including rooms with no assigned administrator', () => {
  for (const n of ROOMS) { assert.ok(canManageRoom(sa, room(n, null))); assert.ok(canManageRoom(sa, room(n, 'adminA'))); }
});

test('there is NO unrestricted fallback: an unassigned room is closed to every Admin', () => {
  for (const a of [adminA, adminB]) assert.equal(canManageRoom(a, room('3D Maker Lab', null)), false);
  assert.equal(canManageRoom(adminA, room('3D Maker Lab', undefined)), false);
});

test('non-admin roles never manage rooms, even if (wrongly) listed as assignee', () => {
  for (const role of ['FOUNDER', 'INTERN', 'STUDENT']) assert.equal(canManageRoom({ _id: 'x', role }, room('Podcast Room', 'x')), false);
  assert.equal(canManageRoom(null, room('Podcast Room', 'x')), false);
  assert.equal(canManageRoom(adminA, null), false);
});

test('assignment is read from the CURRENT room state: reassigning moves authority immediately', () => {
  const r = room('Fabrication Lab', 'adminA');
  assert.equal(canManageRoom(adminA, r), true);
  r.assignedAdmin = 'adminB'; // Super Admin reassigns while a request is pending
  assert.equal(canManageRoom(adminA, r), false);
  assert.equal(canManageRoom(adminB, r), true);
});

test('populated assignedAdmin documents are handled', () => {
  assert.equal(canManageRoom(adminA, room('Conference Room', { _id: 'adminA', name: 'A' })), true);
});

test('request scope: Admin sees non-room requests + only their rooms; Super Admin sees everything', () => {
  assert.equal(requestScopeFilter(sa, []), null);
  assert.deepEqual(requestScopeFilter(adminA, ['r1', 'r2']), { $or: [{ type: { $ne: 'ROOM' } }, { type: 'ROOM', resourceId: { $in: ['r1', 'r2'] } }] });
  assert.deepEqual(requestScopeFilter(adminA, []).$or[1].resourceId.$in, [], 'an admin with no rooms sees no room requests');
});
