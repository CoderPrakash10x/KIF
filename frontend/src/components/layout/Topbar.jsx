import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Search, User } from 'lucide-react';
import { getPageMeta } from '../../constants/navigation';
import { ROLE_LABELS } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { useUnread } from '../../context/UnreadContext';
import Avatar from '../ui/Avatar';
import Dropdown from '../ui/Dropdown';
import { IconButton } from '../ui/Button';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export default function Topbar({ onToggleNav, onSearch, onSignOut }) {
  const { user, base } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { count: unread } = useUnread();
  const meta = getPageMeta(user.role, pathname);

  return (
    <header className="topbar">
      <IconButton icon={Menu} label="Toggle navigation" onClick={onToggleNav} />
      <div className="topbar__title">
        <p className="topbar__crumb">
          KIPM Innovation Foundation{meta.section ? <span> / {meta.section}</span> : null}
        </p>
        <p className="topbar__page">{meta.title}</p>
      </div>
      <div className="topbar__spacer" />
      <button type="button" className="topbar__search" onClick={onSearch} aria-label="Search KIF-RMS">
        <Search size={16} aria-hidden="true" />
        <span className="topbar__search-text">Search…</span>
        <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <Link to={`${base}/notifications`} className="icon-btn topbar__bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span className="topbar__dot">{unread > 9 ? '9+' : unread}</span>}
      </Link>
      <Dropdown
        label="Account menu"
        header={<><strong>{user.name}</strong><span>{user.email}</span></>}
        trigger={props => (
          <button type="button" className="profile-btn" {...props} aria-label="Open account menu">
            <Avatar name={user.name} src={user.profilePhoto?.url} size={32} />
            <span className="profile-btn__text">
              <strong>{user.name}</strong>
              <small>{ROLE_LABELS[user.role]}</small>
            </span>
          </button>
        )}
        items={[
          { label: 'Profile', icon: User, onClick: () => navigate(`${base}/profile`) },
          { label: 'Notifications', icon: Bell, onClick: () => navigate(`${base}/notifications`) },
          { divider: true, key: 'd' },
          { label: 'Sign out', icon: LogOut, onClick: onSignOut, danger: true },
        ]}
      />
    </header>
  );
}
