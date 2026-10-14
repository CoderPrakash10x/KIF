const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRegistration, rollKey, verifyOtpSchema, emailOnlySchema } = require('../../src/utils/registrationRules');
const { COLLEGES } = require('../../src/constants/colleges');

const good = {
  name: '  Asha   Verma ', college: COLLEGES[0], department: 'Computer Science', branch: 'AI & ML', rollNumber: ' 21-CS-042 ',
  email: ' Asha@Example.COM ', password: 'S3curePass!', role: 'INTERN',
};
const fields = (r) => r.error.issues.map((i) => i.path[0]).sort();

test('the college list is exactly the three approved values', () => {
  assert.deepEqual(COLLEGES, ['KIPM - College of Engineering & Technology', 'KIPM - College of Management', 'Kailash Institute of Pharmacy & Management']);
});

test('valid registration is normalised; department and branch stay separate', () => {
  const r = validateRegistration(good);
  assert.equal(r.success, true);
  assert.equal(r.data.name, 'Asha Verma');
  assert.equal(r.data.email, 'asha@example.com');
  assert.equal(r.data.rollNumber, '21-CS-042');
  assert.equal(r.data.department, 'Computer Science');
  assert.equal(r.data.branch, 'AI & ML');
  assert.equal(r.data.purpose, undefined);
});

test('every required field is enforced', () => {
  const r = validateRegistration({});
  assert.equal(r.success, false);
  assert.deepEqual(fields(r), ['branch', 'college', 'department', 'email', 'name', 'password', 'rollNumber']);
});

test('college is restricted to the approved list (case and look-alikes rejected)', () => {
  for (const c of ['KIPM', 'kipm - college of management', 'Other College', '', undefined]) {
    assert.deepEqual(fields(validateRegistration({ ...good, college: c })), ['college']);
  }
  for (const c of COLLEGES) assert.equal(validateRegistration({ ...good, college: c }).success, true);
});

test('purpose is optional: empty never blocks, long text does', () => {
  for (const purpose of [undefined, '', '   ', null]) assert.equal(validateRegistration({ ...good, purpose }).success, true);
  assert.equal(validateRegistration({ ...good, purpose: 'Use the 3D lab for my project' }).data.purpose, 'Use the 3D lab for my project');
  assert.deepEqual(fields(validateRegistration({ ...good, purpose: 'x'.repeat(501) })), ['purpose']);
});

test('roll number: trimmed, validated, and normalised for the per-college uniqueness key', () => {
  assert.deepEqual(fields(validateRegistration({ ...good, rollNumber: '   ' })), ['rollNumber']);
  assert.deepEqual(fields(validateRegistration({ ...good, rollNumber: '<script>' })), ['rollNumber']);
  assert.equal(rollKey('21-cs 042'), rollKey('21/CS.042'));
  assert.equal(rollKey('21-CS-042'), '21CS042');
});

test('users cannot self-select administrative roles', () => {
  for (const role of ['ADMIN', 'SUPER_ADMIN', 'admin', 'ROOT']) assert.deepEqual(fields(validateRegistration({ ...good, role })), ['role']);
  assert.equal(validateRegistration({ ...good, role: undefined }).data.role, 'STUDENT');
});

test('password and e-mail rules', () => {
  assert.deepEqual(fields(validateRegistration({ ...good, password: 'short' })), ['password']);
  assert.deepEqual(fields(validateRegistration({ ...good, email: 'not-an-email' })), ['email']);
});

test('startup name is kept only for founders; contact is validated when present', () => {
  assert.equal(validateRegistration({ ...good, role: 'FOUNDER', startupName: 'NeuroLeaf' }).data.startupName, 'NeuroLeaf');
  assert.equal(validateRegistration({ ...good, role: 'STUDENT', startupName: 'NeuroLeaf' }).data.startupName, undefined);
  assert.deepEqual(fields(validateRegistration({ ...good, contact: 'abc' })), ['contact']);
  assert.equal(validateRegistration({ ...good, contact: '' }).success, true);
});

test('OTP request schemas', () => {
  assert.equal(verifyOtpSchema.safeParse({ email: 'A@b.co', otp: '123456' }).data.email, 'a@b.co');
  assert.equal(verifyOtpSchema.safeParse({ email: 'a@b.co', otp: '12345' }).success, false);
  assert.equal(emailOnlySchema.safeParse({ email: 'x' }).success, false);
});
