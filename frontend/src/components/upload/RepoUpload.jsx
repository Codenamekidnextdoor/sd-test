import { useState } from 'react';
import { App, Button, Input, Progress, Space, Tabs, Typography, Upload } from 'antd';
import { CloudDownloadOutlined, FileZipOutlined, InboxOutlined } from '@ant-design/icons';
import { cloneRepo, getErrorMessage, uploadRepo } from '../../api/client.js';

const { Dragger } = Upload;

/**
 * Reusable repository ingestion panel — URL clone or zip upload, with
 * progress reporting and success/error feedback.
 *
 * @param {(repo: object) => void} onSuccess called after successful ingestion
 * @param {boolean} compact render without the outer description text
 */
export default function RepoUpload({ onSuccess, compact = false }) {
  const { message } = App.useApp();
  const [tab, setTab] = useState('url');

  // --- URL clone state ---
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [cloning, setCloning] = useState(false);

  // --- zip upload state ---
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState(null);

  const handleClone = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      message.warning('Enter a Git repository URL first.');
      return;
    }
    setCloning(true);
    try {
      const repo = await cloneRepo(trimmed, name.trim() || undefined);
      message.success(`Repository "${repo?.name || name || trimmed}" cloned successfully.`);
      setUrl('');
      setName('');
      onSuccess?.(repo);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setCloning(false);
    }
  };

  const handleZip = async (file) => {
    setUploading(true);
    setProgress(0);
    setFileName(file.name);
    try {
      const repo = await uploadRepo(file, setProgress);
      message.success(`Repository "${repo?.name || file.name}" ingested successfully.`);
      onSuccess?.(repo);
      return true;
    } catch (err) {
      message.error(getErrorMessage(err));
      return false;
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 800);
      setFileName(null);
    }
  };

  const items = [
    {
      key: 'url',
      label: (
        <span>
          <CloudDownloadOutlined /> Clone from URL
        </span>
      ),
      children: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Input
            size="large"
            allowClear
            placeholder="https://github.com/owner/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPressEnter={handleClone}
            disabled={cloning}
            prefix={<CloudDownloadOutlined style={{ color: '#94a3b8' }} />}
          />
          <Input
            size="large"
            allowClear
            placeholder="Display name (optional — defaults to repo name)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleClone}
            disabled={cloning}
          />
          <Button type="primary" size="large" block loading={cloning} onClick={handleClone}>
            {cloning ? 'Cloning repository…' : 'Clone repository'}
          </Button>
          {cloning && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Deep clone in progress — large repositories can take a moment.
            </Typography.Text>
          )}
        </Space>
      )
    },
    {
      key: 'zip',
      label: (
        <span>
          <FileZipOutlined /> Upload ZIP
        </span>
      ),
      children: (
        <div>
          <Dragger
            accept=".zip"
            multiple={false}
            maxCount={1}
            showUploadList={false}
            disabled={uploading}
            customRequest={({ file, onSuccess: done, onError }) => {
              handleZip(file).then((ok) => (ok ? done?.({}) : onError?.(new Error('upload failed'))));
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drop a .zip of the repository here</p>
            <p className="ant-upload-hint" style={{ fontSize: 12 }}>
              The archive must contain the .git directory so history can be analysed.
            </p>
          </Dragger>
          {uploading && (
            <div style={{ marginTop: 16 }}>
              <Progress percent={progress} status="active" />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Uploading {fileName || 'archive'}… analysis starts once the upload completes.
              </Typography.Text>
            </div>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      {!compact && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Ingest a repository by cloning a remote URL or uploading a zip archive that includes
          its <span className="rat-num">.git</span> history.
        </Typography.Paragraph>
      )}
      <Tabs items={items} activeKey={tab} onChange={setTab} />
    </div>
  );
}
