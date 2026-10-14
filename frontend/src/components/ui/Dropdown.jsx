import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// `trigger(props)` renders the opener; `items` render a keyboard-friendly menu.
// The menu is portalled + fixed-positioned so scrollable tables never clip it.
export default function Dropdown({ trigger, items, align = 'right', label = 'Actions', header }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const root = useRef(null);
  const menu = useRef(null);

  const place = useCallback(() => {
    if (!root.current) return;
    const r = root.current.getBoundingClientRect();
    const height = menu.current?.offsetHeight || 220;
    const flip = r.bottom + height + 12 > window.innerHeight && r.top > height + 12;
    setPos({ top: flip ? r.top - height - 6 : r.bottom + 6, left: align === 'right' ? undefined : r.left, right: align === 'right' ? window.innerWidth - r.right : undefined });
  }, [align]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = e => { if (!root.current?.contains(e.target) && !menu.current?.contains(e.target)) close(); };
    const onKey = e => {
      if (e.key === 'Escape') { close(); root.current?.querySelector('button')?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = [...(menu.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
        const i = els.indexOf(document.activeElement);
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  const visible = items.filter(Boolean);
  if (!visible.length && !header) return null;

  return (
    <div className="dropdown" ref={root} data-no-row>
      {trigger({ 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => { setPos(null); setOpen(o => !o); } })}
      {open && createPortal(
        <div ref={menu} className="dropdown__menu" role="menu" aria-label={label} style={pos ? { top: pos.top, left: pos.left, right: pos.right } : { visibility: 'hidden', top: 0, left: 0 }}>
          {header && <div className="dropdown__header">{header}</div>}
          {visible.map(item =>
            item.divider ? (
              <div key={item.key || 'divider'} className="dropdown__divider" role="separator" />
            ) : (
              <button
                key={item.label} type="button" role="menuitem" disabled={item.disabled}
                className={`dropdown__item ${item.danger ? 'is-danger' : ''}`}
                onClick={() => { setOpen(false); item.onClick?.(); }}
              >
                {item.icon && <item.icon size={16} aria-hidden="true" />}
                {item.label}
              </button>
            ),
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
