"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { apiFetch, formatApiError } from "@/lib/client-api";

interface ReplayScene {
  id?: string;
  turn: number;
  title: string;
  location: string;
  timeOfDay: string;
  mood: string[];
  body: string;
  npcs: Array<{ name: string; role: string; dialogue: string }>;
  chapterGoal: string;
  imageUrl?: string | null;
}

const ENDING_LABELS: Record<string, string> = {
  success: "圆满结局",
  bittersweet: "苦甜结局",
  failure: "失败结局",
  open: "开放式结局",
};

export default function SharePage() {
  const params = useParams();
  const token = params?.token as string;
  const [scenes, setScenes] = useState<ReplayScene[]>([]);
  const [seedPrompt, setSeedPrompt] = useState("");
  const [sessionStatus, setSessionStatus] = useState<string>("");
  const [endingType, setEndingType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    apiFetch<{ session: { seedPrompt: string; status: string; endingType: string | null }; scenes: ReplayScene[] }>(`/api/share/${token}`)
      .then((result) => {
        if (!result.ok) {
          setError(result.status === 404 ? "分享链接不存在或已过期" : formatApiError(result));
          setLoading(false);
          return;
        }
        const data = result.data;
        setSeedPrompt(data.session?.seedPrompt || "");
        setSessionStatus(data.session?.status || "");
        setEndingType(data.session?.endingType ?? null);
        const loadedScenes: ReplayScene[] = data.scenes || [];
        setScenes(loadedScenes);
        setLoading(false);

        loadedScenes.forEach((scene, idx) => {
          if (scene.id) {
            apiFetch<{ assets: Array<{ url: string }> }>(`/api/share/${token}/assets/${scene.id}`)
              .then((assetResult) => {
                if (assetResult.ok && assetResult.data.assets?.[0]?.url) {
                  setScenes((prev) =>
                    prev.map((s, i) => (i === idx ? { ...s, imageUrl: assetResult.data.assets[0].url } : s))
                  );
                }
              })
              .catch(() => {});
          }
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "加载失败");
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e]">
        <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/" className="text-[#e94560] hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">故事回放</h1>
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            ← 新故事
          </Link>
        </div>

        {seedPrompt && (
          <div className="mb-4 text-sm text-gray-400 italic">
            &ldquo;{seedPrompt}&rdquo;
          </div>
        )}

        <div className="space-y-6">
          {scenes.map((scene, i) => (
            <div key={i} className="scene-card">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded bg-[#e94560]/20 text-[#e94560]">
                  第 {scene.turn} 幕
                </span>
                <span className="text-gray-400 text-xs">
                  📍 {scene.location} · 🕐 {scene.timeOfDay}
                </span>
              </div>
              {scene.imageUrl && (
                <div className="mb-3 rounded-lg overflow-hidden border border-[#333] relative w-full h-64">
                  <Image
                    src={scene.imageUrl}
                    alt={scene.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 672px"
                  />
                </div>
              )}
              <h2 className="text-lg font-bold text-white mb-2">{scene.title}</h2>
              <p className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
                {scene.body}
              </p>
              {scene.npcs?.length > 0 && (
                <div className="mt-3 space-y-2">
                  {scene.npcs.map((npc, j) => (
                    <div key={j} className="npc-card bg-[#1a1a2e]/80 border border-[#333] rounded-lg p-3">
                      <span className="text-[#e94560] text-sm font-semibold">{npc.name}</span>
                      <span className="text-gray-500 text-xs ml-2">{npc.role}</span>
                      <p className="text-gray-300 italic text-xs mt-1">&ldquo;{npc.dialogue}&rdquo;</p>
                    </div>
                  ))}
                </div>
              )}
              {scene.chapterGoal && (
                <div className="mt-3 text-xs text-gray-500">
                  🎯 {scene.chapterGoal}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          {sessionStatus === "ended" ? (
            <div className="space-y-2">
              <div className="text-lg font-bold text-[#e94560]">
                {endingType ? (ENDING_LABELS[endingType] || "故事完结") : "故事完结"}
              </div>
              <div className="text-gray-500 text-sm">— 全剧终 —</div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">— 故事进行中 —</div>
          )}
        </div>
      </div>
    </div>
  );
}
