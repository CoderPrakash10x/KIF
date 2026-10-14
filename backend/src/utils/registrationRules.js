// Registration payload rules as a plain function. `registrationSchema.safeParse` mirrors the
// zod interface used by middleware/validation.js, so it plugs into validate(schema) unchanged.
const { COLLEGES } = require('../constants/colleges');

const SELF_SIGNUP_ROLES = ['FOUNDER', 'INTERN', 'STUDENT'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,29}$/;
const PHONE_RE = /^[+\d][\d\s-]{6,17}$/;

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v);

// Roll numbers are compared case-insensitively and without separators/spaces.
const rollKey = (roll) => String(roll).toUpperCase().replace(/[\s./_-]+/g, '');

function validateRegistration(input = {}) {
  const issues = [];
  const bad = (path, message) => issues.push({ path: [path], message });
  const v = {};

  v.name = clean(input.name);
  if (!v.name || v.name.length < 2 || v.name.length > 100) bad('name', 'Full name must be 2-100 characters');

  v.college = typeof input.college === 'string' ? input.college.trim() : input.college;
  if (!COLLEGES.includes(v.college)) bad('college', 'Select a college from the list');

  v.department = clean(input.department);
  if (!v.department || v.department.length < 2 || v.department.length > 100) bad('department', 'Department is required (2-100 characters)');
  v.branch = clean(input.branch);
  if (!v.branch || v.branch.length < 2 || v.branch.length > 100) bad('branch', 'Branch is required (2-100 characters)');

  v.rollNumber = clean(input.rollNumber);
  if (!v.rollNumber || !ROLL_RE.test(v.rollNumber)) bad('rollNumber', 'Enter a valid roll number (letters, numbers, - / . _; up to 30 characters)');

  v.email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : input.email;
  if (!v.email || v.email.length > 254 || !EMAIL_RE.test(v.email)) bad('email', 'Enter a valid email address');

  v.password = input.password;
  if (typeof v.password !== 'string' || v.password.length < 8) bad('password', 'Password must be at least 8 characters');
  else if (v.password.length > 128) bad('password', 'Password must be at most 128 characters');

  v.role = input.role === undefined || input.role === '' ? 'STUDENT' : input.role;
  if (!SELF_SIGNUP_ROLES.includes(v.role)) bad('role', 'Select Founder, Intern or Student');

  // Optional fields: empty means "not provided", never an error.
  const purpose = clean(input.purpose);
  if (purpose) { if (purpose.length > 500) bad('purpose', 'Purpose must be at most 500 characters'); else v.purpose = purpose; }
  const contact = clean(input.contact);
  if (contact) { if (!PHONE_RE.test(contact)) bad('contact', 'Enter a valid contact number'); else v.contact = contact; }
  const startup = clean(input.startupName);
  if (startup && v.role === 'FOUNDER') v.startupName = startup.slice(0, 100);

  return issues.length ? { success: false, error: { issues } } : { success: true, data: v };
}

const registrationSchema = { safeParse: validateRegistration };

const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : e);
const emailOnlySchema = {
  safeParse(input = {}) {
    const email = normEmail(input.email);
    return email && email.length <= 254 && EMAIL_RE.test(email)
      ? { success: true, data: { email } }
      : { success: false, error: { issues: [{ path: ['email'], message: 'Enter a valid email address' }] } };
  },
};
const verifyOtpSchema = {
  safeParse(input = {}) {
    const email = emailOnlySchema.safeParse(input);
    if (!email.success) return email;
    const otp = typeof input.otp === 'string' ? input.otp.trim() : String(input.otp ?? '');
    return /^\d{6}$/.test(otp)
      ? { success: true, data: { email: email.data.email, otp } }
      : { success: false, error: { issues: [{ path: ['otp'], message: 'Enter the 6-digit code from your email' }] } };
  },
};

module.exports = { emailOnlySchema, verifyOtpSchema, registrationSchema, validateRegistration, rollKey, SELF_SIGNUP_ROLES };
