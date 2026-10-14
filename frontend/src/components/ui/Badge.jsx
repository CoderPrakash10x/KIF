import { titleCase } from '../../utils/format';

// Keys are normalised enum/label values (lowercase, spaces). Works with backend enums directly.
const TONES = {
  green: ['free', 'available', 'open', 'approved', 'active', 'published', 'success', 'healthy', 'registered', 'attended', 'cleared', 'working', 'ready', 'open slot'],
  blue: ['occupied', 'issued', 'ongoing', 'booked', 'requested', 'inspection'],
  purple: ['reserved'],
  amber: ['maintenance', 'pending', 'under repair', 'watch', 'warning', 'expiring soon', 'waitlisted', 'returned', 'pending verification', 'in review'],
  red: ['rejected', 'damaged', 'lost', 'deactivated', 'low stock', 'low', 'failed', 'expired', 'overdue', 'blocked', 'exited'],
  gray: ['completed', 'cancelled', 'draft', 'closed', 'inactive', 'not marked', 'not attended'],
};
const TONE_OF = Object.fromEntries(Object.entries(TONES).flatMap(([tone, keys]) => keys.map(k => [k, tone])));
const LABELS = { free: 'Available', 'low': 'Low stock', 'open slot': 'Open slot' };

const key = s => String(s ?? '').toLowerCase().replace(/_/g, ' ').trim();

export default function Badge({ status, tone, children, dot = true, upper = false, className = '' }) {
  const k = key(status);
  const resolved = tone || TONE_OF[k] || 'gray';
  return (
    <span className={`badge ${upper ? 'badge--upper' : ''} ${className}`.trim()} data-tone={resolved}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children ?? LABELS[k] ?? titleCase(status)}
    </span>
  );
}
