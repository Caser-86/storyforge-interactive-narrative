import { describe, expect, it } from "vitest";
import { InteractiveGenerationOutputSchema } from "@/lib/interactive/generator";

const scene = {
  title: "门后",
  body: "门后亮起一排档案柜。",
  summary: "新的线索出现了。",
  choices: [
    { id: "choice_a", label: "查看档案", intent: "寻找记录", risk: "low" as const, consequencePreview: "你会获得线索。" },
    { id: "choice_b", label: "离开房间", intent: "暂时撤退", risk: "medium" as const, consequencePreview: "你会失去部分时间。" },
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
});
