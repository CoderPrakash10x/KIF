import {
  LayoutDashboard, Building2, Cpu, DoorOpen, Package, ClipboardCheck, CalendarDays, TrendingUp, ScrollText,
  Users, User, Bell, CalendarClock, ShieldCheck,
} from 'lucide-react';
import { isAdminRole } from './roles';

// Paths are relative to the role area (e.g. /admin + /cabins).
const ADMIN_NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: null },
  { path: '/cabins', label: 'Cabins', icon: Building2, section: 'Resources', keywords: 'co-working space allotment' },
  { path: '/hardware', label: 'Hardware', icon: Cpu, section: 'Resources', keywords: 'assets equipment devices' },
  { path: '/rooms', label: 'Rooms', icon: DoorOpen, section: 'Resources', keywords: 'booking lab podcast' },
  { path: '/consumables', label: 'Consumables', icon: Package, section: 'Resources', keywords: 'inventory stock' },
  { path: '/requests', label: 'Requests', icon: ClipboardCheck, section: 'Operations', keywords: 'approvals inbox' },
  { path: '/events', label: 'Events', icon: CalendarDays, section: 'Operations', keywords: 'workshop meetup' },
  { path: '/analytics', label: 'Analytics', icon: TrendingUp, section: 'Insights', keywords: 'reports utilisation' },
  { path: '/audit-logs', label: 'Audit Logs', icon: ScrollText, section: 'Insights', keywords: 'history activity' },
  { path: '/users', label: 'Users', icon: Users, section: 'Administration', keywords: 'people roles accounts' },
  { path: '/no-dues', label: 'No-dues', icon: ShieldCheck, section: 'Administration', keywords: 'clearance exit' },
];
const MEMBER_NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: null },
  { path: '/requests', label: 'Requests', icon: ClipboardCheck, section: 'My workspace', keywords: 'cabin hardware approvals' },
  { path: '/bookings', label: 'Bookings', icon: CalendarClock, section: 'My workspace', keywords: 'room podcast lab' },
  { path: '/events', label: 'Events', icon: CalendarDays, section: 'My workspace', keywords: 'workshop meetup rsvp' },
  { path: '/no-dues', label: 'No-dues', icon: ShieldCheck, section: 'My workspace', keywords: 'clearance exit' },
];
const FOOTER = [
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/profile', label: 'Profile', icon: User },
];

export const navFor = role => (isAdminRole(role) ? ADMIN_NAV : MEMBER_NAV);
export const footerFor = () => FOOTER;

export function getPageMeta(role, pathname) {
  const sub = pathname.replace(/^\/[^/]+/, '') || '/dashboard';
  const hit = [...navFor(role), ...FOOTER].find(i => i.path === sub);
  return hit ? { title: hit.label, section: hit.section || null } : { title: 'KIF-RMS', section: null };
}
