import { Button, Result } from 'antd';
import type { ReactNode } from 'react';
import { Component } from 'react';

type PageErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type PageErrorBoundaryState = {
  error?: Error;
};

export class PageErrorBoundary extends Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  state: PageErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('Page render failed', error, errorInfo);
  }

  componentDidUpdate(prevProps: PageErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: undefined });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-[24px] border border-rose-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Result
            status="error"
            title="页面渲染失败"
            subTitle="当前页面发生了未处理异常，但应用主体仍然可用。你可以重试，或切换命名空间后自动恢复。"
            extra={[
              <Button
                key="retry"
                type="primary"
                onClick={() => this.setState({ error: undefined })}
              >
                重试
              </Button>,
              <Button key="reload" onClick={() => window.location.reload()}>
                刷新页面
              </Button>,
            ]}
          />
        </section>
      );
    }

    return this.props.children;
  }
}
