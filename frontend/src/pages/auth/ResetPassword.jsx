import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, toUserMessage } from '../../lib/api';
import Button from '../../components/ui/Button';
import { Input } from '../../components/forms/Form';
import AuthLayout from './AuthLayout';

export default function ResetPassword() {
  const token = new URLSearchParams(useLocation().search).get('token');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const next = {};
    if (pw.length < 8) next.password = 'Use at least 8 characters.';
    if (confirm !== pw) next.confirm = 'Passwords do not match.';
    setErrors(next); setFormError('');
    if (Object.keys(next).length) return;
    setBusy(true);
    try { await api.post('/auth/reset-password', { token, newPassword: pw }); setDone(true); } catch (err) { setFormError(toUserMessage(err)); } finally { setBusy(false); }
  };

  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/login">Back to sign in</Link>}>
      {!token ? <p className="notice notice--error" role="alert">This reset link is incomplete. Request a new one.</p>
        : done ? <p className="notice notice--info" role="status">Password updated. You can now sign in.</p> : (
          <form className="login__form" onSubmit={submit} noValidate aria-label="Reset password">
            {formError && <p className="notice notice--error" role="alert">{formError}</p>}
            <Input label="New password" type="password" required autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} error={errors.password} />
            <Input label="Confirm password" type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} />
            <Button type="submit" variant="primary" size="lg" loading={busy} className="btn--block">Update password</Button>
          </form>
        )}
    </AuthLayout>
  );
}
