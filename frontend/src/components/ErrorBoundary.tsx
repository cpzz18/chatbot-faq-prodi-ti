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
          className="flex min-h-screen items-center justify-center bg-bg-base p-6 text-text-primary"
          role="alert"
        >
          <div className="w-full max-w-[460px] rounded-[16px] border border-border-subtle bg-bg-surface px-6 py-7 text-center shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
            <h2 className="mt-0 mb-2.5 text-[1.15rem] font-semibold text-[#f87171]">
              Terjadi Kendala Tampilan
            </h2>
            <p className="mt-0 mb-5 text-[0.88rem] leading-[1.55] text-text-secondary">
              Aplikasi mengalami kendala tak terduga saat merender antarmuka. Anda
              dapat memuat ulang halaman untuk memulihkan sesi.
            </p>
            <button
              type="button"
              className="cursor-pointer rounded-[6px] border border-border-focus bg-accent-bg px-[18px] py-2 text-[0.82rem] font-medium text-white transition-colors duration-150 hover:bg-accent-bg-hover"
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
