import { AlertTriangle, Inbox } from 'lucide-react';
import Button from '../ui/Button';

export const Skeleton = ({ h = 16, w = '100%', className = '' }) => (
  <span className={`skeleton ${className}`.trim()} style={{ height: h, width: w }} aria-hidden="true" />
);

export function PageSkeleton() {
  return (
    <div className="page" role="status" aria-label="Loading page">
      <Skeleton h={30} w="min(260px, 60%)" />
      <Skeleton h={14} w="min(420px, 80%)" className="mt-2" />
      <div className="stat-grid mt-6">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} h={88} className="skeleton--card" />)}
      </div>
      <div className="skeleton-table mt-6" aria-hidden="true">
        <Skeleton h={42} className="skeleton--head" />
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton-table__row"><Skeleton h={14} w="18%" /><Skeleton h={14} w="34%" /><Skeleton h={14} w="14%" /><Skeleton h={22} w={64} className="skeleton--pill" /></div>)}
      </div>
    </div>
  );
}

// Branded full-screen loader. It fades in after a short delay so quick loads never flash it.
export function Splash({ label = 'Loading' }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash__mark">
        <i className="splash__ring" aria-hidden="true" />
        <i className="splash__ring splash__ring--2" aria-hidden="true" />
        <span className="brand-mark brand-mark--lg" aria-hidden="true">K</span>
      </div>
      <p className="splash__name" aria-hidden="true">KIF-RMS</p>
      <div className="splash__bar" aria-hidden="true"><i /></div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
export const LoadingState = ({ label = 'Loading…' }) => <Splash label={label} />;

// Compact placeholder for modals / small panels instead of a bare "Loading…" line.
export const ListSkeleton = ({ rows = 4 }) => (
  <div className="list-skeleton" role="status" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="list-skeleton__row">
        <Skeleton h={34} w={34} className="skeleton--round" />
        <div style={{ flex: 1, display: 'grid', gap: 6 }}><Skeleton h={12} w={`${70 - (i % 3) * 12}%`} /><Skeleton h={10} w={`${42 + (i % 2) * 14}%`} /></div>
      </div>
    ))}
  </div>
);

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false }) {
  return (
    <div className={`state ${compact ? 'state--compact' : ''}`}>
      <span className="state__icon"><Icon size={22} aria-hidden="true" /></span>
      <p className="state__title">{title}</p>
      {description && <p className="state__desc">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description = 'We could not load this page. Please try again.', onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon"><AlertTriangle size={22} aria-hidden="true" /></span>
      <p className="state__title">{title}</p>
      <p className="state__desc">{description}</p>
      {onRetry && <Button variant="primary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}