import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './App.jsx';
import './index.css';

const theme = {
  token: {
    colorPrimary: '#0f766e',
    colorInfo: '#0f766e',
    colorLink: '#0f766e',
    colorSuccess: '#16a34a',
    colorError: '#dc2626',
    colorWarning: '#d97706',
    borderRadius: 8,
    colorBgLayout: '#f4f6f9',
    fontFamily:
      "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
  },
  components: {
    Layout: {
      siderBg: '#0c1424',
      headerBg: '#ffffff',
      headerHeight: 60,
      headerPadding: '0 24px'
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(15, 118, 110, 0.28)',
      darkItemHoverBg: 'rgba(148, 163, 184, 0.12)',
      itemBorderRadius: 8
    },
    Card: {
      headerFontSize: 14
    },
    Table: {
      headerBg: '#f8fafc'
    }
  }
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
