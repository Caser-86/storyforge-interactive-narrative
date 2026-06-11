"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store";
import { apiFetch } from "@/lib/client-api";
import LlmStatusBanner from "./LlmStatusBanner";

interface StyleTemplate {
  id: string;
  label: string;
  genre: string;
  description: string;
  difficulty: "easy" | "normal" | "hard";
  lengthPreset: "short" | "medium" | "long";
  visualStyle: string;
  samplePrompt: string;
}

interface UserGame {
  id: string;
  seedPrompt: string;
  genre: string;
  status: string;
  createdAt: string;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "简单",
  normal: "普通",
  hard: "困难",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-green-500/20 text-green-400",
  normal: "bg-yellow-500/20 text-yellow-400",
  hard: "bg-red-500/20 text-red-400",
};

export default function StartScreen() {
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [rating, setRating] = useState("PG-13");
  const [visualStyle, setVisualStyle] = useState("");
  const [enableImages, setEnableImages] = useState(false);
  const [storyLengthPreset, setStoryLengthPreset] = useState<"short" | "medium" | "long">("short");
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [userGames, setUserGames] = useState<UserGame[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<StyleTemplate | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const { createGame, loadSession, status } = useGameStore();

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => setIsHydrated(true), 0);

    apiFetch<{ templates: StyleTemplate[] }>("/api/templates")
      .then((r) => { if (r.ok) setTemplates(r.data.templates || []); })
      .catch(() => {});

    const fingerprint = typeof window !== "undefined" ? localStorage.getItem("user_fingerprint") : null;
    if (fingerprint) {
      apiFetch<{ games: UserGame[] }>("/api/user", { fingerprint })
        .then((r) => { if (r.ok) setUserGames(r.data.games || []); })
        .catch(() => {});
    }

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const applyTemplate = (t: StyleTemplate) => {
    setSelectedTemplate(t.id);
    setPrompt(t.samplePrompt);
    setVisualStyle(t.visualStyle);
    setStoryLengthPreset(t.lengthPreset);
    setShowTemplates(false);
  };

  const handleTemplateSelect = (t: StyleTemplate) => {
    if (prompt.trim()) {
      setPendingTemplate(t);
    } else {
      applyTemplate(t);
    }
  };

  const confirmTemplateOverride = () => {
    if (pendingTemplate) {
      applyTemplate(pendingTemplate);
      setPendingTemplate(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e] px-4">
      <div className="w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-center mb-2 bg-gradient-to-r from-[#e94560] to-[#ff6b6b] bg-clip-text text-transparent">
          StoryForge
        </h1>
        <p className="text-center text-gray-400 mb-8 text-sm sm:text-base">
          输入一句话灵感，5 秒内开始你的互动冒险
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">你的灵感</label>
            <textarea
              value={prompt}
              disabled={!isHydrated}
              onChange={(e) => {
                setPrompt(e.target.value);
                setSelectedTemplate(null);
              }}
              placeholder="例如：一个赛博朋克风格的侦探悬疑故事"
              className="w-full h-24 px-4 py-3 rounded-lg bg-[#1a1a2e] border border-[#333] text-white placeholder-gray-500 focus:outline-none focus:border-[#e94560] resize-none disabled:opacity-60"
            />
          </div>

          <LlmStatusBanner />

          <div>
            <button
              type="button"
              data-testid="template-toggle"
              onClick={() => setShowTemplates(!showTemplates)}
              className="text-sm text-[#e94560] hover:underline"
            >
              {showTemplates ? "收起风格模板" : "选择风格模板 ▾"}
            </button>
            {showTemplates && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`template-${t.id}`}
                    onClick={() => handleTemplateSelect(t)}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      selectedTemplate === t.id
                        ? "border-[#e94560] bg-[#e94560]/10"
                        : "border-[#333] bg-[#1a1a2e] hover:border-[#555]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{t.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[t.difficulty]}`}>
                        {DIFFICULTY_LABELS[t.difficulty]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{t.description}</p>
                  </button>
                ))}
              </div>
            )}
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
                <option value="PG">PG - 建议指导</option>
                <option value="PG-13">PG-13 - 13+</option>
                <option value="R">R - 限制级</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">故事长度</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "short" as const, label: "短篇", desc: "7-12步", time: "约10分钟", steps: "预计7-12步完成" },
                { value: "medium" as const, label: "中篇", desc: "20-40步", time: "约30分钟", steps: "预计20-40步完成" },
                { value: "long" as const, label: "长篇", desc: "50-100步", time: "约1小时", steps: "预计50-100步完成" },
              ]).map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  data-testid={`length-${opt.value}`}
                  onClick={() => setStoryLengthPreset(opt.value)}
                  className={`p-2 rounded-lg border text-center transition-colors ${
                    storyLengthPreset === opt.value
                      ? "border-[#e94560] bg-[#e94560]/10"
                      : "border-[#333] bg-[#1a1a2e] hover:border-[#555]"
                  }`}
                >
                  <span className="block text-sm font-medium text-white">{opt.label}</span>
                  <span className="block text-xs text-gray-400">{opt.desc}</span>
                  <span className="block text-xs text-gray-500">{opt.time}</span>
                </button>
              ))}
            </div>
            {storyLengthPreset === "long" && (
              <p className="mt-2 text-xs text-yellow-400/80">
                ⚠️ 长篇模式需要更长的生成时间和更多 token，建议在网络稳定时使用
              </p>
            )}
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

          <label className="flex items-center justify-between rounded-lg border border-[#333] bg-[#1a1a2e]/80 px-4 py-3">
            <span>
              <span className="block text-sm text-gray-200">场景图</span>
              <span className="block text-xs text-gray-500">默认关闭，可作为附属功能开启</span>
            </span>
            <input
              type="checkbox"
              checked={enableImages}
              onChange={(e) => setEnableImages(e.target.checked)}
              className="h-4 w-4 accent-[#e94560]"
            />
          </label>

          <button
            onClick={async () => {
              if (isCreating) return;
              setIsCreating(true);
              try {
                await createGame(prompt, language, rating, {
                  storyLengthPreset,
                  ...(visualStyle ? { visualStyle } : {}),
                  ...(enableImages ? { enableImages: true } : {}),
                });
              } finally {
                setIsCreating(false);
              }
            }}
            disabled={!isHydrated || !prompt.trim() || isCreating || status === "generating"}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-[#e94560] to-[#ff6b6b] text-white font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating || status === "generating" ? "正在创建..." : "开始冒险"}
          </button>

          {userGames.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm text-gray-400 mb-2">之前的冒险</h2>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {userGames.filter((g) => g.status === "active").slice(0, 5).map((game) => (
                  <button
                    key={game.id}
                    onClick={() => {
                      const ownerToken = localStorage.getItem("game_ownerToken");
                      loadSession(game.id, ownerToken);
                    }}
                    className="w-full text-left p-3 rounded-lg bg-[#1a1a2e] border border-[#333] hover:border-[#e94560] transition-colors"
                  >
                    <p className="text-sm text-white truncate">{game.seedPrompt}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs text-gray-500">{game.genre}</span>
                      <span className="text-xs text-gray-600">{new Date(game.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {pendingTemplate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPendingTemplate(null)}>
            <div className="bg-[#1a1a2e] border border-[#333] rounded-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-white font-semibold mb-2">替换灵感？</h3>
              <p className="text-gray-400 text-sm mb-4">
                你已输入了灵感内容，选择模板会替换当前内容。是否继续？
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setPendingTemplate(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmTemplateOverride}
                  className="px-4 py-2 text-sm bg-[#e94560] text-white rounded-lg hover:bg-[#e94560]/80 transition-colors"
                >
                  替换
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
