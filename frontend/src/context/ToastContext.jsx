import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback(id => setToasts(list => list.filter(t => t.id !== id)), []);
  const push = useCallback(
    (tone, message) => {
      if (!message) return;
      counter.current += 1;
      const id = counter.current;
      setToasts(list => [...list.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: m => push('success', m),
      error: m => push('error', m),
      info: m => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map(t => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
              <Icon size={18} aria-hidden="true" />
              <span className="toast__msg">{t.message}</span>
              <button type="button" className="toast__close" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
