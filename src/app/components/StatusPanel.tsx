"use client";

import { useGameStore } from "@/lib/store";

export default function StatusPanel() {
  const { currentScene, stateDiff, history } = useGameStore();

  if (!currentScene) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-gray-400 text-sm mb-2">当前状态</p>
        <div className="bg-[#1a1a2e]/80 border border-[#333] rounded-lg p-4 space-y-2">
          {Object.entries(stateDiff).length > 0 ? (
            Object.entries(stateDiff).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{key}</span>
                <span
                  className={`text-xs font-mono ${
                    value > 0
                      ? "text-green-400"
                      : value < 0
                      ? "text-red-400"
                      : "text-gray-400"
                  }`}
                >
                  {value > 0 ? "+" : ""}{value}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-500">暂无状态变化</p>
          )}
        </div>
      </div>

      {currentScene.chapterGoal && (
        <div className="p-3 rounded-lg bg-[#0f3460]/30 border border-[#0f3460]">
          <p className="text-xs text-blue-300">
            🎯 章节目标：{currentScene.chapterGoal}
          </p>
        </div>
      )}

      {currentScene.memorySummary && (
        <div className="p-3 rounded-lg bg-[#1a1a2e]/50 border border-[#333]">
          <p className="text-xs text-gray-400 mb-1">记忆摘要</p>
          <p className="text-xs text-gray-300">{currentScene.memorySummary}</p>
        </div>
      )}

      {history.length > 1 && (
        <div>
          <p className="text-gray-400 text-sm mb-2">历史选择</p>
          <div className="space-y-1">
            {history.slice(0, -1).map((h, i) => (
              <div key={i} className="text-xs text-gray-500 p-2 bg-[#1a1a2e]/50 rounded">
                <span className="text-gray-400">{h.title}</span>
                {h.choiceLabel && (
                  <span className="text-[#e94560]"> → {h.choiceLabel}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
