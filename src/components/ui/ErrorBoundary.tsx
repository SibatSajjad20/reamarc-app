import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';
import { Button } from './button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  onGoHome?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    if (this.props.onReset) {
      this.setState({ hasError: false, error: undefined });
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-8 flex items-center justify-center min-h-[300px]">
          <ErrorState
            title="Something went wrong on this page"
            message={this.state.error?.message || 'An unexpected error occurred. Please try reloading.'}
            onRetry={this.handleReload}
            retryLabel="Reload page"
            secondaryAction={
              this.props.onGoHome ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    this.setState({ hasError: false, error: undefined });
                    this.props.onGoHome?.();
                  }}
                >
                  Go to dashboard
                </Button>
              ) : undefined
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
