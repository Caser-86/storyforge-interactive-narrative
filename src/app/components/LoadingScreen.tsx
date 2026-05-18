"use client";

import { useState, useEffect } from "react";

const LOADING_TIPS = [
  "AI 正在构建你的互动叙事世界...",
  "正在编织故事线索...",
  "角色正在登场...",
  "场景正在渲染...",
  "选择正在生成...",
];

export default function LoadingScreen() {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % LOADING_TIPS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#16213e]">
      <div className="text-center px-4">
        <div className="w-16 h-16 border-4 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-300 text-lg">正在生成你的故事...</p>
        <p className="text-gray-500 text-sm mt-2 transition-opacity duration-500">
          {LOADING_TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}
