"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store";

export default function StatusPanel() {
  const { currentScene, stateDiff, history } = useGameStore();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

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
              <div key={i}>
                <button
                  onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  className="w-full text-left text-xs p-2 bg-[#1a1a2e]/50 rounded hover:bg-[#1a1a2e]/80 transition-colors"
                >
                  <span className="text-gray-500 mr-1">{expandedIdx === i ? "▼" : "▶"}</span>
                  <span className="text-gray-400">{h.title}</span>
                  {h.choiceLabel && (
                    <span className="text-[#e94560]"> → {h.choiceLabel}</span>
                  )}
                </button>
                {expandedIdx === i && (
                  <div className="mt-1 ml-3 p-2 bg-[#1a1a2e]/40 border border-[#2a2a4a] rounded text-xs space-y-1.5">
                    {h.location && (
                      <p className="text-gray-500">📍 {h.location} · 🕐 {h.timeOfDay}</p>
                    )}
                    {h.mood.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {h.mood.map((m, mi) => (
                          <span key={mi} className="px-1 py-0.5 rounded bg-[#e94560]/10 text-[#e94560] text-[10px]">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-gray-400 leading-relaxed whitespace-pre-wrap break-words line-clamp-4">
                      {h.body}
                    </p>
                    {h.npcs.length > 0 && (
                      <div className="space-y-1">
                        {h.npcs.map((npc, ni) => (
                          <div key={ni} className="bg-[#1e1e38]/40 rounded p-1.5">
                            <span className="text-[#e94560]">{npc.name}</span>
                            <span className="text-gray-500 ml-1">{npc.role}</span>
                            <p className="text-gray-400 italic">&ldquo;{npc.dialogue}&rdquo;</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {h.choicePreview && (
                      <p className="text-gray-500 italic border-t border-[#333] pt-1">
                        预览：{h.choicePreview}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
