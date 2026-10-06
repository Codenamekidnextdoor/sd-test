import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import { ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import { Link, useLocation, useParams } from 'react-router-dom';
import AuthorChart from '../components/metrics/AuthorChart.jsx';
import ChurnChart from '../components/metrics/ChurnChart.jsx';
import CommitChart from '../components/metrics/CommitChart.jsx';
import DirectoryTree from '../components/metrics/DirectoryTree.jsx';
import FileMetricsTable from '../components/metrics/FileMetricsTable.jsx';
import MetricCards from '../components/metrics/MetricCards.jsx';
import FilterBar from '../components/filters/FilterBar.jsx';
import { useFilters } from '../context/FilterContext.jsx';
import useMetrics from '../hooks/useMetrics.js';
import { pickField } from '../utils/formatters.js';

/**
 * Main metrics dashboard for a single repository.
 * All panels re-fetch whenever the shared FilterContext changes.
 */
export default function DashboardPage() {
  const { id } = useParams();
  const location = useLocation();
  const { setRepoId, activeFilters, setPath } = useFilters();

  // Register this repo with the shared filter context (resets filters on switch).
  useEffect(() => {
    setRepoId(id);
  }, [id, setRepoId]);

  const summary = useMetrics(id, 'repo', activeFilters);
  const churnSeries = useMetrics(id, 'churn-timeseries', activeFilters);
  const commitActivity = useMetrics(id, 'commit-activity', activeFilters);
  const authorMetrics = useMetrics(id, 'authors', activeFilters);

  // Server-side pagination state for the file metrics table. Page changes are
  // pushed into the useMetrics query params, which re-fetches that page.
  const [filePage, setFilePage] = useState(1);
  const [filePageSize, setFilePageSize] = useState(100);
  const fileMetrics = useMetrics(id, 'file', activeFilters, {
    page: filePage,
    limit: filePageSize
  });

  // Jump back to the first page whenever the filter scope changes so we
  // never request a page past the end of the new result set.
  useEffect(() => {
    setFilePage(1);
  }, [activeFilters]);

  const repoName = useMemo(() => {
    const fromState = location.state?.name || location.state?.repoName;
    const fromSummary = pickField(summary.data, ['name', 'repoName'], null);
    return fromState || fromSummary || `Repository ${id}`;
  }, [location.state, summary.data, id]);

  const refetchAll = () => {
    summary.refetch();
    churnSeries.refetch();
    commitActivity.refetch();
    authorMetrics.refetch();
    fileMetrics.refetch();
  };

  const headerErrors = [summary.error, churnSeries.error].filter(Boolean);

  return (
    <div className="rat-page">
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }} gutter={[8, 8]}>
        <Col>
          <Space align="center" wrap>
            <Typography.Title level={4} style={{ margin: 0, letterSpacing: '-0.3px' }}>
              {repoName}
            </Typography.Title>
            <Tag className="rat-num">#{id}</Tag>
          </Space>
        </Col>
        <Col>
          <Space>
            <Link to={`/repo/${id}/authors`} state={location.state}>
              <Button icon={<TeamOutlined />}>Manage authors</Button>
            </Link>
            <Button icon={<ReloadOutlined />} onClick={refetchAll} loading={summary.loading}>
              Refresh
            </Button>
          </Space>
        </Col>
      </Row>

      {headerErrors.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Some metrics could not be loaded"
          description={headerErrors.join(' · ')}
          action={
            <Button size="small" onClick={refetchAll}>
              Retry
            </Button>
          }
        />
      )}

      <FilterBar />

      <MetricCards data={summary.data} loading={summary.loading} />

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card title="Churn over time" size="small" style={{ height: '100%' }}>
            <ChurnChart data={churnSeries.data} loading={churnSeries.loading} error={churnSeries.error} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="Author ownership & churn" size="small" style={{ height: '100%' }}>
            <AuthorChart data={authorMetrics.data} loading={authorMetrics.loading} error={authorMetrics.error} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={16}>
          <Card title="Commit activity" size="small" style={{ height: '100%' }}>
            <CommitChart
              data={commitActivity.data}
              loading={commitActivity.loading}
              error={commitActivity.error}
            />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="Directory metrics" size="small" style={{ height: '100%' }}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
              Expand directories to lazy-load their metrics. Select a directory to filter the
              dashboard by path.
            </Typography.Paragraph>
            <DirectoryTree
              repoId={id}
              filters={activeFilters}
              repoName={repoName}
              onSelectPath={setPath}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="File metrics" size="small">
            <FileMetricsTable
              data={fileMetrics.data}
              loading={fileMetrics.loading}
              error={fileMetrics.error}
              pagination={{
                current: filePage,
                pageSize: filePageSize,
                onChange: (page, pageSize) => {
                  setFilePage(page);
                  setFilePageSize(pageSize);
                }
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
