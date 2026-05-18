"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store";
import ChoiceList from "./ChoiceList";

export default function StoryPanel() {
  const { currentScene, stateDiff, safety, timing, history, reset, sessionId, ownerToken } = useGameStore();
  const [shareCopied, setShareCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showStateDiff, setShowStateDiff] = useState(false);

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
      const headers: Record<string, string> = {};
      if (ownerToken) headers["x-owner-token"] = ownerToken;
      const res = await fetch(`/api/games/${sessionId}/export?format=${format}`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setExportError(`导出失败：${err.message || `HTTP ${res.status}`}${err.traceId ? ` (trace: ${err.traceId})` : ""}`);
        return;
      }
      const blob = await res.blob();
      const ext = format === "markdown" ? "md" : format;
      const filename = `story-${sessionId.slice(0, 8)}.${ext}`;
      const url = URL.createObjectURL(blob);
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
      const headers: Record<string, string> = {};
      if (ownerToken) headers["x-owner-token"] = ownerToken;
      const res = await fetch(`/api/games/${sessionId}/share`, { method: "POST", headers });
      if (res.ok) {
        const data = await res.json();
        await navigator.clipboard.writeText(data.shareUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto scene-card">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={reset}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          ← 新故事
        </button>
        <div className="flex items-center gap-3">
          {sessionId && (
            <div className="flex gap-1">
              <button
                onClick={() => handleExport("json")}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                JSON
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={() => handleExport("markdown")}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Markdown
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={handleShare}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {shareCopied ? "已复制!" : "分享"}
              </button>
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
        <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">
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
                <p className="text-gray-200 italic text-sm leading-relaxed">&ldquo;{npc.dialogue}&rdquo;</p>
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
          <p className="text-gray-500 text-xs mb-3">历史选择</p>
          <div className="relative pl-4 border-l-2 border-[#333]">
            {history.slice(0, -1).map((h, i) => (
              <div key={i} className="relative mb-3 last:mb-0">
                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-[#333] border-2 border-[#1a1a2e]" />
                <p className="text-xs text-gray-400">{h.title}</p>
                {h.choiceLabel && (
                  <p className="text-xs text-[#e94560] mt-0.5">→ {h.choiceLabel}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
