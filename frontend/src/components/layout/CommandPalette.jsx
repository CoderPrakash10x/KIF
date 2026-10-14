import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { footerFor, navFor } from '../../constants/navigation';
import { isAdminRole } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import useDebounce from '../../hooks/useDebounce';

const norm = s => String(s || '').toLowerCase();

// Searches pages locally and (for admins) resources on the server, so it scales with data size.
export default function CommandPalette({ open, onClose }) {
  const { user, base } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState([]);
  const inputRef = useRef(null);
  const previous = useRef(null);
  const q = useDebounce(query, 250).trim();

  useEffect(() => {
    if (open) {
      previous.current = document.activeElement;
      setQuery(''); setActive(0); setRemote([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (previous.current && document.contains(previous.current)) previous.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open || q.length < 2) { setRemote([]); return undefined; }
    let alive = true;
    const admin = isAdminRole(user.role);
    const calls = admin
      ? [
        api.get('/cabins', { search: q, limit: 4 }).then(r => r.data.map(c => ({ id: c._id, group: 'Cabins', label: `Cabin ${c.cabinNumber}`, hint: c.status, to: `${base}/cabins?q=${encodeURIComponent(c.cabinNumber)}` }))),
        api.get('/hardware', { search: q, limit: 4 }).then(r => r.data.map(h => ({ id: h._id, group: 'Hardware', label: h.itemName, hint: h.assetTag || h.category, to: `${base}/hardware?q=${encodeURIComponent(h.itemName)}` }))),
        api.get('/users', { search: q, limit: 4 }).then(r => r.data.map(u => ({ id: u._id, group: 'Users', label: u.name, hint: u.email, to: `${base}/users?q=${encodeURIComponent(u.email)}` }))),
        api.get('/requests', { search: q, limit: 4 }).then(r => r.data.map(x => ({ id: x._id, group: 'Requests', label: `${x.requestNumber} · ${x.type}`, hint: x.status, to: `${base}/requests?q=${encodeURIComponent(x.requestNumber)}` }))),
      ]
      : [api.get('/requests/my-requests', { search: q, limit: 4 }).then(r => r.data.map(x => ({ id: x._id, group: 'My requests', label: `${x.requestNumber} · ${x.type}`, hint: x.status, to: `${base}/requests?q=${encodeURIComponent(x.requestNumber)}` })))];
    Promise.allSettled(calls).then(rs => { if (alive) setRemote(rs.flatMap(r => (r.status === 'fulfilled' ? r.value : []))); });
    return () => { alive = false; };
  }, [q, open, user.role, base]);

  const results = useMemo(() => {
    const s = norm(query).trim();
    const pages = [...navFor(user.role), ...footerFor()].map(i => ({ id: i.path, group: 'Pages', label: i.label, hint: i.section || 'Account', to: `${base}${i.path}`, search: `${i.label} ${i.keywords || ''}` }));
    const matched = s ? pages.filter(p => norm(`${p.label} ${p.search}`).includes(s)) : pages;
    return [...matched, ...remote].slice(0, 20);
  }, [query, remote, user.role, base]);

  useEffect(() => setActive(0), [query]);
  if (!open) return null;

  const go = r => { onClose(); navigate(r.to); };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === 'Tab') e.preventDefault();
  };

  let lastGroup = null;
  return createPortal(
    <div className="modal-overlay modal-overlay--top" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search KIF-RMS" onKeyDown={onKey}>
        <div className="palette__input">
          <Search size={18} aria-hidden="true" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pages, resources, requests, people…"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[active] ? `pal-${active}` : undefined} aria-label="Search" />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette__list" id="palette-list" role="listbox">
          {results.map((r, i) => {
            const header = r.group !== lastGroup;
            lastGroup = r.group;
            return (
              <li key={`${r.group}-${r.id}`} role="presentation">
                {header && <p className="palette__group">{r.group}</p>}
                <div id={`pal-${i}`} role="option" aria-selected={i === active} className={`palette__item ${i === active ? 'is-active' : ''}`} onMouseMove={() => setActive(i)} onMouseDown={e => { e.preventDefault(); go(r); }}>
                  <span className="palette__label">{r.label}</span><span className="palette__hint">{r.hint}</span>
                  {i === active && <CornerDownLeft size={14} aria-hidden="true" />}
                </div>
              </li>
            );
          })}
          {!results.length && <li className="palette__empty" role="presentation">No results for “{query}”.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
