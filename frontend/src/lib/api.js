// HTTP client for the KIF-RMS backend (Express + MongoDB, base path /api/v1).
//
// Auth model (matches the backend):
//  - access token: short-lived JWT, kept in MEMORY only (never localStorage)
//  - refresh token: httpOnly cookie scoped to /api/v1/auth; the browser sends it automatically
//  - on 401 the client refreshes once (single-flight), retries the original call, and only then
//    reports an expired session.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

const DEFAULT_MESSAGES = {
  0: 'Cannot reach the server. Check your connection and try again.',
  400: 'The request could not be processed. Please review your input.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'We could not find what you were looking for.',
  409: 'This change conflicts with existing data.',
  422: 'Some fields need your attention.',
  423: 'This account is temporarily locked. Try again later.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.',
};

export class ApiError extends Error {
  constructor(status = 500, message, fieldErrors = {}, code) {
    super(message || DEFAULT_MESSAGES[status] || DEFAULT_MESSAGES[500]);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

// Never show raw technical errors to people.
export const toUserMessage = error => (error instanceof ApiError ? error.message : DEFAULT_MESSAGES[500]);

// The backend reports validation problems as "field: message; other.field: message".
function parseFieldErrors(message = '') {
  const out = {};
  message.split(';').forEach(part => {
    const m = part.match(/^\s*([\w.[\]]+):\s*(.+)$/);
    if (m) out[m[1].split('.')[0]] = m[2].trim();
  });
  return out;
}

let accessToken = null;
let refreshing = null;
let onSessionLost = () => {};
export const setAccessToken = token => { accessToken = token; };
export const getAccessToken = () => accessToken;
export const setSessionLostHandler = fn => { onSessionLost = fn; };

function buildUrl(path, params) {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin); // works for absolute and same-origin '/api/v1' bases
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url.toString();
}

// In-flight request counter -> drives the thin top progress bar. Background polling is excluded.
let inflight = 0;
const busySubs = new Set();
const bump = n => { inflight += n; busySubs.forEach(f => f()); };
export const subscribeBusy = f => { busySubs.add(f); return () => busySubs.delete(f); };
export const getBusy = () => inflight;

async function send(path, opts) {
  const track = !path.startsWith('/notifications');
  if (track) bump(1);
  try { return await sendInner(path, opts); } finally { if (track) bump(-1); }
}

async function sendInner(path, { method = 'GET', body, params, form, signal, raw } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(buildUrl(path, params), {
      method, headers, signal, credentials: 'include',
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0);
  }
  if (raw && res.ok) return res;
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const status = res.status;
    const fieldErrors = payload.code === 'VALIDATION_ERROR' ? parseFieldErrors(payload.message) : {};
    const message = status >= 500 ? undefined : payload.message;
    throw new ApiError(status, message, fieldErrors, payload.code);
  }
  return payload;
}

async function refreshSession() {
  if (!refreshing) {
    refreshing = send('/auth/refresh', { method: 'POST' })
      .then(p => { accessToken = p.data.accessToken; return p.data.user; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}
export const restoreSession = refreshSession;

export async function request(path, opts = {}) {
  try {
    return await send(path, opts);
  } catch (e) {
    const retriable = e instanceof ApiError && e.status === 401 && !path.startsWith('/auth/') && !opts._retried;
    if (!retriable) throw e;
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionLost();
      throw e;
    }
    return send(path, { ...opts, _retried: true });
  }
}

export const api = {
  get: (path, params, opts) => request(path, { ...opts, params }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body: body ?? {} }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body: body ?? {} }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
  upload: (path, field, file) => {
    const form = new FormData();
    form.append(field, file);
    return request(path, { method: 'POST', form });
  },
  // Authenticated file download (CSV exports).
  async download(path, params, filename) {
    const res = await request(path, { params, raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};

// Convenience: fetch every page of a (bounded) list endpoint, e.g. rooms or cabins.
export async function fetchAll(path, params = {}, max = 500) {
  const out = [];
  let page = 1;
  for (;;) {
    const res = await api.get(path, { ...params, page, limit: 100 });
    out.push(...res.data);
    if (page >= (res.pagination?.totalPages || 1) || out.length >= max) break;
    page += 1;
  }
  return out;
}