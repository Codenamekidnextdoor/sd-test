import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Layout, Menu, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  ClusterOutlined,
  ReloadOutlined,
  TeamOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getRepos } from '../../api/client.js';

const { Sider } = Layout;

/**
 * Sidebar navigation: "Repositories" link plus one submenu per repository
 * (Dashboard + Authors), with active-state highlighting from the URL.
 */
export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openKeys, setOpenKeys] = useState([]);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getRepos();
      setRepos(Array.isArray(list) ? list : []);
    } catch {
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos, location.pathname]);

  // Keep the submenu of the active repo open.
  useEffect(() => {
    const match = location.pathname.match(/^\/repo\/([^/]+)/);
    if (match) {
      const key = `repo:${match[1]}`;
      setOpenKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
    }
  }, [location.pathname]);

  const selectedKeys = useMemo(() => {
    if (location.pathname === '/') return ['/'];
    const match = location.pathname.match(/^\/repo\/([^/]+)(\/authors)?/);
    if (!match) return [];
    const [, id, authors] = match;
    return [authors ? `/repo/${id}/authors` : `/repo/${id}`];
  }, [location.pathname]);

  const items = useMemo(() => {
    const base = [
      {
        key: '/',
        icon: <AppstoreOutlined />,
        label: <Link to="/">Repositories</Link>
      }
    ];
    if (repos.length === 0) return base;

    const repoItems = repos.map((repo) => {
      const id = repo.id ?? repo.repoId ?? repo._id;
      const name = repo.name || repo.repoName || `repo-${id}`;
      return {
        key: `repo:${id}`,
        icon: <ClusterOutlined />,
        label: name,
        children: [
          {
            key: `/repo/${id}`,
            icon: <ThunderboltOutlined />,
            label: (
              <Link to={`/repo/${id}`} state={{ name }}>
                Dashboard
              </Link>
            )
          },
          {
            key: `/repo/${id}/authors`,
            icon: <TeamOutlined />,
            label: (
              <Link to={`/repo/${id}/authors`} state={{ name }}>
                Authors
              </Link>
            )
          }
        ]
      };
    });

    return [
      ...base,
      { type: 'divider', style: { borderColor: 'rgba(148,163,184,0.18)', margin: '8px 12px' } },
      {
        key: 'repos-group',
        type: 'group',
        label: 'Repositories',
        children: repoItems
      }
    ];
  }, [repos]);

  return (
    <Sider
      className="rat-sider"
      width={264}
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      breakpoint="lg"
      style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}
    >
      <div className="rat-brand">
        <span className="rat-brand__mark">RAT</span>
        {!collapsed && (
          <span className="rat-brand__text">
            <div className="rat-brand__title">Repo Analysis</div>
            <div className="rat-brand__sub">git · metrics</div>
          </span>
        )}
      </div>

      {!collapsed && (
        <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title="Refresh repositories">
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined style={{ color: '#7d8ba3' }} />}
              loading={loading}
              onClick={loadRepos}
            />
          </Tooltip>
        </div>
      )}

      <Menu
        theme="dark"
        mode="inline"
        items={items}
        selectedKeys={selectedKeys}
        openKeys={collapsed ? undefined : openKeys}
        onOpenChange={setOpenKeys}
        onClick={({ key }) => {
          if (typeof key === 'string' && key.startsWith('/')) navigate(key);
          if (key === '/') navigate('/');
        }}
        style={{ background: 'transparent' }}
      />

      {!loading && repos.length === 0 && !collapsed && (
        <div style={{ padding: '24px 12px' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ color: '#64748b', fontSize: 12 }}>No repositories yet</span>}
          />
        </div>
      )}
    </Sider>
  );
}
