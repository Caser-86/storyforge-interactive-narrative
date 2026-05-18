"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/lib/store";

const CREATE_TIPS = [
  "AI 正在构建你的互动叙事世界...",
  "正在编织故事线索...",
  "角色正在登场...",
  "场景正在渲染...",
  "选择正在生成...",
];

const CHOICE_TIPS = [
  "故事正在推进...",
  "你的选择正在改变命运...",
  "新的场景正在展开...",
  "后果正在显现...",
];

const RESTORE_TIPS = [
  "正在恢复你的冒险...",
  "读取存档中...",
  "重建故事世界...",
];

export default function LoadingScreen() {
  const { lastAction, sessionId } = useGameStore();
  const [tipIndex, setTipIndex] = useState(0);

  const isRestore = !lastAction && sessionId;
  const isChoice = lastAction?.type === "choice";
  const tips = isRestore ? RESTORE_TIPS : isChoice ? CHOICE_TIPS : CREATE_TIPS;

  const actionLabel = isRestore
    ? "正在恢复存档..."
    : isChoice
    ? "正在推进故事..."
    : "正在生成首幕...";

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [tips.length]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e]">
      <div className="text-center px-4">
        <div className="w-16 h-16 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-300 text-lg">{actionLabel}</p>
        <p className="text-gray-500 text-sm mt-2 transition-opacity duration-500">
          {tips[tipIndex]}
        </p>
      </div>
    </div>
  );
}
