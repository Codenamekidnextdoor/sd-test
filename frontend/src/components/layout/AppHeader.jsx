import { Layout, Tag, Typography } from 'antd';
import { useLocation, useParams } from 'react-router-dom';

const { Header } = Layout;

/**
 * Top bar with the product title. On repo routes it also shows the
 * repository breadcrumb (name passed via navigation state when available).
 */
export default function AppHeader() {
  const { id } = useParams();
  const location = useLocation();
  const repoName = location.state?.name || location.state?.repoName;
  const onAuthors = location.pathname.endsWith('/authors');

  return (
    <Header className="rat-header">
      <h1 className="rat-header__title">
        RAT <em>— Repo Analysis Tool</em>
      </h1>
      {id ? (
        <Typography.Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
          {repoName ? (
            <Tag color="cyan" style={{ marginRight: 8, fontWeight: 600 }}>
              {repoName}
            </Tag>
          ) : null}
          {onAuthors ? 'Author management' : 'Metrics dashboard'}
          <span className="rat-num" style={{ marginLeft: 8, color: '#94a3b8' }}>
            #{id}
          </span>
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Measure how repositories evolve — files, directories, authors &amp; churn
        </Typography.Text>
      )}
    </Header>
  );
}
