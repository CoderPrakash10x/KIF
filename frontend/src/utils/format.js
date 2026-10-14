import { parseISO } from './time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const monthName = i => MONTHS[((i % 12) + 12) % 12];
// Backend date-only fields arrive as UTC-midnight timestamps; read them as calendar days so the
// date never shifts with the viewer's timezone.
const asDate = iso => (/T00:00:00(\.000)?Z$/.test(iso) || iso.length === 10 ? parseISO(iso.slice(0, 10)) : new Date(iso));
export const dayOf = iso => (iso ? iso.slice(0, 10) : '');
export const fmtDate = iso => {
  if (!iso) return '—';
  const d = asDate(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const fmtShortDate = iso => {
  if (!iso) return '—';
  const d = asDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const fmtWeekday = iso => (iso ? DAYS[parseISO(iso.slice(0, 10)).getDay()] : '');
export const dayOfMonth = iso => (iso ? parseISO(iso.slice(0, 10)).getDate() : '');
export const monthOf = iso => (iso ? MONTHS[parseISO(iso.slice(0, 10)).getMonth()] : '');

export const fmtTime = t => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const fmtTimeRange = (s, e) => `${fmtTime(s)} – ${fmtTime(e)}`;

export const fmtDateTime = ts => {
  if (!ts) return '—';
  const d = new Date(ts);
  const day = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${day}, ${fmtTime(`${d.getHours()}:${d.getMinutes()}`)}`;
};

export const timeAgo = ts => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(new Date(ts).toISOString());
};

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');

export const pluralize = (n, word, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`;
export const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

// ENUM_VALUE -> "Enum value"
export const titleCase = v => (v ? String(v).toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : '');