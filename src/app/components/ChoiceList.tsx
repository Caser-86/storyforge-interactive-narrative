"use client";

import { useGameStore } from "@/lib/store";

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

export default function ChoiceList() {
  const { currentScene, status, makeChoice, selectedChoice, setSelectedChoice } = useGameStore();

  if (!currentScene) return null;

  return (
    <div className="space-y-3 mb-6">
      <p className="text-gray-400 text-sm">选择你的行动：</p>
      {currentScene.choices.map((choice) => (
        <button
          key={choice.id}
          onClick={() => {
            if (status === "generating" || selectedChoice !== null) return;
            setSelectedChoice(choice.id);
            makeChoice(currentScene.id, choice.id);
          }}
          disabled={status === "generating" || selectedChoice !== null}
          className={`w-full text-left p-4 rounded-lg border-2 transition-all choice-button ${
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
  );
}
