import { Button, Card, Space, Tooltip, Typography } from 'antd';
import { ClearOutlined, FilterOutlined } from '@ant-design/icons';
import AuthorFilter from './AuthorFilter.jsx';
import CommitFilter from './CommitFilter.jsx';
import PathFilter from './PathFilter.jsx';
import TimeRangeFilter from './TimeRangeFilter.jsx';
import { useFilters } from '../../context/FilterContext.jsx';

/**
 * Combined filter controls for the dashboard. Every control reads/writes the
 * shared FilterContext, so all panels re-fetch together.
 */
export default function FilterBar() {
  const { hasActiveFilters, clearFilters, commits } = useFilters();

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <Space wrap size={12} align="center" style={{ width: '100%' }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          <FilterOutlined /> Filters
        </Typography.Text>

        <TimeRangeFilter />
        <AuthorFilter />
        <PathFilter />
        <CommitFilter />

        <Tooltip title={hasActiveFilters ? 'Reset all filters' : 'No filters applied'}>
          <Button icon={<ClearOutlined />} disabled={!hasActiveFilters} onClick={clearFilters}>
            Clear{commits?.length ? ` (${commits.length} commits)` : ''}
          </Button>
        </Tooltip>
      </Space>
    </Card>
  );
}
