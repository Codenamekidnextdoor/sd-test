import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import { LeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useLocation, useParams } from 'react-router-dom';
import AuthorMerge from '../components/authors/AuthorMerge.jsx';
import { getAuthors, getErrorMessage } from '../api/client.js';
import { useFilters } from '../context/FilterContext.jsx';
import { formatNumber, pickNumber } from '../utils/formatters.js';

/**
 * Author management page — lists every author with their metrics and
 * exposes the merge workflow (checkbox selection + canonical identity form).
 */
export default function AuthorPage() {
  const { id } = useParams();
  const location = useLocation();
  const { setRepoId } = useFilters();

  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setRepoId(id);
  }, [id, setRepoId]);

  const loadAuthors = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getAuthors(id);
      setAuthors(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(getErrorMessage(err));
      setAuthors([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAuthors();
  }, [loadAuthors]);

  const totals = useMemo(() => {
    const totalCommits = authors.reduce(
      (sum, a) => sum + pickNumber(a, ['commits', 'commitCount']),
      0
    );
    const totalChurn = authors.reduce((sum, a) => {
      const added = pickNumber(a, ['added', 'addedLines', 'linesAdded']);
      const removed = pickNumber(a, ['removed', 'removedLines', 'linesRemoved']);
      return sum + pickNumber(a, ['churn', 'totalChurn'], added + removed);
    }, 0);
    return { count: authors.length, totalCommits, totalChurn };
  }, [authors]);

  return (
    <div className="rat-page">
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }} gutter={[8, 8]}>
        <Col>
          <Space align="center" wrap>
            <Link to={`/repo/${id}`} state={location.state}>
              <Button size="small" icon={<LeftOutlined />}>
                Dashboard
              </Button>
            </Link>
            <Typography.Title level={4} style={{ margin: 0, letterSpacing: '-0.3px' }}>
              Author management
            </Typography.Title>
            <Tag className="rat-num">#{id}</Tag>
          </Space>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={loadAuthors} loading={loading}>
            Refresh
          </Button>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic className="rat-stat rat-stat--compact" title="Authors" value={totals.count} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              className="rat-stat rat-stat--compact"
              title="Commits (all authors)"
              value={totals.totalCommits}
              formatter={(v) => formatNumber(v)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              className="rat-stat rat-stat--compact"
              title="Churn (all authors)"
              value={totals.totalChurn}
              formatter={(v) => formatNumber(v)}
              valueStyle={{ color: '#d97706' }}
            />
          </Card>
        </Col>
      </Row>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Could not load authors"
          description={error}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={loadAuthors}>
              Retry
            </Button>
          }
        />
      )}

      <AuthorMerge repoId={id} authors={authors} loading={loading} onMerged={loadAuthors} />
    </div>
  );
}
