import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Global filter state shared across the dashboard:
 *   { repoId, author[], path, from, to, commits[] }
 * `from`/`to` are ISO strings, `commits` are commit hashes.
 */
const FilterContext = createContext(null);

export const EMPTY_FILTERS = {
  author: [],
  path: '',
  from: null,
  to: null,
  commits: []
};

export function FilterProvider({ children }) {
  const [repoId, setRepoIdValue] = useState(null);
  const [author, setAuthor] = useState([]);
  const [path, setPath] = useState('');
  const [range, setRange] = useState({ from: null, to: null });
  const [commits, setCommits] = useState([]);
  const currentRepoId = useRef(null);

  const clearFilters = useCallback(() => {
    setAuthor([]);
    setPath('');
    setRange({ from: null, to: null });
    setCommits([]);
  }, []);

  /** Switching repos resets dependent filters so they don't leak across repos. */
  const setRepoId = useCallback(
    (id) => {
      if (String(currentRepoId.current) !== String(id)) {
        currentRepoId.current = id;
        clearFilters();
      }
      setRepoIdValue(id);
    },
    [clearFilters]
  );

  const setTimeRange = useCallback((from, to) => {
    setRange({ from: from || null, to: to || null });
  }, []);

  const hasActiveFilters = Boolean(
    (author && author.length > 0) || path || range.from || range.to || (commits && commits.length > 0)
  );

  const activeFilters = useMemo(
    () => ({ author, path, from: range.from, to: range.to, commits }),
    [author, path, range, commits]
  );

  const value = useMemo(
    () => ({
      repoId,
      setRepoId,
      author,
      setAuthor,
      path,
      setPath,
      from: range.from,
      to: range.to,
      setTimeRange,
      commits,
      setCommits,
      clearFilters,
      hasActiveFilters,
      activeFilters
    }),
    [repoId, setRepoId, author, path, range, setTimeRange, commits, clearFilters, hasActiveFilters, activeFilters]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within a FilterProvider');
  return ctx;
}

export default FilterContext;
