import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, toUserMessage } from '../../lib/api';
import Button from '../../components/ui/Button';
import { Input } from '../../components/forms/Form';
import AuthLayout from './AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError('');
    try { await api.post('/auth/forgot-password', { email: email.trim() }); setSent(true); } catch (err) { setError(toUserMessage(err)); } finally { setBusy(false); }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We will email you a reset link." footer={<Link to="/login">Back to sign in</Link>}>
      {sent ? <p className="notice notice--info" role="status">If an account exists for that email, a reset link is on its way.</p> : (
        <form className="login__form" onSubmit={submit} noValidate aria-label="Forgot password">
          <Input label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} error={error} autoComplete="email" />
          <Button type="submit" variant="primary" size="lg" loading={busy} className="btn--block">Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
