import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert, Compass, ServerCrash } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { homePath } from '../../constants/roles';

const COPY = {
  403: { icon: ShieldAlert, title: 'You do not have access to this page', text: 'Your role does not include this area. If you think this is a mistake, ask an administrator.' },
  404: { icon: Compass, title: 'Page not found', text: 'The page you are looking for does not exist or has moved.' },
  500: { icon: ServerCrash, title: 'Something went wrong', text: 'The app hit an unexpected problem. Reload the page; if it keeps happening, tell an administrator.' },
};

// Works signed-in and signed-out. For unknown URLs it renders in place (the address bar keeps the bad URL).
export default function StatusPage({ code, onRetry }) {
  const { isAuthenticated, user } = useAuth() || {};
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { icon: Icon, title, text } = COPY[code] || COPY[404];
  return (
    <main className="status-page">
      <div className="status-page__card">
        <span className="state__icon state__icon--lg"><Icon size={28} aria-hidden="true" /></span>
        <p className="status-page__code">{code}</p>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        {code === 404 && <p className="muted mono" style={{ wordBreak: 'break-all' }}>{pathname}</p>}
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          {code !== 500 && <button type="button" className="btn btn--secondary btn--md" onClick={() => navigate(-1)}>Go back</button>}
          {code === 500 && <button type="button" className="btn btn--secondary btn--md" onClick={onRetry || (() => window.location.reload())}>Reload</button>}
          <Link to={isAuthenticated && user ? homePath(user.role) : '/login'} className="btn btn--primary btn--md">{isAuthenticated && user ? 'Go to dashboard' : 'Go to sign in'}</Link>
        </div>
      </div>
    </main>
  );
}
