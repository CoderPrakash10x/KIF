const test = require('node:test');
const assert = require('node:assert/strict');
const { accountGate } = require('../../src/utils/accountGate');

const u = (o) => ({ status: 'ACTIVE', emailVerified: true, approvalStatus: 'APPROVED', ...o });
const code = (user) => accountGate(user)?.code ?? null;

test('unverified account cannot authenticate', () => {
  assert.equal(code(u({ emailVerified: false, status: 'PENDING_VERIFICATION', approvalStatus: 'PENDING' })), 'EMAIL_NOT_VERIFIED');
});
test('verified but pending approval cannot access protected resources', () => {
  assert.equal(code(u({ status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' })), 'ACCOUNT_PENDING_APPROVAL');
  assert.match(accountGate(u({ status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' })).message, /awaiting Super Admin approval/);
});
test('verified + approved + active is allowed', () => assert.equal(accountGate(u()), null));
test('rejected and deactivated accounts are blocked', () => {
  assert.equal(code(u({ status: 'REJECTED', approvalStatus: 'REJECTED' })), 'ACCOUNT_REJECTED');
  assert.equal(code(u({ status: 'DEACTIVATED' })), 'ACCOUNT_DEACTIVATED');
});
test('email verified != approved != active: each is checked independently', () => {
  assert.equal(code(u({ approvalStatus: 'PENDING' })), 'ACCOUNT_PENDING_APPROVAL'); // verified+active but not approved
  assert.equal(code(u({ status: 'PENDING_VERIFICATION' })), 'ACCOUNT_PENDING_APPROVAL'); // verified+approved but not active
});
test('legacy users (no approvalStatus field) and the seeded Super Admin keep working', () => {
  const legacy = { status: 'ACTIVE', emailVerified: true };
  assert.equal(accountGate(legacy), null);
  assert.equal(accountGate({ ...legacy, role: 'SUPER_ADMIN' }), null);
});
test('no user -> unauthenticated', () => assert.equal(code(null), 'UNAUTHENTICATED'));
