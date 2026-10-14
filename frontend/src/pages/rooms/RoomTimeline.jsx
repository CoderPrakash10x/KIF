import { ChevronLeft, ChevronRight } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Button, { IconButton } from '../../components/ui/Button';
import { Plus, Ban, Users as UsersIcon } from 'lucide-react';
import { dayOfMonth, fmtDate, fmtTimeRange, fmtWeekday, pluralize } from '../../utils/format';
import { addDays, fromMin, nowMinutes, toMin, todayISO } from '../../utils/time';

export const OPEN = '09:00';
export const CLOSE = '20:00';
const SHOWN = ['PENDING', 'APPROVED', 'ACTIVE', 'COMPLETED'];

// Normalised booking: { id, date, start, end, status, purpose, who, mine, maintenance, attendees }
export const normBooking = b => ({
  id: b._id, date: (b.date || '').slice(0, 10), start: b.startTime, end: b.endTime, status: b.status, purpose: b.purpose,
  who: b.bookedBy?.name, mine: b.mine, maintenance: !!b.isMaintenanceBlock, attendees: b.attendees,
});

// Walk the open hours and interleave bookings with the free gaps between them.
export function buildSegments(bookings, date) {
  const today = todayISO();
  const nowRounded = Math.ceil(nowMinutes() / 30) * 30;
  const items = bookings.filter(b => b.date === date && (b.maintenance || SHOWN.includes(b.status))).sort((a, b) => toMin(a.start) - toMin(b.start));
  const out = [];
  const gap = (from, to) => {
    if (to <= from) return;
    const cut = date < today ? to : date === today ? Math.min(to, Math.max(from, nowRounded)) : from;
    if (cut > from) out.push({ kind: 'past', start: fromMin(from), end: fromMin(cut) });
    if (to > cut) out.push({ kind: 'open', start: fromMin(cut), end: fromMin(to) });
  };
  let cursor = toMin(OPEN);
  items.forEach(b => { gap(cursor, toMin(b.start)); out.push({ kind: 'booking', booking: b }); cursor = Math.max(cursor, toMin(b.end)); });
  gap(cursor, toMin(CLOSE));
  return out;
}

export function WeekStrip({ weekStart, date, onDate, onShift, load }) {
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="week" role="group" aria-label="Choose a date">
      <IconButton icon={ChevronLeft} label="Previous week" onClick={() => onShift(-1)} disabled={weekStart <= today} />
      <div className="week__days">
        {days.map(d => {
          const l = load ? load(d) : null;
          return (
            <button key={d} type="button" className={`week__day ${d === date ? 'is-active' : ''}`} aria-pressed={d === date} onClick={() => onDate(d)} aria-label={`${fmtDate(d)}${l ? `, ${pluralize(l.count, 'booking')}` : ''}`}>
              <span className="week__dow">{d === today ? 'Today' : fmtWeekday(d)}</span>
              <span className="week__num">{dayOfMonth(d)}</span>
              {l && <><span className="week__bar" aria-hidden="true"><i style={{ width: `${l.pct}%` }} /></span><span className="week__count">{l.count ? `${l.count} booked` : 'Free'}</span></>}
            </button>
          );
        })}
      </div>
      <IconButton icon={ChevronRight} label="Next week" onClick={() => onShift(1)} />
    </div>
  );
}

const LABEL = { APPROVED: 'Booked', ACTIVE: 'Booked', PENDING: 'Pending', COMPLETED: 'Completed' };

// `renderActions(booking)` and `showName(booking)` let each page decide what it may reveal / do.
export function Timeline({ segments, canBook, canBlock, onBook, onBlock, renderActions, showName }) {
  const render = (s, i) => {
    if (s.kind === 'booking') {
      const b = s.booking;
      const state = b.maintenance ? 'Blocked' : LABEL[b.status] || b.status;
      const detail = b.maintenance || b.mine || showName;
      return (
        <li key={b.id}>
          <div className="slot slot--booking" data-state={b.maintenance ? 'Blocked' : b.status === 'ACTIVE' ? 'Approved' : titleState(b.status)}>
            <div className="slot__time">{fmtTimeRange(b.start, b.end)}</div>
            <div className="slot__main">
              <div className="slot__title"><Badge status={state} upper>{state}</Badge><strong>{detail ? b.purpose || 'Reserved' : 'Reserved'}</strong></div>
              {!b.maintenance && <p className="slot__sub"><UsersIcon size={14} aria-hidden="true" /> {b.mine ? 'You' : showName ? b.who || '—' : 'Another member'}{b.attendees ? ` · ${pluralize(b.attendees, 'attendee')}` : ''}</p>}
            </div>
            <div className="slot__actions">{renderActions?.(b)}</div>
          </div>
        </li>
      );
    }
    const mins = toMin(s.end) - toMin(s.start);
    if (s.kind === 'past') return <li key={`p${i}`}><div className="slot slot--past"><div className="slot__time">{fmtTimeRange(s.start, s.end)}</div><div className="slot__main"><span className="muted">Past</span></div></div></li>;
    return (
      <li key={`o${i}`}>
        <div className="slot slot--open">
          <div className="slot__time">{fmtTimeRange(s.start, s.end)}</div>
          <div className="slot__main"><div className="slot__title"><Badge status="Open slot" upper>Open slot</Badge><span className="muted">{mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins} min`} available</span></div></div>
          <div className="slot__actions">
            {canBook && <Button size="sm" variant="primary" icon={Plus} onClick={() => onBook(s.start, fromMin(Math.min(toMin(s.end), toMin(s.start) + 60)))}>Book this slot</Button>}
            {canBlock && <Button size="sm" icon={Ban} onClick={() => onBlock(s.start, s.end)}>Block</Button>}
          </div>
        </div>
      </li>
    );
  };
  return <ol className="slots">{segments.map(render)}</ol>;
}
const titleState = s => ({ PENDING: 'Pending', APPROVED: 'Approved', COMPLETED: 'Completed' }[s] || s);
