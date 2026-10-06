import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Popconfirm,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import {
  DashboardOutlined,
  DeleteOutlined,
  LinkOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { deleteRepo, getErrorMessage, getRepos } from '../api/client.js';
import RepoUpload from '../components/upload/RepoUpload.jsx';
import { formatDate, pickField, pickNumber } from '../utils/formatters.js';

/**
 * Repository management page — clone by URL or upload a zip, then manage
 * the list of ingested repositories.
 */
export default function RepoListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getRepos();
      setRepos(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(getErrorMessage(err));
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await deleteRepo(id);
      message.success('Repository deleted.');
      setRepos((prev) => prev.filter((r) => (r.id ?? r.repoId ?? r._id) !== id));
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const rows = useMemo(
    () =>
      repos.map((repo) => {
        const id = repo.id ?? repo.repoId ?? repo._id;
        return {
          id,
          name: pickField(repo, ['name', 'repoName'], `repo-${id}`),
          url: pickField(repo, ['url', 'remoteUrl', 'source'], ''),
          addedAt: pickField(repo, ['addedAt', 'createdAt', 'dateAdded', 'created_at']),
          commitCount: pickNumber(repo, ['commitCount', 'commits', 'totalCommits'], null),
          authorCount: pickNumber(repo, ['authorCount', 'author_count', 'authors', 'totalAuthors'], null),
          // The registry entries from the backend carry `fileChangeCount`.
          fileChangeCount: pickNumber(repo, ['fileChangeCount', 'file_change_count', 'fileChanges'], null)
        };
      }),
    [repos]
  );

  const columns = [
    {
      title: 'Repository',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, row) => (
        <Space>
          <Typography.Text strong>{name}</Typography.Text>
          {row.commitCount !== null && <Tag>{row.commitCount} commits</Tag>}
          {row.authorCount !== null && <Tag>{row.authorCount} authors</Tag>}
          {row.fileChangeCount !== null && <Tag>{row.fileChangeCount} file changes</Tag>}
        </Space>
      )
    },
    {
      title: 'Source',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
      width: 260,
      render: (url) =>
        url ? (
          <Tooltip title={url}>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              <LinkOutlined style={{ marginRight: 6 }} />
              {url}
            </Typography.Text>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            ZIP upload
          </Typography.Text>
        )
    },
    {
      title: 'Added',
      dataIndex: 'addedAt',
      key: 'addedAt',
      width: 140,
      sorter: (a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0),
      render: (value) => <span className="rat-num" style={{ fontSize: 12.5 }}>{formatDate(value)}</span>
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="Open metrics dashboard">
            <Button
              size="small"
              icon={<DashboardOutlined />}
              onClick={() => navigate(`/repo/${row.id}`, { state: { name: row.name } })}
            >
              Dashboard
            </Button>
          </Tooltip>
          <Tooltip title="Manage authors">
            <Button
              size="small"
              icon={<TeamOutlined />}
              onClick={() => navigate(`/repo/${row.id}/authors`, { state: { name: row.name } })}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this repository?"
            description="All ingested history and metrics for it will be removed."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(row.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deletingId === row.id} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="rat-page">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={9}>
          <Card
            title="Add a repository"
            size="small"
            style={{ position: 'sticky', top: 84 }}
          >
            <RepoUpload onSuccess={() => loadRepos()} />
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          <Card
            title={
              <Space>
                <span>Repositories</span>
                <Tag className="rat-num">{rows.length}</Tag>
              </Space>
            }
            size="small"
            extra={
              <Button size="small" onClick={loadRepos} loading={loading}>
                Refresh
              </Button>
            }
          >
            {error && (
              <Alert
                type="error"
                showIcon
                message="Could not load repositories"
                description={error}
                style={{ marginBottom: 12 }}
                action={
                  <Button size="small" onClick={loadRepos}>
                    Retry
                  </Button>
                }
              />
            )}
            <Table
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={rows}
              loading={loading}
              scroll={{ x: 760 }}
              pagination={{
                pageSize: 8,
                showTotal: (total) => (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {total} repositories
                  </Typography.Text>
                )
              }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No repositories yet — clone a URL or upload a zip on the left."
                  />
                )
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
