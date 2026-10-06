import { Layout } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppHeader from './components/layout/AppHeader.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import AuthorPage from './pages/AuthorPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import RepoListPage from './pages/RepoListPage.jsx';
import { FilterProvider } from './context/FilterContext.jsx';

export default function App() {
  return (
    <FilterProvider>
      <Layout style={{ minHeight: '100vh' }}>
        <Sidebar />
        <Layout>
          <AppHeader />
          <Layout.Content style={{ padding: '20px 24px 32px' }}>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<RepoListPage />} />
                <Route path="/repo/:id" element={<DashboardPage />} />
                <Route path="/repo/:id/authors" element={<AuthorPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </Layout.Content>
        </Layout>
      </Layout>
    </FilterProvider>
  );
}
