"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [rating, setRating] = useState("PG-13");
  const [visualStyle, setVisualStyle] = useState("");

  const { status, currentScene, createGame, makeChoice, reset } = useGameStore();

  if (status === "idle") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e]">
        <div className="w-full max-w-lg p-8">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-[#e94560] to-[#ff6b6b] bg-clip-text text-transparent">
            互动叙事生成器
          </h1>
          <p className="text-center text-gray-400 mb-8">
            输入一句话灵感，5 秒内开始你的互动冒险
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">你的灵感</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：一个赛博朋克风格的侦探悬疑故事"
                className="w-full h-24 px-4 py-3 rounded-lg bg-[#1a1a2e] border border-[#333] text-white placeholder-gray-500 focus:outline-none focus:border-[#e94560] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">语言</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#1a1a2e] border border-[#333] text-white focus:outline-none focus:border-[#e94560]"
                >
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                  <option value="ja-JP">日本語</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">年龄分级</label>
                <select
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#1a1a2e] border border-[#333] text-white focus:outline-none focus:border-[#e94560]"
                >
                  <option value="G">G - 大众</option>
                  <option value="PG">PG - 建议 parental guidance</option>
                  <option value="PG-13">PG-13 - 13岁以上</option>
                  <option value="R">R - 限制级</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">视觉风格（可选）</label>
              <input
                value={visualStyle}
                onChange={(e) => setVisualStyle(e.target.value)}
                placeholder="例如：neon noir, 水墨风, 像素风"
                className="w-full px-4 py-2 rounded-lg bg-[#1a1a2e] border border-[#333] text-white placeholder-gray-500 focus:outline-none focus:border-[#e94560]"
              />
            </div>

            <button
              onClick={() => createGame(prompt, language, rating, visualStyle ? { visualStyle } : {})}
              disabled={!prompt.trim() || status === "generating"}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-[#e94560] to-[#ff6b6b] text-white font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              开始冒险
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "generating" && !currentScene) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">正在生成你的故事...</p>
          <p className="text-gray-500 text-sm mt-2">AI 正在构建你的互动叙事世界</p>
        </div>
      </div>
    );
  }

  if (currentScene) {
    return <GameScreen />;
  }

  return null;
}

