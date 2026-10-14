// An account may use the application only when ALL of these hold:
//   1. e-mail verified   2. registration approved   3. status ACTIVE (not deactivated/rejected/pending)
// Legacy users created before the approval workflow have no `approvalStatus`; they count as approved.
const BLOCKING = {
  DEACTIVATED: { http: 403, code: 'ACCOUNT_DEACTIVATED', message: 'Your account has been deactivated. Contact an administrator.' },
  REJECTED: { http: 403, code: 'ACCOUNT_REJECTED', message: 'Your registration was not approved. Contact an administrator.' },
};

function accountGate(user) {
  if (!user) return { http: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' };
  if (user.status === 'DEACTIVATED') return BLOCKING.DEACTIVATED;
  if (user.status === 'REJECTED' || user.approvalStatus === 'REJECTED') return BLOCKING.REJECTED;
  if (!user.emailVerified) {
    return { http: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email with the code we sent before signing in.' };
  }
  if (user.approvalStatus === 'PENDING' || user.status === 'PENDING_APPROVAL') {
    return { http: 403, code: 'ACCOUNT_PENDING_APPROVAL', message: 'Your email is verified. Your account is awaiting Super Admin approval.' };
  }
  if (user.status === 'PENDING_VERIFICATION') {
    return { http: 403, code: 'ACCOUNT_PENDING_APPROVAL', message: 'Your account is not active yet. Contact an administrator.' };
  }
  return null; // ACTIVE (or EXITED, which keeps its previous access for certificates) and approved
}

module.exports = { accountGate };
