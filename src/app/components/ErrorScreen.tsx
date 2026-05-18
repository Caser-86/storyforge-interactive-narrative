"use client";

import { useGameStore } from "@/lib/store";

export default function ErrorScreen() {
  const { errorMessage, errorTraceId, reset, retryLast, lastAction } = useGameStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e] px-4">
      <div className="w-full max-w-md p-6 text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-white mb-2">出错了</h2>
        <p className="text-gray-400 mb-2">
          {errorMessage || "发生了未知错误，请重试"}
        </p>
        {errorTraceId && (
          <p className="text-xs text-gray-600 mb-6 font-mono">
            trace: {errorTraceId}
          </p>
        )}
        <div className="space-y-3">
          {lastAction && (
            <button
              onClick={retryLast}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-[#e94560] to-[#ff6b6b] text-white font-semibold hover:opacity-90 transition-opacity"
            >
              重试上一步
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-lg border border-[#333] text-gray-300 hover:bg-[#1a1a2e] transition-colors"
          >
            刷新页面
          </button>
          <button
            onClick={reset}
            className="w-full py-3 rounded-lg border border-[#333] text-gray-300 hover:bg-[#1a1a2e] transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
