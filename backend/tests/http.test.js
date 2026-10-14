const request = require('supertest');
const app = require('../src/app');

describe('HTTP contract (no database needed)', () => {
  test('verify-email: missing token -> 400, never 500', async () => {
    const r = await request(app).post('/api/v1/auth/verify-email');
    expect(r.status).toBe(400); expect(r.body.code).toBe('INVALID_TOKEN');
  });
  test('verify-email is POST only (GET must not change state)', async () => {
    const r = await request(app).get('/api/v1/auth/verify-email?token=abcdefghijk');
    expect([401, 404]).toContain(r.status); // never reaches the handler
  });
  test('malformed JSON -> 400', async () => {
    const r = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email": bad');
    expect(r.status).toBe(400); expect(r.body.code).toBe('BAD_REQUEST');
  });
  test('oversized body -> 413', async () => {
    const r = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(2 * 1024 * 1024) }));
    expect(r.status).toBe(413);
  });
  test('protected route without token -> 401', async () => {
    expect((await request(app).get('/api/v1/users')).status).toBe(401);
    expect((await request(app).get('/api/v1/no-dues/my-status')).status).toBe(401);
  });
  test('register validates: weak password / bad role rejected', async () => {
    const bad = await request(app).post('/api/v1/auth/register').send({ name: 'Al', email: 'a@b.co', password: 'short', role: 'SUPER_ADMIN' });
    expect(bad.status).toBe(400);
    const long = await request(app).post('/api/v1/auth/register').send({ name: 'Alice', email: 'a@b.co', password: 'x'.repeat(100), role: 'STUDENT' });
    expect(long.status).toBe(400);
  });
  test('liveness ok, unknown route 404', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    expect((await request(app).get('/api/v1/nope')).status).toBe(404);
  });
  test('readiness is 503 while MongoDB is disconnected', async () => {
    expect((await request(app).get('/api/v1/ready')).status).toBe(503);
  });
});
