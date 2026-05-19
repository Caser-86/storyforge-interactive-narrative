"use client";

import { useGameStore } from "@/lib/store";

const riskColors: Record<string, string> = {
  low: "border-green-500/50 text-green-400 hover:bg-green-500/10",
  medium: "border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10",
  high: "border-red-500/50 text-red-400 hover:bg-red-500/10",
};

const riskPrefixes: Record<string, string> = {
  low: "🔍 调查",
  medium: "⚔️ 行动",
  high: "💬 交涉",
};

export default function ChoiceList() {
  const { currentScene, status, makeChoice, selectedChoice, setSelectedChoice } = useGameStore();

  if (!currentScene) return null;

  const isDisabled = status === "generating" || selectedChoice !== null;

  return (
    <div className="space-y-3 mb-6">
      <p className="text-gray-400 text-sm">
        {status === "generating" ? "正在推进故事..." : "选择你的行动："}
      </p>
      {currentScene.choices.map((choice) => {
        const isSelected = selectedChoice === choice.id;
        return (
          <button
            key={choice.id}
            onClick={() => {
              if (isDisabled) return;
              setSelectedChoice(choice.id);
              makeChoice(currentScene.id, choice.id);
            }}
            disabled={isDisabled}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
              isSelected
                ? "border-[#e94560] bg-[#e94560]/10 scale-[0.98]"
                : riskColors[choice.risk]
            } ${isDisabled && !isSelected ? "opacity-40 cursor-not-allowed" : isDisabled && isSelected ? "cursor-wait" : "cursor-pointer"}`}
          >
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="font-semibold break-words">
                {isSelected && status === "generating" ? "⏳ " : ""}{choice.label}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-black/30 whitespace-nowrap shrink-0">
                {riskPrefixes[choice.risk] || choice.risk}
              </span>
            </div>
            <p className="text-sm opacity-70 break-words">{choice.preview}</p>
          </button>
        );
      })}
    </div>
  );
}
