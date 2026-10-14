import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Badge from '../ui/Badge';
import { EmptyState } from './Feedback';
import { useBase } from '../../context/AuthContext';
import { dayOfMonth, fmtShortDate, fmtTimeRange, monthOf, timeAgo, titleCase } from '../../utils/format';
import { TYPE_LABEL, resourceLabel } from '../../utils/request';

export function ViewAll({ to, label = 'View all' }) {
  const base = useBase();
  return <Link to={`${base}${to}`} className="link-action">{label}<ArrowRight size={14} aria-hidden="true" /></Link>;
}

export function RequestRows({ requests, showRequester = true, review = false }) {
  const base = useBase();
  if (!requests.length) return <EmptyState compact title="Nothing here" description="No requests to show." />;
  return (
    <ul className="rows">
      {requests.map(r => (
        <li key={r._id} className="row">
          <div className="row__main">
            <p className="row__title"><span className="mono">{r.requestNumber}</span> · {resourceLabel(r)}</p>
            <p className="row__sub">{showRequester && r.requestedBy?.name ? `${r.requestedBy.name} · ` : ''}{TYPE_LABEL[r.type]} · {fmtShortDate(r.createdAt)}</p>
          </div>
          <Badge status={r.status} />
          {review && <Link to={`${base}/requests?q=${r.requestNumber}`} className="btn btn--secondary btn--sm">Review</Link>}
        </li>
      ))}
    </ul>
  );
}

export function EventRows({ events }) {
  if (!events.length) return <EmptyState compact title="No upcoming events" description="Published events will appear here." />;
  return (
    <ul className="rows">
      {events.map(e => (
        <li key={e._id} className="row">
          <span className="datechip"><strong>{dayOfMonth(e.date)}</strong><small>{monthOf(e.date)}</small></span>
          <div className="row__main"><p className="row__title">{e.title}</p><p className="row__sub">{fmtTimeRange(e.startTime, e.endTime)} · {e.venue}</p></div>
        </li>
      ))}
    </ul>
  );
}

export function ActivityRows({ logs }) {
  if (!logs.length) return <EmptyState compact title="No activity yet" />;
  return (
    <ul className="rows rows--timeline">
      {logs.map(l => (
        <li key={l._id} className="row">
          <span className="timeline-dot" aria-hidden="true" />
          <div className="row__main"><p className="row__title">{titleCase(l.action)}</p><p className="row__sub">{l.performedBy?.name || 'System'} · {titleCase(l.module)}</p></div>
          <span className="row__time">{timeAgo(l.timestamp)}</span>
        </li>
      ))}
    </ul>
  );
}
