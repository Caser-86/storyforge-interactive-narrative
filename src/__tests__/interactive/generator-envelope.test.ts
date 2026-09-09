import { describe, expect, it } from "vitest";
import { InteractiveGenerationOutputSchema } from "@/lib/interactive/generator";

const scene = {
  title: "门后",
  body: "门后亮起一排档案柜。",
  summary: "新的线索出现了。",
  choices: [
    { id: "choice_a", label: "查看档案", intent: "寻找记录", risk: "low" as const, consequencePreview: "你会获得线索。" },
    { id: "choice_b", label: "离开房间", intent: "暂时撤退", risk: "medium" as const, consequencePreview: "你会失去部分时间。" },
    { id: "choice_c", label: "封存入口", intent: "切断异常通道", risk: "high" as const, consequencePreview: "你会承担更大的即时风险。" },
  ],
  isEnding: false,
  endingSummary: null,
};

describe("interactive generation envelope", () => {
  it("accepts a bounded oversupply that the state merger can trim", () => {
    const result = InteractiveGenerationOutputSchema.safeParse({
      scene,
      statePatch: {
        knownFacts: Array.from({ length: 12 }, (_, index) => `事实 ${index + 1}`),
        openThreads: [],
        resolvedThreads: [],
        lastChoiceImpact: "门后的记录改变了调查方向。",
        endingReadiness: 20,
      },
    });

    expect(result.success).toBe(true);
  });

  it("normalizes content-only state memory items from a model response", () => {
    const result = InteractiveGenerationOutputSchema.safeParse({
      scene,
      statePatch: {
        knownFacts: [{ content: "门只会在雨夜出现。" }],
        openThreads: [{ content: "核对被篡改的记录。" }],
        resolvedThreads: [{ content: "找到档案室入口。" }],
        memoryPatch: { resolvedThreadIds: [{ content: "thread-entrance" }] },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.statePatch.knownFacts).toEqual(["门只会在雨夜出现。"]);
      expect(result.data.statePatch.openThreads).toEqual(["核对被篡改的记录。"]);
      expect(result.data.statePatch.resolvedThreads).toEqual(["找到档案室入口。"]);
      expect(result.data.statePatch.memoryPatch?.resolvedThreadIds).toEqual(["thread-entrance"]);
    }
  });

  it("does not accept state memory objects with fields beyond content", () => {
    const result = InteractiveGenerationOutputSchema.safeParse({
      scene,
      statePatch: {
        knownFacts: [{ content: "门只会在雨夜出现。", id: "unexpected" }],
      },
    });

    expect(result.success).toBe(false);
  });

  it("requires one low, medium, and high risk choice for an active model scene", () => {
    const result = InteractiveGenerationOutputSchema.safeParse({
      scene: {
        ...scene,
        choices: scene.choices.map((choice) => ({ ...choice, risk: "low" as const })),
      },
      statePatch: {},
    });

    expect(result.success).toBe(false);
  });
});
