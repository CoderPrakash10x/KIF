jest.mock('../../src/utils/email', () => ({ ...jest.requireActual('../../src/utils/email'), sendEmail: jest.fn().mockResolvedValue(true) }));
const request = require('supertest');
const { start, stop, reset, sentCodes, registration } = require('./helpers');

let app; let models;
beforeAll(async () => { await start(); app = require('../../src/app'); models = require('../../src/models'); });
afterAll(stop);
beforeEach(async () => { await reset(); require('../../src/utils/email').sendEmail.mockClear(); });

const api = () => request(app);
const seedSuperAdmin = async () => {
  const u = new models.User({ name: 'SA', email: 'sa@kif.test', role: 'SUPER_ADMIN', status: 'ACTIVE', emailVerified: true });
  u.password = 'Admin@12345'; await u.save();
  return (await api().post('/api/v1/auth/login').send({ email: 'sa@kif.test', password: 'Admin@12345' })).body.data.accessToken;
};

test('registration persists institutional fields, hashes the password, never returns the OTP', async () => {
  const res = await api().post('/api/v1/auth/register').send(registration({ purpose: undefined }));
  expect(res.status).toBe(202);
  expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
  const u = await models.User.findOne({ email: 'asha@example.com' }).select('+passwordHash');
  expect(u).toMatchObject({ college: 'KIPM - College of Management', department: 'Management', branch: 'MBA', rollNumber: '21-MBA-007', emailVerified: false, approvalStatus: 'PENDING' });
  expect(u.passwordHash).not.toContain('S3curePass!');
  expect(u.purpose).toBeUndefined();
});

test('invalid college and missing fields are rejected', async () => {
  expect((await api().post('/api/v1/auth/register').send(registration({ college: 'Random College' }))).status).toBe(400);
  expect((await api().post('/api/v1/auth/register').send({ email: 'x@y.co' })).status).toBe(400);
});

test('unverified account cannot sign in; verified-but-pending cannot; approved can', async () => {
  const sa = await seedSuperAdmin();
  await api().post('/api/v1/auth/register').send(registration());
  const login = () => api().post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'S3curePass!' });
  expect((await login()).body.code).toBe('EMAIL_NOT_VERIFIED');

  const ok = await api().post('/api/v1/auth/verify-otp').send({ email: 'asha@example.com', otp: sentCodes().pop() });
  expect(ok.body.message).toBe('Email verified successfully. Your account is awaiting Super Admin approval.');
  expect((await login()).body.code).toBe('ACCOUNT_PENDING_APPROVAL');

  const user = await models.User.findOne({ email: 'asha@example.com' });
  await api().post(`/api/v1/users/${user._id}/approve`).set('Authorization', `Bearer ${sa}`).expect(200);
  expect((await login()).status).toBe(200);
});

test('wrong code, reuse, and attempt limit', async () => {
  await api().post('/api/v1/auth/register').send(registration());
  const code = sentCodes().pop();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 3; i += 1) expect((await api().post('/api/v1/auth/verify-otp').send({ email: 'asha@example.com', otp: wrong })).body.code).toBe('INVALID_OTP');
  expect((await api().post('/api/v1/auth/verify-otp').send({ email: 'asha@example.com', otp: code })).body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
});

test('OTP reuse fails; resend cooldown holds; duplicate registration stays generic', async () => {
  await api().post('/api/v1/auth/register').send(registration());
  const code = sentCodes().pop();
  await api().post('/api/v1/auth/verify-otp').send({ email: 'asha@example.com', otp: code }).expect(200);
  expect((await api().post('/api/v1/auth/verify-otp').send({ email: 'asha@example.com', otp: code })).status).toBe(400);

  const again = await api().post('/api/v1/auth/register').send(registration({ rollNumber: '21-MBA-008' }));
  expect(again.status).toBe(202); // generic: does not reveal the account exists
  expect(sentCodes()).toHaveLength(1);

  await reset();
  await api().post('/api/v1/auth/register').send(registration());
  const resend = await api().post('/api/v1/auth/resend-otp').send({ email: 'asha@example.com' });
  expect(resend.status).toBe(202);
  expect(sentCodes()).toHaveLength(1); // inside the cooldown: no second e-mail
});

test('roll number is unique per college only', async () => {
  await api().post('/api/v1/auth/register').send(registration());
  expect((await api().post('/api/v1/auth/register').send(registration({ email: 'b@example.com' }))).body.code).toBe('ROLL_NUMBER_EXISTS');
  expect((await api().post('/api/v1/auth/register').send(registration({ email: 'c@example.com', college: 'KIPM - College of Engineering & Technology' }))).status).toBe(202);
});

test('e-mail delivery failure is reported', async () => {
  require('../../src/utils/email').sendEmail.mockResolvedValueOnce(false);
  const res = await api().post('/api/v1/auth/register').send(registration());
  expect(res.status).toBe(503);
  expect(res.body.code).toBe('EMAIL_DELIVERY_FAILED');
});

test('only the Super Admin can approve; an Admin cannot, and activation cannot bypass approval', async () => {
  const sa = await seedSuperAdmin();
  const admin = new models.User({ name: 'A', email: 'adm@kif.test', role: 'ADMIN', status: 'ACTIVE', emailVerified: true, approvalStatus: 'APPROVED' });
  admin.password = 'Admin@12345'; await admin.save();
  const adminToken = (await api().post('/api/v1/auth/login').send({ email: 'adm@kif.test', password: 'Admin@12345' })).body.data.accessToken;
  await api().post('/api/v1/auth/register').send(registration());
  await api().post('/api/v1/auth/verify-otp').send({ email: 'asha@example.com', otp: sentCodes().pop() });
  const target = await models.User.findOne({ email: 'asha@example.com' });
  expect((await api().post(`/api/v1/users/${target._id}/approve`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(403);
  expect((await api().patch(`/api/v1/users/${target._id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' })).body.code).toBe('APPROVAL_REQUIRED');
  expect((await api().post(`/api/v1/users/${target._id}/approve`).set('Authorization', `Bearer ${sa}`)).status).toBe(200);
});

test('legacy users without approvalStatus keep signing in', async () => {
  await models.User.collection.insertOne({ name: 'Old', email: 'old@kif.test', role: 'STUDENT', status: 'ACTIVE', emailVerified: true, passwordHash: await require('bcryptjs').hash('Old@12345', 10), createdAt: new Date(), updatedAt: new Date() });
  expect((await api().post('/api/v1/auth/login').send({ email: 'old@kif.test', password: 'Old@12345' })).status).toBe(200);
});
