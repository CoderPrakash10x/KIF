import { NavLink } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { footerFor, navFor } from '../../constants/navigation';
import { ROLE_LABELS } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { useUnread } from '../../context/UnreadContext';

function NavItem({ to, label, icon: Icon, collapsed, badge }) {
  return (
    <NavLink to={to} end title={collapsed ? label : undefined} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
      <Icon size={18} aria-hidden="true" />
      <span className="nav-item__label">{label}</span>
      {badge > 0 && <span className="nav-item__badge" aria-label={`${badge} unread`}>{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, open, onClose, onSignOut }) {
  const { user, base } = useAuth();
  const { count } = useUnread();
  const items = navFor(user.role);
  const sections = [];
  items.forEach(item => {
    if (!item.section) return;
    let group = sections.find(s => s.name === item.section);
    if (!group) sections.push((group = { name: item.section, items: [] }));
    group.items.push(item);
  });
  const home = items.find(i => !i.section);

  return (
    <aside className={`sidebar ${open ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`} aria-label="Sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true">K</span>
        <span className="sidebar__brand-text"><strong>KIF-RMS</strong><small>{ROLE_LABELS[user.role]} workspace</small></span>
        <button type="button" className="icon-btn sidebar__close" aria-label="Close navigation" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <nav className="sidebar__nav" aria-label="Primary">
        {home && <NavItem to={`${base}${home.path}`} label={home.label} icon={home.icon} collapsed={collapsed} />}
        {sections.map(s => (
          <div key={s.name} className="nav-group">
            <p className="nav-group__title">{s.name}</p>
            {s.items.map(i => <NavItem key={i.path} to={`${base}${i.path}`} label={i.label} icon={i.icon} collapsed={collapsed} />)}
          </div>
        ))}
      </nav>
      <div className="sidebar__foot">
        {footerFor().map(i => <NavItem key={i.path} to={`${base}${i.path}`} label={i.label} icon={i.icon} collapsed={collapsed} badge={i.path === '/notifications' ? count : 0} />)}
        <button type="button" className="nav-item nav-item--button" onClick={onSignOut} title={collapsed ? 'Sign out' : undefined}>
          <LogOut size={18} aria-hidden="true" /><span className="nav-item__label">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
