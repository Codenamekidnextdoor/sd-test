import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, Form, Input, Row, Space, Table, Tag, Typography } from 'antd';
import { MergeCellsOutlined, UserOutlined } from '@ant-design/icons';
import { getErrorMessage, mergeAuthors } from '../../api/client.js';
import { formatNumber, pickField, pickNumber } from '../../utils/formatters.js';

// The backend sends `author_name` / `author_email`; the other keys are
// shape-tolerance fallbacks.
const authorName = (a) => pickField(a, ['author_name', 'name', 'canonicalName', 'author'], 'unknown');
const authorEmail = (a) => pickField(a, ['author_email', 'email', 'canonicalEmail'], '');

/**
 * Author merge panel: select rows, then designate a canonical name/email.
 * Selected identities are sent as aliases and merged server-side.
 */
export default function AuthorMerge({ repoId, authors, loading, onMerged }) {
  const { message } = App.useApp();
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [form] = Form.useForm();
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState(null);

  const rows = useMemo(
    () =>
      (Array.isArray(authors) ? authors : []).map((a) => {
        const added = pickNumber(a, ['added', 'addedLines', 'linesAdded']);
        const removed = pickNumber(a, ['removed', 'removedLines', 'linesRemoved']);
        return {
          key: `${authorName(a)}|${authorEmail(a)}`,
          name: authorName(a),
          email: authorEmail(a) || '—',
          commits: pickNumber(a, ['commits', 'commitCount']),
          added,
          removed,
          churn: pickNumber(a, ['churn', 'totalChurn'], added + removed)
        };
      }),
    [authors]
  );

  // Prefill canonical fields from the first selected author.
  useEffect(() => {
    if (selectedKeys.length === 0) return;
    const first = rows.find((r) => r.key === selectedKeys[0]);
    if (!first) return;
    form.setFieldsValue({
      canonicalName: form.getFieldValue('canonicalName') || first.name,
      canonicalEmail: form.getFieldValue('canonicalEmail') || (first.email !== '—' ? first.email : '')
    });
  }, [selectedKeys, rows, form]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedKeys.includes(r.key)),
    [rows, selectedKeys]
  );

  const handleMerge = async () => {
    setError(null);
    if (selectedRows.length < 2) {
      message.warning('Select at least two authors to merge.');
      return;
    }
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setMerging(true);
    try {
      const aliases = selectedRows.map((r) => ({
        name: r.name,
        email: r.email !== '—' ? r.email : ''
      }));
      await mergeAuthors(repoId, values.canonicalName.trim(), values.canonicalEmail.trim(), aliases);
      message.success(
        `Merged ${aliases.length} authors into "${values.canonicalName.trim()}".`
      );
      setSelectedKeys([]);
      form.resetFields();
      onMerged?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMerging(false);
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (v) => <span className="rat-num" style={{ fontSize: 12.5 }}>{v}</span>
    },
    {
      title: 'Commits',
      dataIndex: 'commits',
      key: 'commits',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.commits - b.commits,
      render: (v) => <span className="rat-num">{formatNumber(v)}</span>
    },
    {
      title: 'Added',
      dataIndex: 'added',
      key: 'added',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.added - b.added,
      render: (v) => <span className="rat-num" style={{ color: '#16a34a' }}>{formatNumber(v)}</span>
    },
    {
      title: 'Removed',
      dataIndex: 'removed',
      key: 'removed',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.removed - b.removed,
      render: (v) => <span className="rat-num" style={{ color: '#dc2626' }}>{formatNumber(v)}</span>
    },
    {
      title: 'Churn',
      dataIndex: 'churn',
      key: 'churn',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.churn - b.churn,
      render: (v) => <span className="rat-num" style={{ color: '#d97706' }}>{formatNumber(v)}</span>
    }
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={15}>
        <Card
          size="small"
          title={
            <Space>
              <UserOutlined />
              <span>Authors ({rows.length})</span>
            </Space>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table
            size="small"
            rowKey="key"
            columns={columns}
            dataSource={rows}
            loading={loading}
            scroll={{ x: 640 }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys,
              preserveSelectedRowKeys: true
            }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        </Card>
      </Col>

      <Col xs={24} xl={9}>
        <Card
          size="small"
          title={
            <Space>
              <MergeCellsOutlined />
              <span>Merge selected authors</span>
            </Space>
          }
        >
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

          <Typography.Paragraph type="secondary" style={{ fontSize: 12.5 }}>
            Pick the identities that belong to the same developer (different names or emails),
            then choose the canonical identity to merge them into.
          </Typography.Paragraph>

          <Space wrap size={6} style={{ marginBottom: 12 }}>
            {selectedRows.length === 0 ? (
              <Tag color="default">No authors selected</Tag>
            ) : (
              selectedRows.map((row) => (
                <Tag key={row.key} color="cyan">
                  {row.name}
                  {row.email !== '—' ? ` <${row.email}>` : ''}
                </Tag>
              ))
            )}
          </Space>

          <Form form={form} layout="vertical" disabled={selectedRows.length === 0}>
            <Form.Item
              name="canonicalName"
              label="Canonical name"
              rules={[{ required: true, message: 'Enter the canonical name' }]}
            >
              <Input placeholder="e.g. Brendan Griffiths" />
            </Form.Item>
            <Form.Item
              name="canonicalEmail"
              label="Canonical email"
              rules={[{ type: 'email', message: 'Enter a valid email address' }]}
            >
              <Input placeholder="e.g. brendan@example.com" />
            </Form.Item>
            <Button
              type="primary"
              block
              icon={<MergeCellsOutlined />}
              loading={merging}
              disabled={selectedRows.length < 2}
              onClick={handleMerge}
            >
              Merge {selectedRows.length >= 2 ? `${selectedRows.length} authors` : 'authors'}
            </Button>
          </Form>
        </Card>
      </Col>
    </Row>
  );
}
