import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useSimStore } from '../store/useSimStore';

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
    console.error('全域錯誤邊界攔截異常:', error, info);
  }

  handleReset = () => {
    try {
      useSimStore.getState().resetPose();
    } catch {
      // 忽略重置過程中的殘留狀態
    }
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#090d16] p-6 text-center text-slate-200">
          <div className="max-w-md rounded-xl border border-red-500/50 bg-red-950/40 p-5 space-y-3 shadow-2xl">
            <h2 className="text-sm font-semibold text-red-300">模擬系統發生異常</h2>
            <p className="text-xs text-red-200/80 font-mono break-all">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg border border-red-400/50 bg-red-500/20 px-4 py-2 text-xs font-medium text-red-100 hover:bg-red-500/30 cursor-pointer"
            >
              重置模擬
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
