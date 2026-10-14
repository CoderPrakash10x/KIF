import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, toUserMessage } from '../../lib/api';
import AuthLayout from './AuthLayout';

export default function VerifyEmail() {
  const token = new URLSearchParams(useLocation().search).get('token');
  const [state, setState] = useState({ status: token ? 'loading' : 'error', message: token ? '' : 'This verification link is incomplete.' });

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    api.post('/auth/verify-email', { token })
      .then(r => { if (alive) setState({ status: 'ok', message: r.message || 'Email verified.' }); })
      .catch(e => { if (alive) setState({ status: 'error', message: toUserMessage(e) }); });
    return () => { alive = false; };
  }, [token]);

  return (
    <AuthLayout title="Email verification" footer={<Link to="/login">Go to sign in</Link>}>
      {state.status === 'loading' && <p className="muted" role="status">Verifying your email…</p>}
      {state.status === 'ok' && <p className="notice notice--info" role="status">{state.message}</p>}
      {state.status === 'error' && <p className="notice notice--error" role="alert">{state.message}</p>}
    </AuthLayout>
  );
}
