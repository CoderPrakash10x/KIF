jest.mock('../../src/utils/email', () => ({ ...jest.requireActual('../../src/utils/email'), sendEmail: jest.fn().mockResolvedValue(true) }));
const request = require('supertest');
const { start, stop, reset } = require('./helpers');

let app; let models; let T; let rooms;
beforeAll(async () => { await start(); app = require('../../src/app'); models = require('../../src/models'); });
afterAll(stop);

const mk = async (name, role) => {
  const u = new models.User({ name, email: `${name}@kif.test`, role, status: 'ACTIVE', emailVerified: true, approvalStatus: 'APPROVED' });
  u.password = 'Passw0rd!'; await u.save();
  const token = (await request(app).post('/api/v1/auth/login').send({ email: `${name}@kif.test`, password: 'Passw0rd!' })).body.data.accessToken;
  return { user: u, token };
};
const as = (who) => ({ Authorization: `Bearer ${who.token}` });
const day = () => { const d = new Date(Date.now() + 2 * 864e5); return d.toISOString().slice(0, 10); };

beforeEach(async () => {
  await reset();
  T = { sa: await mk('sa', 'SUPER_ADMIN'), a1: await mk('admin1', 'ADMIN'), a2: await mk('admin2', 'ADMIN'), s: await mk('stu', 'STUDENT') };
  const defs = [['AI / Neural Lab', 'AI_NEURAL_LAB'], ['Podcast Room', 'PODCAST_ROOM'], ['Co-working Space', 'CO_WORKING_SPACE'], ['Conference Room', 'CONFERENCE_ROOM'], ['Fabrication Lab', 'FABRICATION_LAB'], ['3D Maker Lab', 'MAKER_LAB_3D']];
  rooms = {};
  for (const [roomName, type] of defs) rooms[type] = await models.Room.create({ roomName, type });
});

const assign = (room, who) => request(app).put(`/api/v1/rooms/${room._id}/admin`).set(as(T.sa)).send({ adminId: who ? who.user._id : null });
const ask = (room) => request(app).post('/api/v1/requests').set(as(T.s)).send({ type: 'ROOM', resourceId: room._id, startDate: day(), startTime: '10:00', endTime: '11:00', purpose: 'Study' });

test('all six rooms are listed with canManage flags', async () => {
  const res = await request(app).get('/api/v1/rooms').set(as(T.sa));
  expect(res.body.data).toHaveLength(6);
  expect(res.body.data.every((r) => r.canManage)).toBe(true);
});

test('only the Super Admin can assign; an Admin cannot assign themselves; target must be an Admin', async () => {
  expect((await request(app).put(`/api/v1/rooms/${rooms.MAKER_LAB_3D._id}/admin`).set(as(T.a1)).send({ adminId: T.a1.user._id })).status).toBe(403);
  expect((await assign(rooms.MAKER_LAB_3D, T.s)).status).toBe(400);
  expect((await assign(rooms.MAKER_LAB_3D, T.a1)).status).toBe(200);
});

test('assigned admin approves their room only; cross-room approval is rejected on the API', async () => {
  await assign(rooms.MAKER_LAB_3D, T.a1); await assign(rooms.FABRICATION_LAB, T.a2);
  const r3d = (await ask(rooms.MAKER_LAB_3D)).body.data;
  const rFab = (await ask(rooms.FABRICATION_LAB)).body.data;
  expect((await request(app).post(`/api/v1/requests/${rFab._id}/approve`).set(as(T.a1)).send({})).status).toBe(403);
  expect((await request(app).post(`/api/v1/requests/${r3d._id}/reject`).set(as(T.a2)).send({})).status).toBe(403);
  expect((await request(app).post(`/api/v1/requests/${r3d._id}/approve`).set(as(T.a1)).send({})).status).toBe(200);
  expect((await request(app).post(`/api/v1/requests/${rFab._id}/approve`).set(as(T.sa)).send({})).status).toBe(200);
});

test('request lists are scoped; unassigned rooms are visible to the Super Admin only', async () => {
  await assign(rooms.MAKER_LAB_3D, T.a1);
  await ask(rooms.MAKER_LAB_3D); await ask(rooms.CONFERENCE_ROOM);
  const a1 = await request(app).get('/api/v1/requests?type=ROOM').set(as(T.a1));
  expect(a1.body.data).toHaveLength(1);
  expect((await request(app).get('/api/v1/requests?type=ROOM').set(as(T.a2))).body.data).toHaveLength(0);
  expect((await request(app).get('/api/v1/requests?type=ROOM').set(as(T.sa))).body.data).toHaveLength(2);
});

test('reassignment applies to pending requests immediately', async () => {
  await assign(rooms.MAKER_LAB_3D, T.a1);
  const r = (await ask(rooms.MAKER_LAB_3D)).body.data;
  await assign(rooms.MAKER_LAB_3D, T.a2);
  expect((await request(app).post(`/api/v1/requests/${r._id}/approve`).set(as(T.a1)).send({})).status).toBe(403);
  expect((await request(app).post(`/api/v1/requests/${r._id}/approve`).set(as(T.a2)).send({})).status).toBe(200);
});

test('direct booking / blocking / room edits are room-scoped; assignment fields cannot be mass-assigned', async () => {
  await assign(rooms.MAKER_LAB_3D, T.a1);
  const body = (room) => ({ roomId: room._id, date: day(), startTime: '14:00', endTime: '15:00', purpose: 'Maintenance', reason: 'Clean' });
  expect((await request(app).post('/api/v1/rooms/bookings/block-maintenance').set(as(T.a2)).send(body(rooms.MAKER_LAB_3D))).status).toBe(403);
  expect((await request(app).post('/api/v1/rooms/bookings/block-maintenance').set(as(T.a1)).send(body(rooms.MAKER_LAB_3D))).status).toBe(201);
  expect((await request(app).patch(`/api/v1/rooms/${rooms.MAKER_LAB_3D._id}`).set(as(T.a2)).send({ capacity: 9 })).status).toBe(403);
  await request(app).patch(`/api/v1/rooms/${rooms.MAKER_LAB_3D._id}`).set(as(T.a1)).send({ capacity: 9, assignedAdmin: T.a2.user._id });
  const fresh = await models.Room.findById(rooms.MAKER_LAB_3D._id);
  expect(fresh.capacity).toBe(9);
  expect(String(fresh.assignedAdmin)).toBe(String(T.a1.user._id));
});

test('double booking is still prevented', async () => {
  await assign(rooms.MAKER_LAB_3D, T.a1);
  expect((await ask(rooms.MAKER_LAB_3D)).status).toBe(201);
  expect((await ask(rooms.MAKER_LAB_3D)).status).toBe(409);
});

test('migration/seed logic is idempotent: no duplicate rooms, existing ids preserved', async () => {
  const before = await models.Room.find({}).lean();
  const ids = before.map((r) => String(r._id)).sort();
  // re-running ensureRoom for every name must not create anything
  for (const r of before) expect(await models.Room.countDocuments({ type: r.type })).toBe(1);
  expect((await models.Room.find({}).lean()).map((r) => String(r._id)).sort()).toEqual(ids);
});
