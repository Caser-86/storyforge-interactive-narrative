"use client";

import { useCallback } from "react";
import Image from "next/image";
import { useGameStore } from "@/lib/store";
import BgmPlayer from "./BgmPlayer";

export default function VisualPanel() {
  const { currentScene, imageStatus, imageUrl, imageJobId, ownerToken, pollAsset } = useGameStore();

  const handleRegenerateImage = useCallback(async () => {
    if (!imageJobId) return;
    useGameStore.setState({ imageStatus: "queued", imageUrl: null });
    try {
      const headers: Record<string, string> = {};
      if (ownerToken) headers["x-owner-token"] = ownerToken;
      const res = await fetch(`/api/assets/${imageJobId}`, { method: "POST", headers });
      if (res.ok) {
        pollAsset();
      }
    } catch {
      useGameStore.setState({ imageStatus: "failed" });
    }
  }, [pollAsset, imageJobId, ownerToken]);

  const handleHdRegenerate = useCallback(async () => {
    if (!imageJobId) return;
    useGameStore.setState({ imageStatus: "queued", imageUrl: null });
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (ownerToken) headers["x-owner-token"] = ownerToken;
      const res = await fetch(`/api/assets/${imageJobId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ quality: "high" }),
      });
      if (res.ok) {
        pollAsset();
      }
    } catch {
      useGameStore.setState({ imageStatus: "failed" });
    }
  }, [pollAsset, imageJobId, ownerToken]);

  if (!currentScene || !imageJobId) return null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-400 text-sm">场景插图</p>
          {(imageStatus === "completed" || imageStatus === "failed") && (
            <div className="flex gap-2">
              <button
                onClick={handleRegenerateImage}
                className="text-xs text-[#e94560] hover:underline"
              >
                重新生成
              </button>
              {imageStatus === "completed" && (
                <button
                  onClick={handleHdRegenerate}
                  className="text-xs text-blue-400 hover:underline"
                  title="高清重绘消耗更多资源"
                >
                  高清重绘 ⚡
                </button>
              )}
            </div>
          )}
          {(imageStatus === "queued" || imageStatus === "generating") && (
            <span className="text-xs text-yellow-400">
              {imageStatus === "queued" ? "排队中..." : "生成中..."}
            </span>
          )}
        </div>
        <div className="aspect-video rounded-lg overflow-hidden bg-[#1a1a2e] border border-[#333]">
          {imageStatus === "completed" && imageUrl ? (
            <Image
              src={imageUrl}
              alt={currentScene.title}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                {imageStatus === "generating" || imageStatus === "queued" ? (
                  <>
                    <div className="w-full h-full absolute inset-0 animate-pulse bg-gradient-to-r from-[#1a1a2e] via-[#2a2a3e] to-[#1a1a2e]" />
                    <div className="relative z-10">
                      <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">
                        {imageStatus === "queued" ? "排队等待中..." : "AI 绘制中..."}
                      </p>
                    </div>
                  </>
                ) : imageStatus === "failed" ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${
                        currentScene.mood.includes("雨") ? "#1a2a3a" : "#2a1a3a"
                      }, #0a0a1a)`,
                    }}
                  >
                    <div className="text-center">
                      <p className="text-gray-500 text-sm mb-2">图片生成失败</p>
                      <p className="text-gray-600 text-xs">继续冒险不受影响</p>
                      <button
                        onClick={handleRegenerateImage}
                        className="mt-2 text-xs text-[#e94560] hover:underline"
                      >
                        重新生成
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-gray-400 text-sm mb-2">BGM</p>
        <BgmPlayer bgmCue={currentScene.bgmCue} />
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
  );
}
