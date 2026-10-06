import { useEffect, useState } from 'react';
import { Input } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { useFilters } from '../../context/FilterContext.jsx';

/**
 * Path prefix filter — applies on Enter or blur, with a small debounce-free
 * "apply" affordance via the search icon behaviour. Writes `path` to FilterContext.
 */
export default function PathFilter({ style }) {
  const { path, setPath } = useFilters();
  const [draft, setDraft] = useState(path);

  // Keep in sync when filters are cleared externally.
  useEffect(() => {
    setDraft(path);
  }, [path]);

  const apply = () => {
    const next = draft.trim().replace(/^\/+/, '');
    if (next !== path) setPath(next);
  };

  return (
    <Input
      allowClear
      placeholder="Filter by path prefix, e.g. src/components"
      prefix={<FolderOpenOutlined style={{ color: '#94a3b8' }} />}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onPressEnter={apply}
      onBlur={apply}
      style={{ minWidth: 240, ...style }}
    />
  );
}
