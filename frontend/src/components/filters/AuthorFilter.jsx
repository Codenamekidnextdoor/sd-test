import { useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import { getAuthors } from '../../api/client.js';
import { useFilters } from '../../context/FilterContext.jsx';

/**
 * Multi-select of repository authors — writes the selected author names
 * (canonical names) to FilterContext. Options are fetched per repository.
 */
export default function AuthorFilter({ style }) {
  const { repoId, author, setAuthor } = useFilters();
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!repoId) {
      setAuthors([]);
      return undefined;
    }
    setLoading(true);
    getAuthors(repoId)
      .then((list) => {
        if (!cancelled) setAuthors(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setAuthors([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  const options = useMemo(
    () =>
      authors.map((a) => {
        // The backend sends `author_name` / `author_email`.
        const name =
          a.author_name || a.name || a.canonicalName || a.author || a.author_email || a.email || 'unknown';
        const email = a.author_email || a.email || a.canonicalEmail || '';
        const commits = a.commits ?? a.commitCount;
        return {
          value: name,
          label: commits !== undefined ? `${name} · ${commits} commits` : email ? `${name} · ${email}` : name
        };
      }),
    [authors]
  );

  return (
    <Select
      mode="multiple"
      allowClear
      showSearch
      maxTagCount="responsive"
      placeholder="Filter by author"
      loading={loading}
      disabled={!repoId}
      value={author}
      onChange={setAuthor}
      options={options}
      optionFilterProp="label"
      style={{ minWidth: 220, ...style }}
    />
  );
}
