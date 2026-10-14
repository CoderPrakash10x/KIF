import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button from '../ui/Button';

const stack = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, description, size = 'md', children, footer, dismissible = true }) {
  const panel = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const token = Symbol('modal');
    const previous = document.activeElement;
    stack.push(token);
    document.body.classList.add('no-scroll');

    const onKey = e => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab' && panel.current) {
        const els = [...panel.current.querySelectorAll(FOCUSABLE)];
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const raf = requestAnimationFrame(() => {
      const target = panel.current?.querySelector('[data-autofocus], .modal__body input:not([disabled]), .modal__body select, .modal__body textarea') || panel.current?.querySelector('.modal__foot .btn--primary, .modal__foot .btn--danger') || panel.current;
      target?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      if (!stack.length) document.body.classList.remove('no-scroll');
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, dismissible]);

  if (!open) return null;
  return createPortal(
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget && dismissible) onClose(); }}>
      <div ref={panel} className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal__head">
          <div>
            <h2 id={titleId} className="modal__title">{title}</h2>
            {description && <p className="modal__desc">{description}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose} disabled={!dismissible}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'primary', busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      open={open} onClose={onCancel} size="sm" title={title} dismissible={!busy}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="modal__text">{message}</p>
    </Modal>
  );
}

// Standard footer for form modals: Cancel + submit bound to the form by id.
export function FormFooter({ formId, onCancel, busy, submitLabel, tone = 'primary', disabled }) {
  return (
    <>
      <Button onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button type="submit" form={formId} variant={tone} loading={busy} disabled={disabled}>{submitLabel}</Button>
    </>
  );
}
