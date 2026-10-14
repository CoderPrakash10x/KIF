import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

const UnreadContext = createContext({ count: 0, refresh: () => {} });
const POLL_MS = 60000;

// Unread notification badge: polled lightly and refreshed immediately after read/unread actions.
export function UnreadProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try { setCount((await api.get('/notifications/unread-count')).data.unread); } catch { /* badge is best-effort */ }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { setCount(0); return undefined; }
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [isAuthenticated, refresh]);

  const value = useMemo(() => ({ count, refresh, setCount }), [count, refresh]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
export const useUnread = () => useContext(UnreadContext);
