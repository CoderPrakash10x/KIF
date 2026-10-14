import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

// Generic loader: runs `fetcher` on mount and whenever `deps` change; `reload()` re-runs it.
export function useApi(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const [tick, setTick] = useState(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => fetchRef.current())
      .then(data => { if (alive) setState({ data, loading: false, error: null }); })
      .catch(error => { if (alive && !(error?.name === 'AbortError')) setState(s => ({ data: s.data, loading: false, error: error instanceof ApiError ? error : new ApiError(500) })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  return { ...state, reload };
}

// Server-side pagination: `params` are query filters; page/size are managed here and reset on filter change.
export function useServerList(path, params = {}, { pageSize = 10, enabled = true } = {}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const key = JSON.stringify(params);
  useEffect(() => { setPage(1); }, [key, size]);
  const q = useApi(() => api.get(path, { ...params, page, limit: size }), [path, key, page, size], { enabled });
  const res = q.data || {};
  return {
    rows: res.data || [], pagination: res.pagination || { page, limit: size, total: 0, totalPages: 1 }, extra: res,
    loading: q.loading, error: q.error, reload: q.reload, page, setPage, size, setSize,
  };
}
