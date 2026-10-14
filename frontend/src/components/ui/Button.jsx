export default function Button({
  variant = 'secondary', size = 'md', icon: Icon, loading = false, disabled, children,
  className = '', type = 'button', ...rest
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${className}`.trim()}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = '', size = 18, ...rest }) {
  return (
    <button type="button" className={`icon-btn ${className}`.trim()} aria-label={label} title={label} {...rest}>
      <Icon size={size} aria-hidden="true" />
    </button>
  );
}
