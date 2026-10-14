// Real authentication against the KIF-RMS backend (JWT access token + httpOnly refresh cookie).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, restoreSession, setAccessToken, setSessionLostHandler, ApiError } from '../lib/api';
import { areaOf, basePath, hasPermission } from '../constants/roles';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true); // true until we know whether a session exists
  const [notice, setNotice] = useState(null);
  const userRef = useRef(null);
  userRef.current = user;

  const clear = useCallback((message) => {
    setAccessToken(null);
    setUser(null);
    if (message) setNotice(message);
  }, []);

  // Session restoration: the refresh cookie (if any) yields a fresh access token + the current user.
  useEffect(() => {
    let alive = true;
    restoreSession()
      .then(u => { if (alive) setUser(u); })
      .catch(() => {})
      .finally(() => { if (alive) setBooting(false); });
    setSessionLostHandler(() => { if (userRef.current) clear('Your session has expired. Please sign in again.'); });
    return () => { alive = false; };
  }, [clear]);

  const login = useCallback(async ({ email, password }) => {
    const res = await api.post('/auth/login', { email: email.trim(), password });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setNotice(null);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch (e) { if (!(e instanceof ApiError)) throw e; }
    clear();
  }, [clear]);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data);
    return res.data;
  }, []);

  const value = useMemo(() => ({
    user, booting, isAuthenticated: !!user, area: user ? areaOf(user.role) : null, base: user ? basePath(user.role) : '',
    login, logout, refreshUser, setUser, notice, clearNotice: () => setNotice(null),
  }), [user, booting, login, logout, refreshUser, notice]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const useBase = () => useContext(AuthContext).base;

export function useCan() {
  const { user } = useAuth();
  return useCallback(permission => !!user && hasPermission(user.role, permission), [user]);
}
