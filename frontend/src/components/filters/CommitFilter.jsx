import { useState } from 'react';
import { Alert, App, Badge, Button, Checkbox, Empty, List, Modal, Space, Spin, Tag, Typography } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';
import { getCommits, getErrorMessage } from '../../api/client.js';
import { useFilters } from '../../context/FilterContext.jsx';
import { formatDateTime, shortHash, truncate } from '../../utils/formatters.js';

/**
 * Manual commit selection — opens a modal listing the repo's commits
 * (respecting the other active filters) with checkboxes.
 */
export default function CommitFilter() {
  const { repoId, from, to, author, path, commits, setCommits } = useFilters();
  const { message } = App.useApp();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState([]);
  const [total, setTotal] = useState(0);

  const openModal = async () => {
    setOpen(true);
    setSelected(commits || []);
    setLoading(true);
    setError(null);
    try {
      const result = await getCommits(repoId, { from, to, author, path }, 1, 200);
      setList(Array.isArray(result.commits) ? result.commits : []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(getErrorMessage(err));
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    setCommits(selected);
    setOpen(false);
    if (selected.length > 0) {
      message.success(`${selected.length} commit${selected.length > 1 ? 's' : ''} selected`);
    }
  };

  const reset = () => {
    setSelected([]);
  };

  const hashOf = (c) => c.hash || c.sha || c.id || c.oid;
  const authorOf = (c) => c.author || c.authorName || c.author_name || c.committer || '—';

  return (
    <>
      <Badge count={commits?.length || 0} size="small" offset={[-2, 2]}>
        <Button icon={<BranchesOutlined />} onClick={openModal} disabled={!repoId}>
          Commits
        </Button>
      </Badge>

      <Modal
        title={
          <Space>
            <span>Select commits</span>
            {total > 0 && <Tag>{total} in scope</Tag>}
          </Space>
        }
        open={open}
        onCancel={() => setOpen(false)}
        onOk={apply}
        okText={selected.length > 0 ? `Apply (${selected.length})` : 'Apply'}
        width={680}
        destroyOnClose
      >
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

        <Space style={{ marginBottom: 12 }} wrap>
          <Button size="small" onClick={() => setSelected(list.map(hashOf).filter(Boolean))}>
            Select all
          </Button>
          <Button size="small" onClick={reset}>
            Clear selection
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Only commits matching the current filters are listed.
          </Typography.Text>
        </Space>

        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #eef1f6', borderRadius: 8 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Spin tip="Loading commits…">
                <div style={{ height: 40 }} />
              </Spin>
            </div>
          ) : list.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No commits match the current filters"
              style={{ padding: 32 }}
            />
          ) : (
            <Checkbox.Group
              value={selected}
              onChange={setSelected}
              style={{ display: 'block', width: '100%' }}
            >
              <List
                size="small"
                dataSource={list}
                renderItem={(commit) => {
                  const hash = hashOf(commit);
                  const msg = commit.message || commit.subject || '(no message)';
                  const date = commit.date || commit.committerDate || commit.committer_date || commit.timestamp;
                  return (
                    <List.Item style={{ padding: '8px 12px' }}>
                      <Checkbox value={hash} style={{ width: '100%' }}>
                        <Space size={8} wrap>
                          <span className="rat-num" style={{ color: '#0f766e', fontWeight: 600 }}>
                            {shortHash(hash)}
                          </span>
                          <span style={{ fontFamily: 'inherit' }}>{truncate(msg, 60)}</span>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {authorOf(commit)} · {formatDateTime(date)}
                          </Typography.Text>
                        </Space>
                      </Checkbox>
                    </List.Item>
                  );
                }}
              />
            </Checkbox.Group>
          )}
        </div>
      </Modal>
    </>
  );
}
