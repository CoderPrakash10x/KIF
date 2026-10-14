import { Link } from 'react-router-dom';
import { ShieldAlert, Compass } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const COPY = {
  403: { icon: ShieldAlert, title: 'You do not have access to this page', text: 'Your role does not include this area. If you think this is a mistake, ask an administrator.' },
  404: { icon: Compass, title: 'Page not found', text: 'The page you are looking for does not exist or has moved.' },
};

export default function StatusPage({ code }) {
  const { isAuthenticated } = useAuth();
  const { icon: Icon, title, text } = COPY[code];
  return (
    <main className="status-page">
      <div className="status-page__card">
        <span className="state__icon state__icon--lg"><Icon size={28} aria-hidden="true" /></span>
        <p className="status-page__code">{code}</p>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn btn--primary btn--md">{isAuthenticated ? 'Go to dashboard' : 'Go to sign in'}</Link>
      </div>
    </main>
  );
}
