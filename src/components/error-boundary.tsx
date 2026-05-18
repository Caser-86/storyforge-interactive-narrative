"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e] p-4">
          <div className="max-w-md w-full p-6 rounded-lg bg-[#1a1a2e] border border-[#333] text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-white mb-2">出了点问题</h2>
            <p className="text-gray-400 text-sm mb-4">
              {this.state.error?.message || "发生了未知错误"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
              className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#e94560] to-[#ff6b6b] text-white font-semibold hover:opacity-90 transition-opacity"
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
