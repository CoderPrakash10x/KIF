import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import useDebounce from '../../hooks/useDebounce';
import { Field } from './Form';
import { ROLE_LABELS } from '../../constants/roles';

// Async user search (admin-only endpoint). Scales to any number of users: only matches are fetched.
// single: value = user|null; multiple: value = user[]
export default function UserPicker({ label, required, error, hint, value, onChange, multiple = false, placeholder = 'Search by name or email…', status = 'ACTIVE' }) {
  const id = useId();
  const root = useRef(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const q = useDebounce(text, 250).trim();
  const chosen = multiple ? value || [] : value ? [value] : [];

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setBusy(true);
    api.get('/users', { search: q || undefined, status, limit: 8 })
      .then(r => { if (alive) setResults(r.data.filter(u => !chosen.some(c => c._id === u._id))); })
      .catch(() => { if (alive) setResults([]); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, status]);

  useEffect(() => {
    const onDown = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = u => {
    onChange(multiple ? [...chosen, u] : u);
    setText('');
    setOpen(multiple);
  };
  const remove = u => onChange(multiple ? chosen.filter(c => c._id !== u._id) : null);

  return (
    <Field id={id} label={label} required={required} error={error} hint={hint}>
      <div className="picker" ref={root}>
        {chosen.length > 0 && (
          <div className="picker__chips">
            {chosen.map(u => (
              <span key={u._id} className="picker__chip">{u.name}
                <button type="button" aria-label={`Remove ${u.name}`} onClick={() => remove(u)}><X size={12} aria-hidden="true" /></button>
              </span>
            ))}
          </div>
        )}
        {(multiple || !chosen.length) && (
          <input
            id={id} className="input" value={text} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open}
            onChange={e => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          />
        )}
        {open && (multiple || !chosen.length) && (
          <div className="picker__list" role="listbox">
            {busy && !results.length && <p className="picker__empty">Searching…</p>}
            {!busy && !results.length && <p className="picker__empty">No matching users.</p>}
            {results.map(u => (
              <button key={u._id} type="button" role="option" aria-selected="false" className="picker__item" onMouseDown={e => e.preventDefault()} onClick={() => pick(u)}>
                <strong>{u.name}</strong>
                <small>{u.email} · {ROLE_LABELS[u.role] || u.role}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}
