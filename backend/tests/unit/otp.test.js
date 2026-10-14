const test = require('node:test');
const assert = require('node:assert/strict');
const { createOtpService, generateOtp, hashOtp } = require('../../src/services/emailOtp.core');

// In-memory store with the same atomic semantics as the Mongo store (each op is a single synchronous step).
function memoryStore() {
  const m = new Map();
  const tick = () => new Promise((r) => setImmediate(r)); // let concurrent callers interleave
  return {
    m,
    async get(k) { await tick(); return m.has(k) ? { ...m.get(k) } : null; },
    async put(k, d) { await tick(); m.set(k, { ...d }); },
    async deleteIfHash(k, h) { if (m.get(k)?.otpHash === h) m.delete(k); },
    async incrementAttempts(k, { now, max }) {
      await tick(); const r = m.get(k);
      if (!r || r.usedAt || r.expiresAt <= now || r.attempts >= max) return null;
      r.attempts += 1; return { ...r };
    },
    async markUsed(k, h, now) { await tick(); const r = m.get(k); if (!r || r.usedAt || r.otpHash !== h) return false; r.usedAt = now; return true; },
  };
}

function setup(over = {}) {
  let t = 1_000_000;
  const sent = [];
  const store = memoryStore();
  const cfg = { expiryMs: 10 * 60000, cooldownMs: 60000, maxAttempts: 5, maxSendsPerHour: 3, secret: 'test-secret', ...over.cfg };
  const svc = createOtpService({
    store, config: cfg, now: () => t,
    mailer: over.mailer || (async (m) => { sent.push(m); return true; }),
  });
  return { svc, store, sent, advance: (ms) => { t += ms; }, cfg };
}
const U = 'user-1';
const issue = (svc) => svc.issue({ userKey: U, email: 'a@b.co', name: 'Asha' });

test('OTP is 6 numeric digits from a CSPRNG and never returned by issue()', async () => {
  for (let i = 0; i < 200; i += 1) assert.match(generateOtp(), /^\d{6}$/);
  const { svc, sent } = setup();
  const res = await issue(svc);
  assert.equal(res.sent, true);
  assert.ok(!JSON.stringify(res).includes(sent[0].otp), 'issue() result must not contain the code');
  assert.deepEqual(Object.keys(res).sort(), ['expiresInSec', 'retryAfterSec', 'sent']);
});

test('only a keyed hash is stored (raw code never at rest)', async () => {
  const { svc, store, sent } = setup();
  await issue(svc);
  const rec = store.m.get(U);
  assert.ok(!JSON.stringify(rec).includes(sent[0].otp));
  assert.equal(rec.otpHash, hashOtp(sent[0].otp, U, 'test-secret'));
  assert.notEqual(hashOtp(sent[0].otp, 'other-user', 'test-secret'), rec.otpHash, 'hash is bound to the user');
  assert.notEqual(hashOtp(sent[0].otp, U, 'another-secret'), rec.otpHash, 'hash is keyed with a server secret');
});

test('correct OTP verifies', async () => {
  const { svc, sent } = setup();
  await issue(svc);
  assert.deepEqual(await svc.verify({ userKey: U, otp: sent[0].otp }), { verified: true });
});

test('incorrect OTP fails with remaining attempts and does not consume the code', async () => {
  const { svc, sent } = setup();
  await issue(svc);
  const wrong = sent[0].otp === '000000' ? '111111' : '000000';
  await assert.rejects(svc.verify({ userKey: U, otp: wrong }), (e) => e.code === 'INVALID_OTP' && e.remainingAttempts === 4);
  assert.deepEqual(await svc.verify({ userKey: U, otp: sent[0].otp }), { verified: true });
});

test('malformed codes are rejected without touching the attempt counter', async () => {
  const { svc, store } = setup();
  await issue(svc);
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined]) {
    await assert.rejects(svc.verify({ userKey: U, otp: bad }), (e) => e.code === 'INVALID_OTP');
  }
  assert.equal(store.m.get(U).attempts, 0);
});

