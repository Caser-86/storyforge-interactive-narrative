import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleGenerationProvider } from "@/lib/authoring/generation/openai-provider";
import { createInteractiveState, generateInteractiveScene, interactiveTargetTurns } from "@/lib/interactive/generator";
import type { Project } from "@/lib/authoring/schemas";
import type { InteractiveChoice, InteractiveScene, InteractiveState } from "@/lib/interactive/schemas";

const project: Project = {
  id: "project-1",
  title: "第九档案室",
  premise: "一名档案员发现一扇不该存在的门。",
  genre: "悬疑",
  tone: "紧张",
  pointOfView: "third person",
  rating: "PG-13",
  sizePreset: "micro",
  targetNodeCount: 8,
  targetEndingCount: 2,
  status: "ready",
  activeDraftVersionId: null,
  settingsJson: { language: "Chinese" },
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

const state: InteractiveState = {
  seedPrompt: project.premise,
  turn: 6,
  targetTurns: 8,
  knownFacts: [],
  openThreads: [],
  resolvedThreads: [],
  lastChoiceImpact: "",
  endingReadiness: 0,
};

const previousScene: InteractiveScene = {
  title: "门前",
  body: "林缇站在门前。",
  summary: "她必须做出决定。",
  choices: [
    { id: "choice_a", label: "推门进入", intent: "确认门后的记录", risk: "medium", consequencePreview: "你会立即看到线索。" },
    { id: "choice_b", label: "先行调查", intent: "寻找更安全的入口", risk: "low", consequencePreview: "你会获得额外信息。" },
  ],
  isEnding: false,
  endingSummary: null,
};

const selectedChoice: InteractiveChoice = previousScene.choices[0]!;

describe("interactive scene generation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the penultimate turn interactive", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate").mockResolvedValue({
      data: {
        scene: {
          title: "门后",
          body: "门后亮起一排档案柜。",
          summary: "新的线索出现了。",
          choices: [
            { id: "choice_a", label: "查看档案", intent: "寻找记录", risk: "low", consequencePreview: "你会获得线索。" },
            { id: "choice_b", label: "离开房间", intent: "暂时撤退", risk: "medium", consequencePreview: "你会失去部分时间。" },
          ],
          isEnding: false,
          endingSummary: null,
        },
        statePatch: {},
      },
      rawResponse: "{}",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      model: "deepseek-v4-flash",
    });

    const result = await generateInteractiveScene({ project, state, previousScene, selectedChoice }, new OpenAICompatibleGenerationProvider());

    expect(result.scene.isEnding).toBe(false);
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Set isEnding to false and return exactly three meaningful choices.");
    expect(generate.mock.calls[0]?.[0].userPrompt).not.toContain("This is the final planned turn.");
  });

  it("uses one bounded-turn policy for every project size", () => {
    expect(interactiveTargetTurns({ ...project, sizePreset: "micro" })).toBe(6);
    expect(interactiveTargetTurns({ ...project, sizePreset: "short" })).toBe(8);
    expect(interactiveTargetTurns({ ...project, sizePreset: "medium" })).toBe(16);
    expect(interactiveTargetTurns({ ...project, sizePreset: "custom", targetNodeCount: 64 })).toBe(40);
    expect(createInteractiveState({ ...project, sizePreset: "short" }, "session-1").targetTurns).toBe(8);
  });

  it("keeps forced ending fallbacks in Chinese for zh-CN projects", async () => {
    vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate").mockResolvedValue({
      data: {
        scene: {
          title: "终局",
          body: "档案室归于寂静。",
          summary: "最后的决定已经完成。",
          choices: [
            { id: "choice_a", label: "继续查看", intent: "寻找最后线索", risk: "low", consequencePreview: "你会看到结局。" },
            { id: "choice_b", label: "立刻离开", intent: "保全当前证据", risk: "medium", consequencePreview: "你会带着证据离开。" },
          ],
          isEnding: false,
          endingSummary: null,
        },
        statePatch: {},
      },
      rawResponse: "{}",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      model: "deepseek-v4-flash",
    });

    const result = await generateInteractiveScene({
      project: { ...project, settingsJson: { language: "zh-CN" } },
      state: { ...state, turn: 7 },
      previousScene,
      selectedChoice,
    }, new OpenAICompatibleGenerationProvider());

    expect(result.scene.endingSummary).toBe("故事达到预设回合，进入结局。");
  });
});
