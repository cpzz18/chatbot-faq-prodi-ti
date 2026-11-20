import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught render error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="error-boundary-screen" role="alert">
          <div className="error-boundary-card">
            <h2 className="error-boundary-title">Terjadi Kendala Tampilan</h2>
            <p className="error-boundary-desc">
              Aplikasi mengalami kendala tak terduga saat merender antarmuka. Anda
              dapat memuat ulang halaman untuk memulihkan sesi.
            </p>
            <button
              type="button"
              className="send-btn error-boundary-btn"
              onClick={this.handleReset}
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
