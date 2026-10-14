import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { homePath } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Splash } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import { Field } from '../../components/forms/Form';
import { toUserMessage } from '../../lib/api';
import AuthLayout from './AuthLayout';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { isAuthenticated, booting, user, login, notice, clearNotice } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthenticated && !busy) return <Navigate to={homePath(user.role)} replace />;
  if (booting) return <Splash label="Loading" />;

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const next = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next); setFormError(''); clearNotice();
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const u = await login({ email, password });
      toast.success(`Signed in as ${u.name}.`);
      // Land in the role's own area; honour a deep link only if it belongs to that area.
      const from = location.state?.from;
      const base = homePath(u.role).replace(/\/dashboard$/, '');
      navigate(from && from.startsWith(`${base}/`) ? from : homePath(u.role), { replace: true });
    } catch (err) {
      setFormError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Use your KIF account to continue."
      footer={<><Link to="/register">Create an account</Link><Link to="/forgot-password">Forgot password?</Link></>}>
      <form className="login__form" onSubmit={submit} noValidate aria-label="Sign in">
        {(formError || notice) && <p className="notice notice--error" role="alert">{formError || notice}</p>}
        <Field id="login-email" label="Email" required error={errors.email}>
          <div className="input-icon">
            <Mail size={16} aria-hidden="true" />
            <input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@kif.org"
              aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? 'login-email-err' : undefined} />
          </div>
        </Field>
        <Field id="login-password" label="Password" required error={errors.password}>
          <div className="input-icon">
            <Lock size={16} aria-hidden="true" />
            <input id="login-password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
              aria-invalid={errors.password ? true : undefined} aria-describedby={errors.password ? 'login-password-err' : undefined} />
            <button type="button" className="input-icon__toggle" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
              {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={busy} className="btn--block">Sign in</Button>
      </form>
    </AuthLayout>
  );
}