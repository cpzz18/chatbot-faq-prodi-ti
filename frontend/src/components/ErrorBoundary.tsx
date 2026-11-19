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
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0b0f17",
            color: "#f1f5f9",
            padding: "1.5rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              backgroundColor: "#161e2e",
              borderRadius: "0.75rem",
              padding: "2rem",
              border: "1px solid rgba(255,255,255,0.08)",
              textAlign: "center",
            }}
          >
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: "0.75rem",
                color: "#f87171",
              }}
            >
              Terjadi Kendala Tampilan
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#94a3b8",
                marginBottom: "1.5rem",
                lineHeight: 1.5,
              }}
            >
              Aplikasi mengalami kendala tak terduga saat merender antarmuka. Anda dapat
              memuat ulang halaman untuk memulihkan sesi.
            </p>
            <button
              onClick={this.handleReset}
              style={{
                backgroundColor: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
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
