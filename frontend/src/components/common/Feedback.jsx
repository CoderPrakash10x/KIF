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
        {[0, 1, 2, 3].map(i => <Skeleton key={i} h={88} />)}
      </div>
      <Skeleton h={320} className="mt-6" />
    </div>
  );
}

export const LoadingState = ({ label = 'Loading…' }) => (
  <div className="state" role="status">
    <span className="spinner spinner--lg" aria-hidden="true" />
    <p className="state__title">{label}</p>
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
