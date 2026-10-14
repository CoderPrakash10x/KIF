import { Children } from 'react';
import { Link } from 'react-router-dom';

export function Card({ title, description, actions, children, className = '', flush = false, as: Tag = 'section' }) {
  return (
    <Tag className={`card ${className}`.trim()}>
      {(title || actions) && (
        <header className="card__head">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {description && <p className="card__desc">{description}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'card__body card__body--flush' : 'card__body'}>{children}</div>
    </Tag>
  );
}

export function StatCard({ icon: Icon, tone = 'primary', label, value, hint, to }) {
  const body = (
    <>
      <span className="stat-card__icon" data-tone={tone}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="stat-card__text">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__value">{value}</span>
        {hint && <span className="stat-card__hint">{hint}</span>}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="stat-card is-link">{body}</Link>
  ) : (
    <div className="stat-card">{body}</div>
  );
}

export function ProgressBar({ value, tone = 'primary', label, detail }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="progress">
      <div className="progress__row">
        <span className="progress__label">{label}</span>
        <span className="progress__detail">{detail ?? `${v}%`}</span>
      </div>
      <div className="progress__track" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="progress__bar" data-tone={tone} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export const StatGrid = ({ children }) => (
  <div className="stat-grid" data-count={Children.toArray(children).length}>{children}</div>
);
