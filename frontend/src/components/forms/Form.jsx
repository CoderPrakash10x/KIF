import { useId } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export function Field({ id, label, required, error, hint, children, className = '' }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`.trim()}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
          {required && <span className="field__req" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="field__hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field__error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}

const aria = (id, error, hint) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
});

export function Input({ label, required, error, hint, className, wrapperClass, ...props }) {
  const id = useId();
  return (
    <Field id={id} label={label} required={required} error={error} hint={hint} className={wrapperClass}>
      <input id={id} className={`input ${className || ''}`.trim()} required={false} aria-required={required || undefined} {...aria(id, error, hint)} {...props} />
    </Field>
  );
}

export function Textarea({ label, required, error, hint, rows = 3, wrapperClass, ...props }) {
  const id = useId();
  return (
    <Field id={id} label={label} required={required} error={error} hint={hint} className={wrapperClass}>
      <textarea id={id} rows={rows} className="input textarea" aria-required={required || undefined} {...aria(id, error, hint)} {...props} />
    </Field>
  );
}

export function Select({ label, required, error, hint, options, placeholder, compact, wrapperClass, hideLabel, ...props }) {
  const id = useId();
  return (
    <Field id={id} label={hideLabel ? null : label} required={required} error={error} hint={hint} className={wrapperClass}>
      <div className={`select ${compact ? 'select--compact' : ''}`}>
        <select id={id} className="input" aria-label={hideLabel ? label : undefined} aria-required={required || undefined} {...aria(id, error, hint)} {...props}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map(o => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o;
            return <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>;
          })}
        </select>
        <ChevronDown size={16} className="select__chev" aria-hidden="true" />
      </div>
    </Field>
  );
}

export function Checkbox({ label, ...props }) {
  return (
    <label className="check">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search', className = '' }) {
  return (
    <div className={`search-input ${className}`.trim()}>
      <Search size={16} aria-hidden="true" />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
      {value && (
        <button type="button" className="search-input__clear" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export const FilterSelect = ({ label, value, onChange, options, allLabel }) => (
  <Select
    compact hideLabel label={label} value={value} onChange={e => onChange(e.target.value)}
    options={[{ value: '', label: allLabel || `All ${label.toLowerCase()}` }, ...options]}
  />
);
