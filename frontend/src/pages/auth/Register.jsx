import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, toUserMessage } from '../../lib/api';
import useFields from '../../hooks/useFields';
import Button from '../../components/ui/Button';
import { Input, Select } from '../../components/forms/Form';
import AuthLayout from './AuthLayout';

const ROLE_OPTIONS = [{ value: 'STUDENT', label: 'Student' }, { value: 'INTERN', label: 'Intern' }, { value: 'FOUNDER', label: 'Founder' }];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const f = useFields({ name: '', email: '', password: '', role: 'STUDENT', contact: '', department: '', startupName: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const v = f.values;
  const [cooldown, setCooldown] = useState(30);
  const [resendMsg, setResendMsg] = useState('');
  useEffect(() => {
    if (!done || cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [done, cooldown]);
  const resend = async () => {
    setResendMsg('');
    try { await api.post('/auth/resend-verification', { email: v.email.trim() }); setResendMsg('If the account is unverified, a new link is on its way.'); }
    catch (err) { setResendMsg(toUserMessage(err)); }
    setCooldown(30);
  };

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const next = {};
    if (v.name.trim().length < 2) next.name = 'Enter your full name.';
    if (!EMAIL_RE.test(v.email.trim())) next.email = 'Enter a valid email address.';
    if (v.password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next); setFormError('');
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const body = { name: v.name.trim(), email: v.email.trim(), password: v.password, role: v.role };
      ['contact', 'department', 'startupName'].forEach(k => { if (v[k].trim()) body[k] = v[k].trim(); });
      await api.post('/auth/register', body);
      setDone(true);
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setFormError(toUserMessage(err));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <AuthLayout title="Check your inbox" footer={<Link to="/login">Back to sign in</Link>}>
        <div className="notice notice--info" role="status">
          <span>We sent a verification link to <strong>{v.email.trim()}</strong>. Open it to verify your email, then sign in. Didn't get it? Check your spam folder.</span>
        </div>
        <div className="form-actions" style={{ marginTop: 16, alignItems: 'center' }}>
          <Button variant="secondary" disabled={cooldown > 0} onClick={resend}>{cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}</Button>
        </div>
        {resendMsg && <p className="muted" role="status" style={{ marginTop: 8 }}>{resendMsg}</p>}
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Create your account" subtitle="Students, interns and founders can self-register." footer={<>Already registered? <Link to="/login">Sign in</Link></>}>
      <form className="login__form" onSubmit={submit} noValidate aria-label="Register">
        {formError && <p className="notice notice--error" role="alert">{formError}</p>}
        <Input label="Full name" required autoComplete="name" {...f.input('name')} error={errors.name} />
        <Input label="Email" type="email" required autoComplete="email" {...f.input('email')} error={errors.email} />
        <Input label="Password" type="password" required autoComplete="new-password" hint="At least 8 characters." {...f.input('password')} error={errors.password} />
        <Select label="I am a" required options={ROLE_OPTIONS} value={v.role} onChange={e => f.set('role', e.target.value)} error={errors.role} />
        {v.role === 'FOUNDER' && <Input label="Startup name" {...f.input('startupName')} error={errors.startupName} />}
        <Input label="Department" {...f.input('department')} error={errors.department} />
        <Input label="Contact number" type="tel" autoComplete="tel" {...f.input('contact')} error={errors.contact} />
        <Button type="submit" variant="primary" size="lg" loading={busy} className="btn--block">Create account</Button>
      </form>
    </AuthLayout>
  );
}