test('expired OTP fails', async () => {
  const { svc, sent, advance } = setup();
  await issue(svc);
  advance(10 * 60000 + 1);
  await assert.rejects(svc.verify({ userKey: U, otp: sent[0].otp }), (e) => e.code === 'OTP_EXPIRED');
});

test('OTP is single use (reuse fails)', async () => {
  const { svc, sent } = setup();
  await issue(svc);
  await svc.verify({ userKey: U, otp: sent[0].otp });
  await assert.rejects(svc.verify({ userKey: U, otp: sent[0].otp }), (e) => e.code === 'INVALID_OTP');
});

test('concurrent verifications of the same correct code: exactly one succeeds', async () => {
  const { svc, sent } = setup();
  await issue(svc);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => svc.verify({ userKey: U, otp: sent[0].otp })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});

test('attempt limit: after the cap even the CORRECT code is refused', async () => {
  const { svc, sent } = setup();
  await issue(svc);
  const wrong = sent[0].otp === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) await assert.rejects(svc.verify({ userKey: U, otp: wrong }), (e) => e.code === 'INVALID_OTP');
  await assert.rejects(svc.verify({ userKey: U, otp: sent[0].otp }), (e) => e.code === 'OTP_ATTEMPTS_EXCEEDED' && e.statusCode === 429);
});

test('concurrent guessing cannot exceed the attempt cap', async () => {
  const { svc, sent, store } = setup();
  await issue(svc);
  const wrong = sent[0].otp === '000000' ? '111111' : '000000';
  await Promise.allSettled(Array.from({ length: 30 }, () => svc.verify({ userKey: U, otp: wrong })));
  assert.equal(store.m.get(U).attempts, 5);
});

test('resend cooldown is enforced, then a new code invalidates the old one', async () => {
  const { svc, sent, advance } = setup();
  await issue(svc);
  const again = await issue(svc);
  assert.deepEqual([again.sent, again.reason], [false, 'COOLDOWN']);
  assert.ok(again.retryAfterSec > 0 && again.retryAfterSec <= 60);
  assert.equal(sent.length, 1, 'no second e-mail inside the cooldown');
  advance(61000);
  assert.equal((await issue(svc)).sent, true);
  assert.equal(sent.length, 2);
  const [oldCode, newCode] = [sent[0].otp, sent[1].otp];
  if (oldCode !== newCode) await assert.rejects(svc.verify({ userKey: U, otp: oldCode }), (e) => e.code === 'INVALID_OTP');
  assert.ok((await svc.verify({ userKey: U, otp: newCode })).verified);
});

test('hourly send cap prevents e-mail flooding', async () => {
  const { svc, advance } = setup();
  for (let i = 0; i < 3; i += 1) { assert.equal((await issue(svc)).sent, true); advance(61000); }
  const blocked = await issue(svc);
  assert.deepEqual([blocked.sent, blocked.reason], [false, 'SEND_LIMIT']);
  advance(3600000);
  assert.equal((await issue(svc)).sent, true);
});

test('e-mail delivery failure is reported and leaves no usable code', async () => {
  const { svc, store } = setup({ mailer: async () => false });
  await assert.rejects(issue(svc), (e) => e.code === 'EMAIL_DELIVERY_FAILED' && e.statusCode === 503);
  assert.equal(store.m.has(U), false);
});

test('mailer exceptions never leak and configuration errors stay explicit', async () => {
  const ApiError = require('../../src/utils/ApiError');
  const boom = setup({ mailer: async () => { throw new Error('smtp exploded: secret-host'); } });
  await assert.rejects(issue(boom.svc), (e) => e.code === 'EMAIL_DELIVERY_FAILED' && !/secret-host/.test(e.message));
  const cfg = setup({ mailer: async () => { throw new ApiError(503, 'Email delivery is not configured on the server.', 'EMAIL_NOT_CONFIGURED'); } });
  await assert.rejects(issue(cfg.svc), (e) => e.code === 'EMAIL_NOT_CONFIGURED');
});

test('unknown user / no code gives the same generic error', async () => {
  const { svc } = setup();
  await assert.rejects(svc.verify({ userKey: 'nobody', otp: '123456' }), (e) => e.code === 'INVALID_OTP');
});
