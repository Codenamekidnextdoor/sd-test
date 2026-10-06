import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage, getMetrics } from '../api/client.js';

/** Debounce window (ms) applied to filter-driven refetches. */
const DEBOUNCE_MS = 300;

/**
 * Fetch a metrics payload for a repository.
 *
 * @param {string|number} repoId   repository id (null disables fetching)
 * @param {string} type            metrics type: repo | file | directory | authors | churn-timeseries | commit-activity
 * @param {object} filters         { author[], path, from, to, commits[] }
 * @param {object} extraParams     extra query params (e.g. { page, limit } for
 *                                 the server-side paginated file metrics)
 * @returns {{ data: any, loading: boolean, error: string|null, refetch: () => Promise<void> }}
 */
export default function useMetrics(repoId, type, filters = {}, extraParams = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(repoId));
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  // Stable keys so referentially-unstable filter objects don't refetch endlessly.
  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const extraKey = useMemo(() => JSON.stringify(extraParams ?? {}), [extraParams]);

  const fetchData = useCallback(async () => {
    if (repoId === null || repoId === undefined || repoId === '') {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getMetrics(repoId, type, JSON.parse(filtersKey), JSON.parse(extraKey));
      // A newer request superseded this one — drop the stale response
      // instead of clobbering the latest data.
      if (requestId !== requestIdRef.current) return;
      setData(result);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(getErrorMessage(err));
      setData(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [repoId, type, filtersKey, extraKey]);

  // Debounced fetch: rapid filter changes collapse into a single request,
  // and any pending request is cancelled whenever the inputs change again.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchData, DEBOUNCE_MS);
    return () => {
      clearTimeout(debounceRef.current);
    };
  }, [fetchData]);

  // Never leave a pending timer behind on unmount.
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return { data, loading, error, refetch: fetchData };
}