function GameScreen() {
  const { currentScene, status, imageStatus, imageUrl, stateDiff, history, safety, timing, makeChoice, reset } = useGameStore();
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  if (!currentScene) return null;

  const riskColors: Record<string, string> = {
    low: "border-green-500/50 text-green-400 hover:bg-green-500/10",
    medium: "border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10",
    high: "border-red-500/50 text-red-400 hover:bg-red-500/10",
  };

  const riskLabels: Record<string, string> = {
    low: "低风险",
    medium: "中风险",
    high: "高风险",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e]">
      <div className="flex flex-col lg:flex-row min-h-screen">
        <div className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={reset}
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                ← 新故事
              </button>
              {timing.llmMs && (
                <span className="text-gray-500 text-xs">
                  生成耗时 {timing.llmMs}ms
                </span>
              )}
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                {currentScene.mood.map((m, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded-full bg-[#e94560]/20 text-[#e94560]"
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
                    className="bg-[#1a1a2e]/80 border border-[#333] rounded-lg p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[#e94560] font-semibold">{npc.name}</span>
                      <span className="text-gray-500 text-xs">· {npc.role}</span>
                      <span className="text-gray-500 text-xs">· {npc.attitude}</span>
                    </div>
                    <p className="text-gray-300 italic text-sm">&ldquo;{npc.dialogue}&rdquo;</p>
                  </div>
                ))}
              </div>
            )}

            {Object.keys(stateDiff).length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-[#1a1a2e]/50 border border-[#333]">
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

            <div className="space-y-3 mb-6">
              <p className="text-gray-400 text-sm">选择你的行动：</p>
              {currentScene.choices.map((choice) => (
                <button
                  key={choice.id}
                  onClick={() => {
                    if (status === "generating") return;
                    setSelectedChoice(choice.id);
                    makeChoice(currentScene.id, choice.id);
                  }}
                  disabled={status === "generating" || selectedChoice !== null}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedChoice === choice.id
                      ? "border-[#e94560] bg-[#e94560]/10"
                      : riskColors[choice.risk]
                  } ${status === "generating" || selectedChoice !== null ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{choice.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-black/30">
                      {riskLabels[choice.risk]}
                    </span>
                  </div>
                  <p className="text-sm opacity-70">{choice.preview}</p>
                </button>
              ))}
            </div>

            {history.length > 1 && (
              <div className="border-t border-[#333] pt-4">
                <p className="text-gray-500 text-xs mb-2">历史选择</p>
                <div className="space-y-1">
                  {history.slice(0, -1).map((h, i) => (
                    <div key={i} className="text-xs text-gray-500">
                      <span className="text-gray-400">{h.title}</span>
                      {h.choiceLabel && (
                        <span className="text-[#e94560]"> → {h.choiceLabel}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentScene.chapterGoal && (
              <div className="mt-4 p-3 rounded-lg bg-[#0f3460]/30 border border-[#0f3460]">
                <p className="text-xs text-blue-300">
                  🎯 章节目标：{currentScene.chapterGoal}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-[420px] p-6 lg:p-8 border-t lg:border-t-0 lg:border-l border-[#333]">
          <div className="space-y-6">
            <div>
              <p className="text-gray-400 text-sm mb-2">场景插图</p>
              <div className="aspect-video rounded-lg overflow-hidden bg-[#1a1a2e] border border-[#333]">
                {imageStatus === "completed" && imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={currentScene.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      {imageStatus === "generating" || imageStatus === "queued" ? (
                        <>
                          <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-gray-500 text-sm">生成中...</p>
                        </>
                      ) : imageStatus === "failed" ? (
                        <div
                          className="w-full h-full"
                          style={{
                            background: `linear-gradient(135deg, ${
                              currentScene.mood.includes("雨") ? "#1a2a3a" : "#2a1a3a"
                            }, #0a0a1a)`,
                          }}
                        >
                          <p className="text-gray-500 text-sm pt-8">图片生成失败，继续冒险</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-gray-400 text-sm mb-2">BGM 提示</p>
              <div className="bg-[#1a1a2e]/80 border border-[#333] rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">氛围</span>
                  <span className="text-xs text-gray-200">{currentScene.bgmCue.mood}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">BPM</span>
                  <span className="text-xs text-gray-200">{currentScene.bgmCue.bpm}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">循环</span>
                  <span className="text-xs text-gray-200">{currentScene.bgmCue.loopSeconds}s</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400">乐器</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {currentScene.bgmCue.instruments.map((inst, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded bg-[#0f3460]/50 text-blue-300"
                      >
                        {inst}
                      </span>
                    ))}
                  </div>
                </div>
                {currentScene.bgmCue.sfx.length > 0 && (
                  <div>
                    <span className="text-xs text-gray-400">音效</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {currentScene.bgmCue.sfx.map((s, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 rounded bg-[#333]/50 text-gray-300"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t border-[#333]">
                  <p className="text-xs text-gray-400 mb-1">音乐 Prompt</p>
                  <p className="text-xs text-gray-300 italic">{currentScene.bgmCue.musicPrompt}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-gray-400 text-sm mb-2">图像 Prompt</p>
              <div className="bg-[#1a1a2e]/80 border border-[#333] rounded-lg p-4">
                <p className="text-xs text-gray-300 leading-relaxed">
                  {currentScene.artPrompt.prompt}
                </p>
                <div className="flex gap-2 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-[#333]/50 text-gray-400">
                    {currentScene.artPrompt.aspectRatio}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-[#333]/50 text-gray-400">
                    seed: {currentScene.artPrompt.seedHint}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
