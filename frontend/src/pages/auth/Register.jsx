import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api, toUserMessage } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import useFields from '../../hooks/useFields';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/ui/Button';
import { ErrorState } from '../../components/common/Feedback';
import { Field, Input, Select, Textarea } from '../../components/forms/Form';
import AuthLayout from './AuthLayout';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLE_LABEL = { STUDENT: 'Student', INTERN: 'Intern', FOUNDER: 'Founder' };
const STEPS = ['Your details', 'Verify email', 'Awaiting approval'];

function Stepper({ step }) {
  return (
    <ol className="stepper" aria-label="Registration progress">
      {STEPS.map((label, i) => (
        <li key={label} className={`stepper__item ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`} aria-current={i === step ? 'step' : undefined}>
          <span className="stepper__dot">{i < step ? <Check size={14} aria-hidden="true" /> : i + 1}</span>
          <span className="stepper__label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

// Registration → e-mail OTP → pending Super Admin approval. Verification never grants access by itself.
export default function Register() {
  const toast = useToast();
  const options = useApi(() => api.get('/auth/registration-options'), []);
  const f = useFields({ name: '', college: '', department: '', branch: '', rollNumber: '', email: '', password: '', role: 'STUDENT', purpose: '', contact: '', startupName: '' });
  const v = f.values;
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [wait, setWait] = useState(0); // resend countdown (seconds)
  const [expiry, setExpiry] = useState(10);
  const otpRef = useRef(null);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setInterval(() => setWait(w => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (step === 1) otpRef.current?.focus(); }, [step]);

  const validate = () => {
    const e = {};
    if (v.name.trim().length < 2) e.name = 'Enter your full name.';
    if (!v.college) e.college = 'Select your college.';
    if (v.department.trim().length < 2) e.department = 'Enter your department.';
    if (v.branch.trim().length < 2) e.branch = 'Enter your branch.';
    if (!v.rollNumber.trim()) e.rollNumber = 'Enter your roll number.';
    if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address.';
    if (v.password.length < 8) e.password = 'Use at least 8 characters.';
    return e;
  };

  const applyServerState = data => {
    setWait(data?.resendAfterSeconds ?? 60);
    if (data?.expiresInMinutes) setExpiry(data.expiresInMinutes);
  };

  const submitDetails = async e => {
    e.preventDefault();
    if (busy) return;
    const local = validate();
    setErrors(local); setFormError('');
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const body = { name: v.name, college: v.college, department: v.department, branch: v.branch, rollNumber: v.rollNumber, email: v.email, password: v.password, role: v.role };
      ['purpose', 'contact', 'startupName'].forEach(k => { if (v[k].trim()) body[k] = v[k]; });
      const res = await api.post('/auth/register', body);
      applyServerState(res.data);
      setOtp(''); setOtpError('');
      setStep(1);
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setFormError(toUserMessage(err));
    } finally { setBusy(false); }
  };

  const verify = async e => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(otp)) { setOtpError('Enter the 6-digit code from your email.'); return; }
    setBusy(true); setOtpError('');
    try {
      await api.post('/auth/verify-otp', { email: v.email.trim(), otp });
      setStep(2);
    } catch (err) {
      setOtpError(toUserMessage(err)); // keep the entered registration data; only the code is retried
      setOtp('');
      otpRef.current?.focus();
    } finally { setBusy(false); }
  };

  const resend = async () => {
    if (busy || wait > 0) return;
    setBusy(true); setOtpError('');
    try {
      const res = await api.post('/auth/resend-otp', { email: v.email.trim() });
      applyServerState(res.data);
      toast.info('If the address can be verified, a new code is on its way.');
    } catch (err) { setOtpError(toUserMessage(err)); } finally { setBusy(false); }
  };

  if (options.error && !options.data) {
    return <AuthLayout title="Create your account"><ErrorState title="Registration is unavailable" description={toUserMessage(options.error)} onRetry={options.reload} /></AuthLayout>;
  }
  const colleges = options.data?.data?.colleges || [];
  const roles = options.data?.data?.roles || Object.keys(ROLE_LABEL);

  if (step === 2) {
    return (
      <AuthLayout title="Almost there" footer={<Link to="/login">Back to sign in</Link>} wide>
        <Stepper step={2} />
        <div className="success-panel" role="status">
          <p className="notice notice--info">Email verified successfully. Your account is awaiting Super Admin approval.</p>
          <p className="muted">You cannot sign in until a Super Admin has reviewed your details ({v.college}, roll {v.rollNumber}). We will email you at <strong>{v.email}</strong> once a decision is made.</p>
        </div>
      </AuthLayout>
    );
  }

  if (step === 1) {
    return (
      <AuthLayout title="Verify your email" subtitle={`We sent a 6-digit code to ${v.email}. It expires in ${expiry} minutes.`}
        footer={<button type="button" className="link-action" onClick={() => { setStep(0); setOtpError(''); }}>← Change details</button>} wide>
        <Stepper step={1} />
        <form className="login__form" onSubmit={verify} noValidate aria-label="Verify email">
          <Field id="otp" label="Verification code" required error={otpError}>
            <input
              id="otp" ref={otpRef} className="input otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" aria-invalid={otpError ? true : undefined}
              aria-describedby={otpError ? 'otp-err' : undefined}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={otp.length !== 6} className="btn--block">Verify Email</Button>
          <div className="otp-row">
            <span className="muted" aria-live="polite">{wait > 0 ? `You can request a new code in ${wait}s` : 'Did not get the code?'}</span>
            <Button size="sm" onClick={resend} disabled={wait > 0 || busy}>Resend OTP</Button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Students, interns and founders can self-register. A Super Admin approves every account." footer={<>Already registered? <Link to="/login">Sign in</Link></>} wide>
      <Stepper step={0} />
      <form className="login__form" onSubmit={submitDetails} noValidate aria-label="Register">
        {formError && <p className="notice notice--error" role="alert">{formError}</p>}
        <div className="form-grid">
          <Input label="Full name" required wrapperClass="span-2" autoComplete="name" {...f.input('name')} error={errors.name} />
          <Select label="College" required wrapperClass="span-2" placeholder={options.loading ? 'Loading…' : 'Select your college'} options={colleges} value={v.college} onChange={e => f.set('college', e.target.value)} error={errors.college} />
          <Input label="Department" required {...f.input('department')} error={errors.department} />
          <Input label="Branch" required {...f.input('branch')} error={errors.branch} />
          <Input label="Roll number" required {...f.input('rollNumber')} error={errors.rollNumber} />
          <Select label="I am a" required options={roles.map(r => ({ value: r, label: ROLE_LABEL[r] || r }))} value={v.role} onChange={e => f.set('role', e.target.value)} error={errors.role} hint="Final access is decided at approval." />
          <Input label="Email" type="email" required wrapperClass="span-2" autoComplete="email" {...f.input('email')} error={errors.email} />
          <Input label="Password" type="password" required wrapperClass="span-2" autoComplete="new-password" hint="At least 8 characters." {...f.input('password')} error={errors.password} />
          {v.role === 'FOUNDER' && <Input label="Startup name" wrapperClass="span-2" {...f.input('startupName')} error={errors.startupName} />}
          <Input label="Contact number" type="tel" wrapperClass="span-2" autoComplete="tel" hint="Optional." {...f.input('contact')} error={errors.contact} />
          <Textarea label="Purpose" wrapperClass="span-2" rows={2} hint="Optional. What do you plan to use KIF-RMS for?" {...f.input('purpose')} error={errors.purpose} />
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={options.loading} className="btn--block">Send verification code</Button>
      </form>
    </AuthLayout>
  );
}
