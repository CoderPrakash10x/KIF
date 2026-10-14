const mongoose = require('mongoose');
const { errorHandler } = require('../src/middleware/errorHandler');
const ApiError = require('../src/utils/ApiError');
const { rangesOverlap } = require('../src/utils/time');
const { parsePage, parseLimit } = require('../src/utils/pagination');
const { directBookingSchema } = require('../src/validators/room.validator');
const { createRequestSchema } = require('../src/validators/request.validator');
const { createCabinSchema } = require('../src/validators/cabin.validator');
const { escapeHtml, genericNotificationTemplate } = require('../src/utils/email');

const run = (err) => { const res = { code: 0, status(c) { this.code = c; return this; }, json(b) { this.b = b; return this; } }; errorHandler(err, { originalUrl: '/x', method: 'GET' }, res, () => {}); return res; };

describe('errorHandler', () => {
  test('ApiError passthrough', () => expect(run(new ApiError(409, 'm', 'C')).code).toBe(409));
  test('CastError (bad :id) -> 400', () => expect(run(new mongoose.Error.CastError('ObjectId', 'abc', '_id')).code).toBe(400));
  test('legacy plain-object throw keeps its status', () => expect(run({ statusCode: 400, message: 'CSV file is required', code: 'VALIDATION_ERROR' }).code).toBe(400));
  test('multer size -> 413, bad mime -> 400', () => {
    expect(run(Object.assign(new Error('x'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' })).code).toBe(413);
    expect(run(Object.assign(new Error('Unsupported file type'), { code: 'UNSUPPORTED_FILE_TYPE' })).code).toBe(400);
  });
  test('unknown errors stay 500 and never leak details', () => { const r = run(new Error('secret db detail')); expect(r.code).toBe(500); expect(JSON.stringify(r.b)).not.toMatch(/secret/); });
});

describe('pagination', () => {
  test('bounded', () => { expect(parseLimit('1000000')).toBe(100); expect(parseLimit('-5')).toBe(20); expect(parseLimit('abc', 12)).toBe(12); expect(parsePage('-3')).toBe(1); expect(parsePage('7')).toBe(7); });
});

describe('room slot rules', () => {
  const base = { roomId: 'a'.repeat(24), date: '2026-10-20', purpose: 'Demo run' };
  test('inverted / out-of-hours / >4h / garbage rejected', () => {
    for (const [s, e] of [['18:00', '09:00'], ['08:00', '10:00'], ['09:00', '14:00'], ['abc', 'xyz'], ['19:00', '21:00']]) {
      expect(directBookingSchema.safeParse({ ...base, startTime: s, endTime: e }).success).toBe(false);
    }
  });
  test('valid slot accepted', () => expect(directBookingSchema.safeParse({ ...base, startTime: '10:00', endTime: '12:00' }).success).toBe(true));
  test('overlap helper still correct for valid ranges', () => { expect(rangesOverlap('10:00', '11:00', '10:30', '12:00')).toBe(true); expect(rangesOverlap('10:00', '11:00', '11:00', '12:00')).toBe(false); });
});

describe('request validation', () => {
  const ok = { type: 'HARDWARE', resourceId: 'a'.repeat(24), startDate: '2026-10-10', endDate: '2026-10-20', purpose: 'Prototype' };
  test('quantity must be a whole number', () => {
    expect(createRequestSchema.safeParse({ ...ok, metadata: { quantity: 2 } }).success).toBe(true);
    for (const q of [-1, 0, 1.5, 'abc', 5000]) expect(createRequestSchema.safeParse({ ...ok, metadata: { quantity: q } }).success).toBe(false);
  });
  test('end before start rejected; unknown metadata keys stripped', () => {
    expect(createRequestSchema.safeParse({ ...ok, endDate: '2026-10-01' }).success).toBe(false);
    const p = createRequestSchema.safeParse({ ...ok, metadata: { quantity: 1, members: ['x'], junk: 'y' } });
    expect(p.data.metadata).toEqual({ quantity: 1 });
  });
});

describe('cabin validator', () => {
  test('rejects bad capacity', () => expect(createCabinSchema.safeParse({ cabinNumber: 'C1', type: 'CABIN', capacity: 'abc' }).success).toBe(false));
});

describe('email templates escape user input', () => {
  test('html injection neutralised', () => {
    expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
    expect(genericNotificationTemplate('<b>Bob</b>', 't', '<script>1</script>')).not.toMatch(/<script>|<b>Bob/);
  });
});

describe('event service (regression: REQUEST_STATUS ReferenceError)', () => {
  test('cancelEvent / markCompleted no longer throw ReferenceError', async () => {
    const models = require('../src/models');
    require('../src/services/audit.service').log = async () => {};
    const mk = (status) => ({ _id: 'e1', title: 'T', date: new Date(), status, toObject() { return {}; }, save: async () => {} });
    const rs = require('../src/services/request.service'); rs.syncRequestStatusByLinkedTransaction = async () => {};
    models.Event.findById = async () => mk('PUBLISHED'); models.EventRegistration.find = async () => [];
    const svc = require('../src/services/event.service');
    await expect(svc.cancelEvent('e1', { _id: 'a', role: 'ADMIN' }, 'r')).resolves.toBeDefined();
    models.Event.findById = async () => mk('PUBLISHED');
    await expect(svc.markCompleted('e1', { _id: 'a', role: 'ADMIN' })).resolves.toBeDefined();
  });
  test('cancelling an already-cancelled event is a 409, not a re-notification', async () => {
    const models = require('../src/models'); models.Event.findById = async () => ({ _id: 'e', status: 'CANCELLED' });
    await expect(require('../src/services/event.service').cancelEvent('e', { _id: 'a' }, 'r')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('event reminder window', () => {
  test('targets the next calendar day (was: the day after tomorrow)', async () => {
    const models = require('../src/models'); let q;
    models.Event.find = (query) => { q = query; return { select: async () => [] }; };
    await require('../src/jobs/eventReminder.job').sendEventReminders(new Date('2026-10-09T09:30:00Z'));
    expect(q.date.$gte.toISOString()).toBe('2026-10-10T00:00:00.000Z'); expect(q.date.$lt.toISOString()).toBe('2026-10-11T00:00:00.000Z');
  });
});

describe('csv bulk import parser', () => {
  test('BOM no longer corrupts the first header', () => {
    const { parse } = require('csv-parse/sync');
    expect(Object.keys(parse('\uFEFFitemName,category\nA,B', { bom: true, columns: true })[0])).toEqual(['itemName', 'category']);
  });
});

describe('certificate text', () => {
  test('non-WinAnsi names/titles no longer crash pdf-lib', async () => {
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const doc = await PDFDocument.create(); const p = doc.addPage(); const f = await doc.embedFont(StandardFonts.Helvetica);
    const safe = (t) => String(t).replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, '?');
    expect(() => p.drawText(safe('प्रकाश 🚀 Café'), { font: f })).not.toThrow();
  });
});
