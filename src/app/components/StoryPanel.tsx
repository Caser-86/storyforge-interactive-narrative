"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store";
import { apiFetch, formatApiError } from "@/lib/client-api";
import ChoiceList from "./ChoiceList";

export default function StoryPanel() {
  const { currentScene, stateDiff, safety, timing, history, reset, sessionId, ownerToken } = useGameStore();
  const [shareCopied, setShareCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showStateDiff, setShowStateDiff] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Set<number>>(new Set());
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    if (Object.keys(stateDiff).length > 0) {
      const showTimer = setTimeout(() => setShowStateDiff(true), 0);
      const hideTimer = setTimeout(() => setShowStateDiff(false), 4000);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [stateDiff]);

  if (!currentScene) return null;

  const handleExport = async (format: "json" | "markdown") => {
    if (!sessionId) return;
    setExportError(null);
    try {
      const result = await apiFetch<Blob>(`/api/games/${sessionId}/export?format=${format}`, {
        ownerToken,
        responseType: "blob",
      });
      if (!result.ok) {
        setExportError(`导出失败：${formatApiError(result)}`);
        return;
      }
      const ext = format === "markdown" ? "md" : format;
      const filename = `story-${sessionId.slice(0, 8)}.${ext}`;
      const url = URL.createObjectURL(result.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("导出失败，请重试");
    }
  };

  const handleShare = async () => {
    if (!sessionId) return;
    try {
      const result = await apiFetch<{ shareUrl: string }>(`/api/games/${sessionId}/share`, {
        method: "POST",
        ownerToken,
      });
      if (result.ok) {
        await navigator.clipboard.writeText(result.data.shareUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto scene-card">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setShowEndConfirm(true)}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          ← 新故事
        </button>
        <div className="flex items-center gap-3">
          {sessionId && (
            <div className="flex gap-1 items-center relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                导出 ▾
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={handleShare}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {shareCopied ? "已复制!" : "分享"}
              </button>
              {showExportMenu && (
                <div className="absolute top-6 right-0 bg-[#1a1a2e] border border-[#333] rounded-lg shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => { setShowExportMenu(false); handleExport("json"); }}
                    className="block w-full px-4 py-2 text-sm text-gray-300 hover:bg-[#2a2a4a] text-left"
                  >
                    JSON 格式
                  </button>
                  <button
                    onClick={() => { setShowExportMenu(false); handleExport("markdown"); }}
                    className="block w-full px-4 py-2 text-sm text-gray-300 hover:bg-[#2a2a4a] text-left"
                  >
                    Markdown 格式
                  </button>
                </div>
              )}
            </div>
          )}
          {exportError && (
            <span className="text-xs text-red-400">{exportError}</span>
          )}
          {timing.llmMs && (
            <span className="text-gray-500 text-xs">
              生成耗时 {timing.llmMs}ms
            </span>
          )}
        </div>
      </div>

      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowEndConfirm(false)}>
          <div className="bg-[#1a1a2e] border border-[#333] rounded-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-2">结束当前故事？</h3>
            <p className="text-gray-400 text-sm mb-4">你可以稍后从&ldquo;之前的冒险&rdquo;继续这局游戏。</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => { setShowEndConfirm(false); reset(); }}
                className="px-4 py-2 text-sm bg-[#e94560] text-white rounded-lg hover:bg-[#e94560]/80 transition-colors"
              >
                结束故事
              </button>
            </div>
          </div>
        </div>
      )}

      {currentScene.chapterGoal && (
        <div className="mb-4 p-2.5 rounded-lg bg-[#0f3460]/30 border border-[#0f3460]/60 sticky top-0 z-10 backdrop-blur-sm">
          <p className="text-xs text-blue-300">
            🎯 {currentScene.chapterGoal}
          </p>
        </div>
      )}

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          {currentScene.mood.map((m, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs rounded-full bg-[#e94560]/20 text-[#e94560] tag-pill"
            >
              {m}
            </span>
          ))}
        </div>
        <h2 className="text-2xl font-bold text-white">{currentScene.title}</h2>
        <p className="text-gray-400 text-sm mt-1">
          📍 {currentScene.location} · 🕐 {currentScene.timeOfDay}
        </p>
      </div>

      <div className="prose prose-invert max-w-none mb-6">
        <p className="text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
          {currentScene.body}
        </p>
      </div>

      {currentScene.npcs.length > 0 && (
        <div className="mb-6 space-y-3">
          {currentScene.npcs.map((npc) => (
            <div
              key={npc.id}
              className="relative ml-4 npc-card"
            >
              <div className="absolute left-0 top-3 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-[#1e1e38]" />
              <div className="bg-[#1e1e38] border border-[#3a3a5a] rounded-lg p-4 ml-2">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[#e94560] font-semibold text-sm">{npc.name}</span>
                  <span className="text-gray-500 text-xs px-1.5 py-0.5 rounded bg-[#2a2a4a]">{npc.role}</span>
                  <span className="text-gray-500 text-xs">{npc.attitude}</span>
                </div>
                <p className="text-gray-200 italic text-sm leading-relaxed break-words">&ldquo;{npc.dialogue}&rdquo;</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(stateDiff).length > 0 && (
        <div className={`mb-4 p-3 rounded-lg bg-[#1a1a2e]/50 border border-[#333] transition-all duration-500 ${showStateDiff ? "opacity-100 border-[#e94560]/30" : "opacity-40"}`}>
          <p className="text-xs text-gray-400 mb-1">状态变化</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stateDiff).map(([key, value]) => (
              <span
                key={key}
                className={`text-xs px-2 py-0.5 rounded ${
                  value > 0
                    ? "bg-green-500/20 text-green-400"
                    : value < 0
                    ? "bg-red-500/20 text-red-400"
                    : "bg-gray-500/20 text-gray-400"
                }`}
              >
                {key}: {value > 0 ? "+" : ""}{value}
              </span>
            ))}
          </div>
        </div>
      )}

      {safety && safety.contentWarnings.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-xs text-yellow-400">
            ⚠️ 内容提示：{safety.contentWarnings.join("、")}
          </p>
        </div>
      )}

      <ChoiceList />

      {history.length > 1 && (
        <div className="border-t border-[#333] pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-500 text-xs">历史选择</p>
            <button
              onClick={() => setShowArchive(true)}
              className="text-xs text-[#e94560] hover:underline"
            >
              📜 查看存档
            </button>
          </div>
          <div className="relative pl-4 border-l-2 border-[#333]">
            {history.slice(0, -1).map((h, i) => {
              const isExpanded = expandedHistory.has(i);
              return (
                <div key={i} className="relative mb-3 last:mb-0">
                  <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-[#333] border-2 border-[#1a1a2e]" />
                  <button
                    onClick={() => {
                      setExpandedHistory((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      });
                    }}
                    className="text-left w-full"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">{isExpanded ? "▼" : "▶"}</span>
                      <p className="text-xs text-gray-400">{h.title}</p>
                    </div>
                    {h.choiceLabel && (
                      <p className="text-xs text-[#e94560] mt-0.5 ml-4">
                        → {h.choiceLabel}
                        {h.choiceRisk && (
                          <span className={`ml-1 text-[10px] px-1 py-0.5 rounded ${
                            h.choiceRisk === "high" ? "bg-red-500/20 text-red-400" :
                            h.choiceRisk === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-green-500/20 text-green-400"
                          }`}>
                            {h.choiceRisk === "high" ? "高风险" : h.choiceRisk === "medium" ? "中风险" : "低风险"}
                          </span>
                        )}
                      </p>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="mt-2 ml-4 p-3 rounded-lg bg-[#1a1a2e]/60 border border-[#2a2a4a] text-xs">
                      <div className="flex items-center gap-2 mb-2 text-gray-500">
                        <span>📍 {h.location}</span>
                        <span>🕐 {h.timeOfDay}</span>
                      </div>
                      {h.mood.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {h.mood.map((m, mi) => (
                            <span key={mi} className="px-1.5 py-0.5 rounded-full bg-[#e94560]/15 text-[#e94560] text-[10px]">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-gray-300 leading-relaxed whitespace-pre-wrap break-words line-clamp-6">
                        {h.body}
                      </p>
                      {h.npcs.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {h.npcs.map((npc, ni) => (
                            <div key={ni} className="bg-[#1e1e38]/60 border border-[#3a3a5a] rounded p-2">
                              <span className="text-[#e94560] font-semibold">{npc.name}</span>
                              <span className="text-gray-500 ml-1">{npc.role}</span>
                              <p className="text-gray-300 italic mt-0.5">&ldquo;{npc.dialogue}&rdquo;</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {h.choicePreview && (
                        <p className="mt-2 text-gray-500 italic border-t border-[#333] pt-2">
                          选择预览：{h.choicePreview}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showArchive && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowArchive(false)}>
          <div
            className="bg-[#0a0a1a] border border-[#333] rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#0a0a1a] border-b border-[#333] p-4 flex items-center justify-between z-10">
              <h3 className="text-white font-semibold">📜 存档汇总</h3>
              <button
                onClick={() => setShowArchive(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              {history.map((h, i) => (
                <div key={i} className="scene-card">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-[#e94560]/20 text-[#e94560]">
                      第 {i + 1} 幕
                    </span>
                    {h.location && (
                      <span className="text-gray-500 text-xs">📍 {h.location}</span>
                    )}
                    {h.timeOfDay && (
                      <span className="text-gray-500 text-xs">🕐 {h.timeOfDay}</span>
                    )}
                  </div>
                  <h4 className="text-base font-bold text-white mb-2">{h.title}</h4>
                  {h.mood.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {h.mood.map((m, mi) => (
                        <span key={mi} className="px-1.5 py-0.5 rounded-full bg-[#e94560]/15 text-[#e94560] text-[10px]">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-gray-200 leading-relaxed whitespace-pre-wrap break-words text-sm">
                    {h.body}
                  </p>
                  {h.npcs.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {h.npcs.map((npc, ni) => (
                        <div key={ni} className="npc-card bg-[#1e1e38] border border-[#3a3a5a] rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[#e94560] font-semibold text-sm">{npc.name}</span>
                            <span className="text-gray-500 text-xs px-1.5 py-0.5 rounded bg-[#2a2a4a]">{npc.role}</span>
                            <span className="text-gray-500 text-xs">{npc.attitude}</span>
                          </div>
                          <p className="text-gray-200 italic text-sm">&ldquo;{npc.dialogue}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {h.choiceLabel && (
                    <div className="mt-3 p-2 rounded-lg bg-[#e94560]/10 border border-[#e94560]/30">
                      <div className="flex items-center gap-2">
                        <span className="text-[#e94560] text-sm font-semibold">→ {h.choiceLabel}</span>
                        {h.choiceRisk && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            h.choiceRisk === "high" ? "bg-red-500/20 text-red-400" :
                            h.choiceRisk === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-green-500/20 text-green-400"
                          }`}>
                            {h.choiceRisk === "high" ? "高风险" : h.choiceRisk === "medium" ? "中风险" : "低风险"}
                          </span>
                        )}
                      </div>
                      {h.choicePreview && (
                        <p className="text-gray-400 text-xs mt-1">{h.choicePreview}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="text-center text-gray-500 text-sm py-4">— 故事继续 —</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
