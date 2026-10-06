import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Empty, Spin, Tree, Typography } from 'antd';
import { FolderOutlined } from '@ant-design/icons';
import { getDirectoryTree, getErrorMessage } from '../../api/client.js';
import { formatNumber, pickField, pickNumber } from '../../utils/formatters.js';

const ROOT_KEY = '__root__';

function nodePath(node) {
  return pickField(node, ['path', 'dir', 'directory'], '') || '';
}

function toTreeNodes(nodes, keyPrefix = '') {
  return (Array.isArray(nodes) ? nodes : []).map((node, index) => {
    const path = nodePath(node);
    const name = pickField(node, ['name', 'label'], path.split('/').filter(Boolean).pop() || path || '?');
    // Backend tree nodes carry `type: 'directory' | 'file'` — that is the
    // primary detection; the other keys are shape-tolerance fallbacks.
    const hasChildren = Boolean(
      node.type === 'directory' ||
        pickField(node, ['hasChildren', 'has_children', 'isDirectory', 'isDir', 'directory'], false) ||
        (Array.isArray(node.children) && node.children.length > 0)
    );
    const added = pickNumber(node, ['added', 'addedLines', 'linesAdded', 'l+']);
    const removed = pickNumber(node, ['removed', 'removedLines', 'linesRemoved', 'l-']);
    const growth = pickNumber(node, ['growth', 'net', 'delta', 'd'], added - removed);
    const churn = pickNumber(node, ['churn', 'totalChurn', 'lambda'], added + removed);
    const key = path || `${keyPrefix}/${name}#${index}`;

    const children = Array.isArray(node.children) ? toTreeNodes(node.children, key) : undefined;

    return {
      key,
      rawPath: path,
      isLeafNode: !hasChildren,
      title: (
        <span className="rat-tree-node">
          <span className="rat-tree-node__name">{name || path || '(root)'}</span>
          <span className={`rat-tree-node__meta ${growth > 0 ? 'rat-pos' : growth < 0 ? 'rat-neg' : ''}`}>
            churn {formatNumber(churn)} · growth {growth > 0 ? '+' : ''}
            {formatNumber(growth)}
          </span>
        </span>
      ),
      children,
      isLeaf: !hasChildren
    };
  });
}

/**
 * Lazy-loading directory tree. Children are fetched on expand via
 * GET /api/repos/:id/tree?path=<dir> with the active filters applied.
 * Metrics (churn / growth) are shown inline per node.
 */
export default function DirectoryTree({ repoId, filters, repoName, onSelectPath }) {
  const [rootChildren, setRootChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState([]);

  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  const loadRoot = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await getDirectoryTree(repoId, '', JSON.parse(filtersKey));
      const children = Array.isArray(payload) ? payload : payload?.children ?? [];
      setRootChildren(toTreeNodes(children, ''));
      setExpandedKeys([ROOT_KEY]);
    } catch (err) {
      setError(getErrorMessage(err));
      setRootChildren([]);
    } finally {
      setLoading(false);
    }
  }, [repoId, filtersKey]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  const handleLoadData = useCallback(
    async (node) => {
      if (node.__loaded || !repoId) return;
      const path = node.rawPath ?? node.key;
      if (!path || path === ROOT_KEY) return;
      try {
        const payload = await getDirectoryTree(repoId, path, JSON.parse(filtersKey));
        const children = Array.isArray(payload) ? payload : payload?.children ?? [];
        const mapped = toTreeNodes(children, path);
        // Mutate in place as expected by antd Tree loadData contract.
        node.children = mapped;
        node.__loaded = true;
        setRootChildren((prev) => [...prev]);
      } catch (err) {
        setError(getErrorMessage(err));
        node.isLeaf = true;
        setRootChildren((prev) => [...prev]);
      }
    },
    [repoId, filtersKey]
  );

  const treeData = useMemo(
    () => [
      {
        key: ROOT_KEY,
        rawPath: '',
        title: (
          <span className="rat-tree-node">
            <span className="rat-tree-node__name" style={{ fontWeight: 600 }}>
              <FolderOutlined style={{ marginRight: 6, color: '#0f766e' }} />
              {repoName || '(root)'}
            </span>
          </span>
        ),
        isLeaf: false,
        children: rootChildren
      }
    ],
    [rootChildren, repoName]
  );

  if (error && rootChildren.length === 0) {
    return <Alert type="error" showIcon message="Failed to load directory tree" description={error} />;
  }

  if (!loading && rootChildren.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No directory metrics for the current selection"
      />
    );
  }

  return (
    <Spin spinning={loading} tip="Loading tree…">
      <div style={{ maxHeight: 520, overflow: 'auto', paddingRight: 4 }}>
        <Tree
          className="rat-tree"
          showLine={{ showLeafIcon: false }}
          treeData={treeData}
          loadData={handleLoadData}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys([ROOT_KEY, ...keys.filter((k) => k !== ROOT_KEY)])}
          onSelect={(keys) => {
            const selected = keys[0];
            if (!selected || selected === ROOT_KEY) {
              onSelectPath?.('');
              return;
            }
            const find = (nodes) => {
              for (const n of nodes) {
                if (n.key === selected) return n;
                if (n.children) {
                  const found = find(n.children);
                  if (found) return found;
                }
              }
              return null;
            };
            const node = find(treeData);
            if (node && typeof node.rawPath === 'string') onSelectPath?.(node.rawPath);
          }}
          style={{ fontSize: 13 }}
        />
      </div>
      {error && (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          {error}
        </Typography.Text>
      )}
    </Spin>
  );
}
