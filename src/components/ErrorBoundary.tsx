import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3D Scene ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[#090d16] p-6 text-center text-slate-200">
          <div className="max-w-md rounded-xl border border-red-500/40 bg-red-950/30 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-red-300">3D 渲染引擎發生異常</h2>
            <p className="text-xs text-slate-400 font-mono">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="rounded-lg border border-sky-500/40 bg-sky-500/20 px-4 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/30 cursor-pointer"
            >
              重新載入 3D 場景
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
