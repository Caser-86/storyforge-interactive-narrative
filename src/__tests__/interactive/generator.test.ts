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

    const result = await generateInteractiveScene(
      { project, state, previousScene, selectedChoice },
      new OpenAICompatibleGenerationProvider(),
    );

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

    const result = await generateInteractiveScene(
      { project, state, previousScene, selectedChoice },
      new OpenAICompatibleGenerationProvider(),
    );

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

    const result = await generateInteractiveScene(
      { project, state, previousScene, selectedChoice },
      new OpenAICompatibleGenerationProvider(),
    );

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].stepKey).toBe("interactive:choice-repair:7");
    expect(result.scene.choices).toHaveLength(3);
  });

  it("repairs active scenes with too many choices before strict normalization", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate")
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "过量的岔路",
            body: "门后同时出现了四条方向，故事还没有结束。",
            summary: "模型返回了超过契约数量的选项。",
            choices: [
              { id: "choice_a", label: "查看门缝", intent: "确认光源位置", risk: "low", consequencePreview: "你会获得一条线索。" },
              { id: "choice_b", label: "记录声音", intent: "保存异常证据", risk: "medium", consequencePreview: "你会留下可核对的记录。" },
              { id: "choice_c", label: "冲入房间", intent: "立即控制现场", risk: "high", consequencePreview: "你会正面承担风险。" },
              { id: "choice_d", label: "呼叫同伴", intent: "请求外部支援", risk: "low", consequencePreview: "你会暴露当前位置。" },
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
            title: "收束后的岔路",
            body: "三条方向重新分开，每一条都指向不同的代价。",
            summary: "作者可以继续决定方向。",
            choices: [
              { id: "choice_a", label: "退回门外", intent: "保留安全退路", risk: "low", consequencePreview: "你会保留退路。" },
              { id: "choice_b", label: "继续观察", intent: "确认现场变化", risk: "medium", consequencePreview: "你会获得更多信息。" },
              { id: "choice_c", label: "直接进入", intent: "承担即时危险", risk: "high", consequencePreview: "你可能触发警报。" },
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

    const result = await generateInteractiveScene(
      { project, state, previousScene, selectedChoice },
      new OpenAICompatibleGenerationProvider(),
    );

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

    const result = await generateInteractiveScene(
      { project, state, previousScene, selectedChoice },
      new OpenAICompatibleGenerationProvider(),
    );

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
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Maintain a coherent timeline");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Use an unambiguous 24-hour clock");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Direct consequence must be concrete");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("JSON validity is mandatory");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("Keep statePatch concise");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("one low, one medium, and one high risk choice");
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain("scene.body must contain between 1 and 1800 characters");
    expect(generate.mock.calls[0]?.[0].temperature).toBe(0.2);
  });

  it("uses the generated scene summary when the model returns a generic choice impact", async () => {
    vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate").mockResolvedValue({
      data: {
        scene: {
          title: "门后的回声",
          body: "推门后的录音明确说出了新的档案编号，调查方向被迫改变。",
          summary: "录音给出新的档案编号，调查转向地下库房。",
          choices: [
            { id: "choice_a", label: "查看档案", intent: "寻找记录", risk: "low", consequencePreview: "你会获得线索。" },
            { id: "choice_b", label: "离开房间", intent: "暂时撤退", risk: "medium", consequencePreview: "你会失去部分时间。" },
            { id: "choice_c", label: "撬开暗门", intent: "冒险寻找出口", risk: "high", consequencePreview: "你可能触发警报。" },
          ],
          isEnding: false,
          endingSummary: null,
        },
        statePatch: { lastChoiceImpact: "局势发生了变化。" },
      },
      rawResponse: "{}",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      model: "test-model",
    });

    const result = await generateInteractiveScene({ project, state, previousScene, selectedChoice }, new OpenAICompatibleGenerationProvider());

    expect(result.state.lastChoiceImpact).toBe("录音给出新的档案编号，调查转向地下库房。");
  });

  it("carries a model-written continuity anchor into the next scene prompt", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate").mockResolvedValue({
      data: {
        scene: {
          title: "门后的回声",
          body: "沈沉留在丰村档案室，等候潮汐钟的下一次回响。",
          summary: "沈沉必须在档案室确认潮汐钟的来源。",
          choices: [
            { id: "choice_a", label: "核对档案", intent: "确认潮汐钟来源", risk: "low", consequencePreview: "你会获得一条可验证的线索。" },
            { id: "choice_b", label: "呼叫同伴", intent: "让同伴赶到档案室", risk: "medium", consequencePreview: "你会让更多人进入现场。" },
            { id: "choice_c", label: "打开暗门", intent: "立即承担未知风险", risk: "high", consequencePreview: "你可能触发档案室的机关。" },
          ],
          isEnding: false,
          endingSummary: null,
        },
        statePatch: {
          continuity: {
            location: "丰村档案室",
            time: "当日 15:41",
            activeCharacters: ["沈沉"],
            sceneGoal: "确认潮汐钟的来源",
          },
        },
      },
      rawResponse: "{}",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      model: "test-model",
    });

    const opening = await generateInteractiveScene({
      project,
      state: { ...state, turn: 1 },
      previousScene: null,
      selectedChoice: null,
    }, new OpenAICompatibleGenerationProvider());
    await generateInteractiveScene({
      project,
      state: opening.state,
      previousScene: opening.scene,
      selectedChoice: opening.scene.choices[0],
    }, new OpenAICompatibleGenerationProvider());

    expect(opening.state.continuity).toEqual({
      location: "丰村档案室",
      time: "当日 15:41",
      activeCharacters: ["沈沉"],
      sceneGoal: "确认潮汐钟的来源",
    });
    expect(generate.mock.calls[1]?.[0].userPrompt ?? "").toContain("Continuity anchor");
    expect(generate.mock.calls[1]?.[0].userPrompt ?? "").toContain("丰村档案室");
  });

  it("normalizes a compatible provider that places endingReadiness at the envelope root", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        scene: {
          title: "门后的回声",
          body: "门后的录音给出新的档案编号。",
          summary: "调查方向变得更明确。",
          choices: [
            { id: "choice_a", label: "查看档案", intent: "寻找记录", risk: "low", consequencePreview: "你会获得线索。" },
            { id: "choice_b", label: "离开房间", intent: "暂时撤退", risk: "medium", consequencePreview: "你会失去时间。" },
            { id: "choice_c", label: "撬开暗门", intent: "冒险寻找出口", risk: "high", consequencePreview: "你可能触发警报。" },
          ],
          isEnding: false,
          endingSummary: null,
        },
        statePatch: {},
        endingReadiness: 48,
      }) } }],
    });
    const provider = new OpenAICompatibleGenerationProvider({ client: { chat: { completions: { create } } } });

    const result = await generateInteractiveScene({ project, state, previousScene, selectedChoice }, provider);

    expect(result.state.endingReadiness).toBe(48);
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
    expect(generate.mock.calls[0]?.[0].userPrompt).toContain('"choices": [], "isEnding": true, "endingSummary": "string"');
    expect(generate.mock.calls[0]?.[0].userPrompt).not.toContain('"choices": [{ "id": "choice_a"');
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

    const result = await generateInteractiveScene(
      {
        project,
        state: { ...state, turn: 7 },
        previousScene,
        selectedChoice,
      },
      new OpenAICompatibleGenerationProvider(),
    );

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].stepKey).toBe("interactive:ending-repair:8");
    expect(result.scene.choices).toEqual([]);
    expect(result.scene.endingSummary).toContain("代价");
  });

  it("repairs an ending that promises future continuation instead of closing the conflict", async () => {
    const generate = vi.spyOn(OpenAICompatibleGenerationProvider.prototype, "generate")
      .mockResolvedValueOnce({
        data: {
          scene: {
            title: "暂时的平静",
            body: "钟声停下，潮水退去，但旧档案将继续揭示王冠的真相。",
            summary: "危机暂时结束，真相仍将继续揭示。",
            choices: [],
            isEnding: true,
            endingSummary: "旧档案将继续揭示王冠与潮门的真相。",
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
            title: "潮声止息",
            body: "钟塔停止运转，潮门闭合，王冠的力量被封存，城中的咸潮也随之退去。",
            summary: "主线危机被解决，作者的选择留下了明确代价。",
            choices: [],
            isEnding: true,
            endingSummary: "潮门闭合，城港获救，王冠被封存，守潮人承担了失去旧记忆的代价。",
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
    }, new OpenAICompatibleGenerationProvider());

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].stepKey).toBe("interactive:ending-repair:8");
    expect(result.scene.endingSummary).toContain("城港获救");
  });

  it("lets the final repair handle omitted ending fields from a compatible provider", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          scene: {
            title: "未完成的终局",
            body: "门已经关上，但结局没有被说明。",
            summary: "模型省略了结局字段。",
            isEnding: true,
          },
        }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          scene: {
            title: "终局",
            body: "门后的真相终于与作者的选择合拢。",
            summary: "故事完成了最后的收束。",
            choices: [],
            isEnding: true,
            endingSummary: "作者承担了打开这扇门的代价。",
          },
          statePatch: {},
        }) } }],
      });
    const provider = new OpenAICompatibleGenerationProvider({ client: { chat: { completions: { create } } } });

    const result = await generateInteractiveScene({
      project,
      state: { ...state, turn: 7 },
      previousScene,
      selectedChoice,
    }, provider);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.scene.isEnding).toBe(true);
    expect(result.scene.endingSummary).toContain("代价");
  });

  it("routes a final response with an omitted ending marker through ending repair", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          scene: {
            title: "漏标记的终局",
            body: "潮声停在门外，冲突仍没有被说明。",
            summary: "模型省略了结局标记和选项字段。",
          },
        }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          scene: {
            title: "潮声之后",
            body: "沈沉把证据交给妹妹，承担了公开档案后的代价。",
            summary: "作者选择推动真相公开，故事完成收束。",
            choices: [],
            isEnding: true,
            endingSummary: "真相被留下，沈沉也接受了无法撤回的后果。",
          },
          statePatch: {},
        }) } }],
      });
    const provider = new OpenAICompatibleGenerationProvider({ client: { chat: { completions: { create } } } });

    const result = await generateInteractiveScene({
      project,
      state: { ...state, turn: 7 },
      previousScene,
      selectedChoice,
    }, provider);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.scene.isEnding).toBe(true);
    expect(result.scene.endingSummary).toContain("后果");
  });

  it("routes an oversized final scene through ending repair instead of failing at the provider boundary", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          scene: {
            title: "过长的终局",
            body: "a".repeat(1_801),
            summary: "s".repeat(301),
            choices: [],
            isEnding: true,
            endingSummary: "暂未完成收束。",
          },
        }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          scene: {
            title: "完成的终局",
            body: "模型根据作者选择完成了最后一幕。",
            summary: "主要冲突得到收束。",
            choices: [],
            isEnding: true,
            endingSummary: "作者承担了公开真相后的代价。",
          },
          statePatch: {},
        }) } }],
      });
    const provider = new OpenAICompatibleGenerationProvider({ client: { chat: { completions: { create } } } });

    const result = await generateInteractiveScene({
      project,
      state: { ...state, turn: 7 },
      previousScene,
      selectedChoice,
    }, provider);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.scene.title).toBe("完成的终局");
    expect(result.scene.body.length).toBeLessThanOrEqual(1_800);
    expect(result.scene.summary.length).toBeLessThanOrEqual(300);
  });

  it("routes an oversized active scene through choice repair instead of persisting it", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          scene: {
            title: "过长的中段",
            body: "a".repeat(1_801),
            summary: "s".repeat(301),
            choices: [
              { id: "choice_a", label: "调查线索", intent: "确认线索来源", risk: "low", consequencePreview: "你会获得更多信息。" },
              { id: "choice_b", label: "保护证据", intent: "降低暴露风险", risk: "medium", consequencePreview: "你会暂时保住证据。" },
              { id: "choice_c", label: "公开档案", intent: "立即推动真相公开", risk: "high", consequencePreview: "你会承担公开后的代价。" },
            ],
            isEnding: false,
            endingSummary: null,
          },
        }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          scene: {
            title: "修复后的中段",
            body: "作者的选择带来新的线索。",
            summary: "故事继续推进。",
            choices: [
              { id: "choice_a", label: "调查线索", intent: "确认线索来源", risk: "low", consequencePreview: "你会获得更多信息。" },
              { id: "choice_b", label: "保护证据", intent: "降低暴露风险", risk: "medium", consequencePreview: "你会暂时保住证据。" },
              { id: "choice_c", label: "公开档案", intent: "立即推动真相公开", risk: "high", consequencePreview: "你会承担公开后的代价。" },
            ],
            isEnding: false,
            endingSummary: null,
          },
          statePatch: {},
        }) } }],
      });
    const provider = new OpenAICompatibleGenerationProvider({ client: { chat: { completions: { create } } } });

    const result = await generateInteractiveScene({ project, state, previousScene, selectedChoice }, provider);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0].messages[1]?.content).toContain("The previous response did not provide one choice for each risk level.");
    expect(result.scene.body.length).toBeLessThanOrEqual(1_800);
    expect(result.scene.summary.length).toBeLessThanOrEqual(300);
  });
});
