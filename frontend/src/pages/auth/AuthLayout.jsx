import AuthArt from './AuthArt';

// Shared split layout for the public auth pages (login, register, password reset, …).
export default function AuthLayout({ title, subtitle, children, footer, wide = false }) {
  return (
    <div className="login">
      <section className="login__intro" aria-label="About KIF-RMS">
        <AuthArt />
        <span className="brand-mark brand-mark--lg" aria-hidden="true">K</span>
        <h1>KIF-RMS</h1>
        <p className="login__lead">One place to book rooms, allot cabins, issue hardware and approve requests at KIPM Innovation Foundation.</p>
        <ul className="login__points">
          <li>Know what is free, what is taken and what needs a decision.</li>
          <li>Every approval and change is written to an audit trail.</li>
          <li>Access follows your role: admin, founder, intern or student.</li>
        </ul>
      </section>
      <section className="login__panel">
        <div className={`login__card ${wide ? "login__card--wide" : ""}`}>
          <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
          {children}
          {footer && <p className="auth-footer">{footer}</p>}
        </div>
      </section>
    </div>
  );
}
