import { useMemo } from 'react';
import { Alert, Empty, Table, Tooltip, Typography } from 'antd';
import { formatNumber, formatSigned, pickField, pickNumber } from '../../utils/formatters.js';

const NUM_KEYS = {
  // The backend sends `file_path`; keep the other keys for shape tolerance.
  path: ['file_path', 'path', 'file', 'filePath', 'name'],
  added: ['added', 'addedLines', 'linesAdded', 'l+'],
  removed: ['removed', 'removedLines', 'linesRemoved', 'l-'],
  growth: ['growth', 'net', 'delta', 'd'],
  churn: ['churn', 'totalChurn', 'lambda'],
  modifications: ['modifications', 'mods', 'changes', 'changeCount', 'commits', 'count']
};

/**
 * Sortable, paginated table of per-file metrics for the active commit set.
 * `data` is shape-tolerant: a raw rows array, a server-side pagination
 * envelope `{ data, total, page, limit }`, or `{ files: [] }`.
 *
 * When a `pagination` prop is provided the table runs in server-side mode:
 * `total` comes from the API response and page / page-size changes are
 * reported through `pagination.onChange`, which re-fetches with the new
 * page params. Without it the table paginates the rows client-side.
 */
export default function FileMetricsTable({ data, loading, error, pagination }) {
  const rows = useMemo(() => {
    const list = Array.isArray(data) ? data : data?.data ?? data?.files ?? [];
    return list.map((row, index) => {
      const added = pickNumber(row, NUM_KEYS.added);
      const removed = pickNumber(row, NUM_KEYS.removed);
      return {
        key: pickField(row, NUM_KEYS.path) ?? index,
        path: pickField(row, NUM_KEYS.path) ?? '—',
        added,
        removed,
        growth: pickNumber(row, NUM_KEYS.growth, added - removed),
        churn: pickNumber(row, NUM_KEYS.churn, added + removed),
        modifications: pickNumber(row, NUM_KEYS.modifications)
      };
    });
  }, [data]);

  // Total number of matching files across every page — from the server-side
  // pagination envelope, falling back to the local row count for plain arrays.
  const totalCount = useMemo(() => {
    if (data && typeof data === 'object' && !Array.isArray(data) && Number.isFinite(Number(data.total))) {
      return Number(data.total);
    }
    return rows.length;
  }, [data, rows.length]);

  const showTotal = (total) => (
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {total.toLocaleString('en-US')} files
    </Typography.Text>
  );

  const columns = [
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
      sorter: (a, b) => a.path.localeCompare(b.path),
      render: (value) => (
        <Tooltip title={value}>
          <span className="rat-num" style={{ fontSize: 12.5 }}>
            {value}
          </span>
        </Tooltip>
      )
    },
    {
      title: 'Added',
      dataIndex: 'added',
      key: 'added',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.added - b.added,
      defaultSortOrder: 'descend',
      render: (value) => <span className="rat-num" style={{ color: '#16a34a' }}>{formatNumber(value)}</span>
    },
    {
      title: 'Removed',
      dataIndex: 'removed',
      key: 'removed',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.removed - b.removed,
      render: (value) => <span className="rat-num" style={{ color: '#dc2626' }}>{formatNumber(value)}</span>
    },
    {
      title: 'Growth',
      dataIndex: 'growth',
      key: 'growth',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.growth - b.growth,
      render: (value) => (
        <span className={`rat-num ${value > 0 ? 'rat-pos' : value < 0 ? 'rat-neg' : ''}`}>
          {formatSigned(value)}
        </span>
      )
    },
    {
      title: 'Churn',
      dataIndex: 'churn',
      key: 'churn',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.churn - b.churn,
      render: (value) => <span className="rat-num" style={{ color: '#d97706' }}>{formatNumber(value)}</span>
    },
    {
      title: 'Modifications',
      dataIndex: 'modifications',
      key: 'modifications',
      width: 130,
      align: 'right',
      sorter: (a, b) => a.modifications - b.modifications,
      render: (value) => <span className="rat-num">{formatNumber(value)}</span>
    }
  ];

  // Server-side pagination (controlled by the parent) vs. client-side fallback.
  const tablePagination = pagination
    ? {
        showSizeChanger: true,
        pageSizeOptions: [10, 25, 50, 100],
        showTotal,
        ...pagination,
        total: pagination.total ?? totalCount
      }
    : {
        pageSize: 15,
        showSizeChanger: true,
        pageSizeOptions: [10, 15, 25, 50],
        showTotal
      };

  if (error) {
    return <Alert type="error" showIcon message="Failed to load file metrics" description={error} />;
  }

  return (
    <Table
      size="small"
      rowKey="key"
      columns={columns}
      dataSource={rows}
      loading={loading}
      scroll={{ x: 720 }}
      pagination={tablePagination}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No file metrics for the current selection"
          />
        )
      }}
    />
  );
}
