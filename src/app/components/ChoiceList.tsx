"use client";

import { useGameStore } from "@/lib/store";
import type { ChoiceRoute } from "@/lib/schemas";

const riskColors: Record<string, string> = {
  low: "border-green-500/50 text-green-400 hover:bg-green-500/10",
  medium: "border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10",
  high: "border-red-500/50 text-red-400 hover:bg-red-500/10",
};

const routeLabels: Record<ChoiceRoute, { icon: string; text: string }> = {
  investigate: { icon: "🔍", text: "调查" },
  act: { icon: "⚔️", text: "行动" },
  social: { icon: "💬", text: "交涉" },
  stealth: { icon: "🥷", text: "潜行" },
  sacrifice: { icon: "💀", text: "牺牲" },
};

const riskPrefixes: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

export default function ChoiceList() {
  const { currentScene, status, makeChoice, selectedChoice, setSelectedChoice, isEnding } = useGameStore();

  if (!currentScene) return null;

  if (isEnding || status === "ended") return null;

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
            data-testid={`choice-${choice.id}`}
            data-risk={choice.risk}
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
              <div className="flex items-center gap-1 shrink-0">
                {choice.route && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 whitespace-nowrap">
                    {routeLabels[choice.route].icon} {routeLabels[choice.route].text}
                  </span>
                )}
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-black/30 whitespace-nowrap">
                  {riskPrefixes[choice.risk] || choice.risk}
                </span>
              </div>
            </div>
            <p className="text-sm opacity-70 break-words">{choice.preview}</p>
          </button>
        );
      })}
    </div>
  );
}
