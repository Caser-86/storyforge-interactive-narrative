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
              { id: "choice_c", label: "撬开暗门", intent: "冒险寻找出口", risk: "high", consequencePreview: "你可能触发警报。" },
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
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Set isEnding to false and return exactly three meaningful choices:");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Do not end early; the final planned turn is the only turn that may end the story.");
    expect(generate.mock.calls[0]?.[0].userPrompt).not.toContain("This is the final planned turn.");
  });

  it("repairs a model that ends before the final planned turn", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate")
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "提前落幕",
            body: "档案室的灯光突然熄灭，故事却还没有走到尽头。",
            summary: "模型错误地提前结束了场景。",
            choices: [],
            isEnding: true,
            endingSummary: "一切暂时归于沉默。",
          },
          statePatch: {},
        },
        rawResponse: "{}",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        model: "deepseek-v4-flash",
      })
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "门后的回声",
            body: "灯光重新亮起，门后的录音开始播放下一段内容。",
            summary: "新的线索迫使作者继续选择。",
            choices: [
              { id: "choice_a", label: "追查录音", intent: "确认来源", risk: "low", consequencePreview: "你会获得更多线索。" },
              { id: "choice_b", label: "封存档案", intent: "控制风险", risk: "medium", consequencePreview: "你会暂时压住异常。" },
              { id: "choice_c", label: "破坏设备", intent: "切断诱导", risk: "high", consequencePreview: "你可能失去关键证据。" },
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

    const result = await generateInteractiveScene({ project, state, previousScene, selectedChoice });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].stepKey).toBe("interactive:active-repair:7");
    expect(generate.mock.calls[1]?.[0].userPrompt).toContain("The previous response ended before the final planned turn.");
    expect(result.scene.isEnding).toBe(false);
    expect(result.scene.choices).toHaveLength(3);
  });

  it("repairs active scenes whose choices do not cover every risk level", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate")
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "重复的诱因",
            body: "录音里传来三种几乎相同的指令。",
            summary: "模型没有拉开风险差异。",
            choices: [
              { id: "choice_a", label: "继续听", intent: "确认录音内容", risk: "medium", consequencePreview: "你会获得更多信息。" },
              { id: "choice_b", label: "再次确认", intent: "核对录音来源", risk: "medium", consequencePreview: "你会花费额外时间。" },
              { id: "choice_c", label: "记录下来", intent: "保存当前证据", risk: "medium", consequencePreview: "你会保留一份副本。" },
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
      })
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "分岔的回声",
            body: "三条指令终于显出不同的代价。",
            summary: "作者必须在不同风险之间选择。",
            choices: [
              { id: "choice_a", label: "先做核验", intent: "降低误判风险", risk: "low", consequencePreview: "你会慢一点，但能保留退路。" },
              { id: "choice_b", label: "跟随指令", intent: "快速接近真相", risk: "medium", consequencePreview: "你会得到线索，也可能被引导。" },
              { id: "choice_c", label: "销毁录音", intent: "切断潜在威胁", risk: "high", consequencePreview: "你可能失去唯一证据。" },
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

    const result = await generateInteractiveScene({ project, state, previousScene, selectedChoice });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].stepKey).toBe("interactive:choice-repair:7");
    expect(generate.mock.calls[1]?.[0].userPrompt).toContain("The previous response did not provide one choice for each risk level.");
    expect(new Set(result.scene.choices.map((choice) => choice.risk))).toEqual(new Set(["low", "medium", "high"]));
  });

  it("repairs active scenes with too few choices before strict normalization", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate")
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "缺失的分岔",
            body: "门后只留下一个模糊的选项，故事还没有结束。",
            summary: "模型返回了不完整的主动场景。",
            choices: [],
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
      })
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "重新出现的门",
            body: "三条道路在雾中重新显现。",
            summary: "作者可以继续决定方向。",
            choices: [
              { id: "choice_a", label: "留在原地", intent: "等待更多线索", risk: "low", consequencePreview: "你会保留退路。" },
              { id: "choice_b", label: "追上脚步", intent: "跟随可疑身影", risk: "medium", consequencePreview: "你会接近危险。" },
              { id: "choice_c", label: "烧毁档案", intent: "切断异常来源", risk: "high", consequencePreview: "你可能失去证据。" },
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

    const result = await generateInteractiveScene({ project, state, previousScene, selectedChoice });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].stepKey).toBe("interactive:choice-repair:7");
    expect(result.scene.choices).toHaveLength(3);
  });

  it("ignores whitespace-only legacy memory entries from the model", async () => {
    vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate").mockResolvedValue({
      data: {
        scene: {
          title: "空白的记录",
          body: "档案边角没有留下可用的文字。",
          summary: "故事继续等待作者选择。",
          choices: [
            { id: "choice_a", label: "观察门缝", intent: "寻找新的线索", risk: "low", consequencePreview: "你会保持退路。" },
            { id: "choice_b", label: "追踪脚步", intent: "确认异常来源", risk: "medium", consequencePreview: "你会接近未知。" },
            { id: "choice_c", label: "撕毁档案", intent: "切断危险记录", risk: "high", consequencePreview: "你可能失去证据。" },
          ],
          isEnding: false,
          endingSummary: null,
        },
        statePatch: {
          knownFacts: ["  "],
          openThreads: ["\t"],
          resolvedThreads: [" \n "],
        },
      },
      rawResponse: "{}",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      model: "deepseek-v4-flash",
    });

    const result = await generateInteractiveScene({ project, state, previousScene, selectedChoice });

    expect(result.state.knownFacts).toEqual([]);
    expect(result.state.openThreads).toEqual([]);
    expect(result.state.resolvedThreads).toEqual([]);
    expect(result.state.memory?.mainlineFacts).toEqual([]);
    expect(result.state.memory?.plotThreads).toEqual([]);
  });

  it("states the author's selected direction explicitly for the next scene", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate").mockResolvedValue({
      data: {
        scene: {
          title: "门后",
          body: "门后亮起一排档案柜。",
          summary: "新的线索出现了。",
            choices: [
              { id: "choice_a", label: "查看档案", intent: "寻找记录", risk: "low", consequencePreview: "你会获得线索。" },
              { id: "choice_b", label: "离开房间", intent: "暂时撤退", risk: "medium", consequencePreview: "你会失去部分时间。" },
              { id: "choice_c", label: "撬开暗门", intent: "冒险寻找出口", risk: "high", consequencePreview: "你可能触发警报。" },
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

    await generateInteractiveScene({ project, state, previousScene, selectedChoice }, new OpenAICompatibleGenerationProvider());

    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Author selected direction: 推门进入");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("JSON validity is mandatory");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Keep statePatch concise");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("one low, one medium, and one high risk choice");
    expect(generate.mock.calls[0]?.[0].temperature).toBe(0.4);
  });

  it("rejects an active model scene without enough choices", async () => {
    vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate").mockResolvedValue({
      data: {
        scene: {
          title: "门后",
          body: "门后没有任何可辨认的出口。",
          summary: "模型没有提供可选方向。",
          choices: [],
          isEnding: false,
          endingSummary: null,
        },
        statePatch: {},
      },
      rawResponse: "{}",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      model: "test-model",
    });

    await expect(generateInteractiveScene({ project, state, previousScene, selectedChoice }, new OpenAICompatibleGenerationProvider())).rejects.toThrow(/choices|choice/i);
  });

  it("uses one bounded-turn policy for every project size", () => {
    expect(interactiveTargetTurns({ ...project, sizePreset: "micro" })).toBe(6);
    expect(interactiveTargetTurns({ ...project, sizePreset: "short", targetNodeCount: 15, targetEndingCount: 3 })).toBe(8);
    expect(interactiveTargetTurns({ ...project, sizePreset: "medium", targetNodeCount: 40, targetEndingCount: 5 })).toBe(16);
    expect(interactiveTargetTurns({ ...project, sizePreset: "custom", targetNodeCount: 64 })).toBe(40);
    expect(interactiveTargetTurns({ ...project, sizePreset: "custom", targetNodeCount: 8 })).toBe(7);
    expect(createInteractiveState({ ...project, sizePreset: "short", targetNodeCount: 15, targetEndingCount: 3 }, "session-1").targetTurns).toBe(8);
  });

  it("repairs a non-ending final response with a model-written ending", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate")
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "终局前",
            body: "档案室仍有一扇门没有打开。",
            summary: "冲突尚未收束。",
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
      })
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "终局",
            body: "档案室归于寂静，真相和代价都被留下。",
            summary: "作者的选择完成了收束。",
            choices: [],
            isEnding: true,
            endingSummary: "档案员带着证据离开，也接受了无法挽回的代价。",
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

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("收尾时优先回应仍未解决的主线伏笔");
    expect(generate.mock.calls[1]?.[0].stepKey).toBe("interactive:ending-repair:8");
    expect(result.scene.isEnding).toBe(true);
    expect(result.scene.title).toBe("终局");
    expect(result.scene.endingSummary).toContain("代价");
  });

  it("rejects a non-ending response after the final repair attempt", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate").mockResolvedValue({
      data: {
        scene: {
          title: "未完成",
          body: "冲突仍在继续。",
          summary: "模型没有收束。",
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

    await expect(generateInteractiveScene({
      project,
      state: { ...state, turn: 7 },
      previousScene,
      selectedChoice,
    }, new OpenAICompatibleGenerationProvider())).rejects.toMatchObject({ code: "VALIDATION" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("repairs an ending with missing summary or leftover choices", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate")
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "不完整的终局",
            body: "门已经关上，但结局没有被说明。",
            summary: "模型标记了结局，却没有完成收束。",
            choices: [{ id: "choice_a", label: "继续等待", intent: "观察门后变化", risk: "low", consequencePreview: "你会继续等待。" }],
            isEnding: true,
            endingSummary: "",
          },
          statePatch: {},
        },
        rawResponse: "{}",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        model: "deepseek-v4-flash",
      })
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "终局",
            body: "门后的真相终于与作者的选择合拢。",
            summary: "故事完成了最后的收束。",
            choices: [],
            isEnding: true,
            endingSummary: "作者带着证据离开，也承担了打开这扇门的代价。",
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
      project,
      state: { ...state, turn: 7 },
      previousScene,
      selectedChoice,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].stepKey).toBe("interactive:ending-repair:8");
    expect(result.scene.choices).toEqual([]);
    expect(result.scene.endingSummary).toContain("代价");
  });
});
