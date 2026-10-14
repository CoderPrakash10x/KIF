import { Component, Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import CommandPalette from '../components/layout/CommandPalette';
import { ErrorState, PageSkeleton } from '../components/common/Feedback';
import { ConfirmDialog } from '../components/modals/Modal';
import { getPageMeta } from '../constants/navigation';
import { useAuth } from '../context/AuthContext';
import useMediaQuery from '../hooks/useMediaQuery';

const COLLAPSE_KEY = 'kif-rms:sidebar-collapsed';

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('[KIF-RMS] render error', error); }
  render() {
    if (this.state.failed) {
      return <div className="page"><ErrorState onRetry={() => this.setState({ failed: false })} description="This page hit an unexpected problem. Your data is safe — try again." /></div>;
    }
    return this.props.children;
  }
}

function RouteContent() {
  const { pathname } = useLocation();
  return (
    <Boundary key={pathname}>
      <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
    </Boundary>
  );
}

export default function AppShell() {
  const { logout, user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 961px)');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => { document.title = `${getPageMeta(user.role, pathname).title} · KIF-RMS`; }, [pathname, user.role]);
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(o => !o); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleNav = useCallback(() => {
    if (wide) setCollapsed(c => { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); return !c; });
    else setDrawer(o => !o);
  }, [wide]);

  const signOut = async () => { setConfirmOut(false); navigate('/login', { replace: true }); await logout(); };

  return (
    <div className={`shell ${collapsed && wide ? 'is-collapsed' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar collapsed={collapsed && wide} open={drawer} onClose={() => setDrawer(false)} onSignOut={() => setConfirmOut(true)} />
      {drawer && !wide && <div className="shell__scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
      <div className="shell__main">
        <Topbar onToggleNav={toggleNav} onSearch={() => setPalette(true)} onSignOut={() => setConfirmOut(true)} />
        <main id="main" className="shell__content" tabIndex={-1}><RouteContent /></main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ConfirmDialog open={confirmOut} title="Sign out?" message="You will need to sign in again to continue." confirmLabel="Sign out" onConfirm={signOut} onCancel={() => setConfirmOut(false)} />
    </div>
  );
}
