import { Component } from 'react';
import { Button, Result, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

/**
 * Error boundary for the routed content area.
 *
 * React only supports error boundaries as class components: when anything
 * below this boundary throws during render, getDerivedStateFromError captures
 * the error and the fallback UI replaces the broken subtree instead of
 * unmounting the whole app to a blank page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // Keep the failure visible in the console for diagnostics.
    console.error('[ErrorBoundary] Unhandled render error:', error, errorInfo?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Result
        status="error"
        title="Something went wrong"
        subTitle="The dashboard hit an unexpected error while rendering. Reloading the page usually fixes it."
        extra={
          <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleReload}>
            Reload
          </Button>
        }
      >
        {error?.message ? (
          <Typography.Paragraph
            type="secondary"
            style={{ fontSize: 12, marginBottom: 0 }}
            copyable={{ text: String(error.message) }}
          >
            {String(error.message)}
          </Typography.Paragraph>
        ) : null}
      </Result>
    );
  }
}
