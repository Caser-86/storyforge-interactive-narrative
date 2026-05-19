import { describe, it, expect } from "vitest";
import { createInitialState, applyChoiceEffects, compressContext } from "@/lib/story-state-service";
import { checkStateEffectsDifference, checkChoiceSimilarity, checkRiskCoverage } from "@/lib/narrative-quality";
import type { StoryState, Choice } from "@/lib/schemas";

describe("Memory continuity", () => {
  const baseState: StoryState = createInitialState("sess_memory", "记忆连续性测试");

  it("knownFacts accumulate across choices", () => {
    const choice1: Choice = {
      id: "c1", label: "调查线索", intent: "仔细检查房间", risk: "low",
      preview: "你仔细检查了房间", stateEffects: { caution: 2 },
    };
    const state1 = applyChoiceEffects(baseState, choice1, {
      knownFacts: ["房间里有暗门", "桌上有一封信"],
    });
    expect(state1.knownFacts).toContain("房间里有暗门");
    expect(state1.knownFacts).toContain("桌上有一封信");

    const choice2: Choice = {
      id: "c2", label: "继续深入", intent: "通过暗门进入", risk: "medium",
      preview: "你推开了暗门", stateEffects: { courage: 3 },
    };
    const state2 = applyChoiceEffects(state1, choice2, {
      knownFacts: ["暗门后是密室"],
    });
    expect(state2.knownFacts).toContain("房间里有暗门");
    expect(state2.knownFacts).toContain("暗门后是密室");
  });

  it("unresolvedThreads persist until resolved", () => {
    const choice1: Choice = {
      id: "c1", label: "发现谜题", intent: "注意到墙上的谜题", risk: "low",
      preview: "你发现了谜题", stateEffects: { knowledge: 1 },
    };
    const state1 = applyChoiceEffects(baseState, choice1, {
      unresolvedThreads: ["墙上的谜题未解", "失踪的村民"],
    });
    expect(state1.unresolvedThreads).toHaveLength(2);

    const choice2: Choice = {
      id: "c2", label: "解谜", intent: "尝试解开谜题", risk: "medium",
      preview: "你开始解谜", stateEffects: { intelligence: 2 },
    };
    const state2 = applyChoiceEffects(state1, choice2, {
      knownFacts: ["谜题的答案是月光"],
    });
    expect(state2.unresolvedThreads).toHaveLength(2);
    expect(state2.knownFacts).toContain("谜题的答案是月光");
  });

  it("npcRelations persist and accumulate across turns", () => {
    const choice1: Choice = {
      id: "c1", label: "帮助商人", intent: "帮助商人修复马车", risk: "low",
      preview: "你帮助了商人", stateEffects: { kindness: 2 },
    };
    const state1 = applyChoiceEffects(baseState, choice1, {
      npcRelations: { npc_merchant: 15 },
    });
    expect(state1.npcRelations.npc_merchant).toBe(15);

    const choice2: Choice = {
      id: "c2", label: "拒绝商人", intent: "拒绝商人的请求", risk: "medium",
      preview: "你拒绝了商人", stateEffects: { caution: 1 },
    };
    const state2 = applyChoiceEffects(state1, choice2, {
      npcRelations: { npc_merchant: -10 },
    });
    expect(state2.npcRelations.npc_merchant).toBe(5);
  });

  it("compressContext includes all memory elements", () => {
    const state: StoryState = {
      ...baseState,
      knownFacts: ["森林深处有古堡", "古堡主人已失踪"],
      unresolvedThreads: ["失踪的村民", "古堡的秘密"],
      npcRelations: { npc_guide: 20 },
      inventory: ["古旧钥匙", "地图"],
    };
    const ctx = compressContext(state);
    expect(ctx).toContain("森林深处有古堡");
    expect(ctx).toContain("失踪的村民");
    expect(ctx).toContain("npc_guide=20");
    expect(ctx).toContain("古旧钥匙");
  });

  it("8-turn progression maintains memory integrity", () => {
    let state = baseState;
    const facts: string[] = [];
    const threads: string[] = [];

    for (let i = 1; i <= 8; i++) {
      const choice: Choice = {
        id: `c_turn${i}`, label: `第${i}轮选择`, intent: `第${i}轮行动意图`,
        risk: i % 3 === 1 ? "low" : i % 3 === 2 ? "medium" : "high",
        preview: `第${i}轮预览`, stateEffects: { tension: i },
      };
      facts.push(`第${i}轮发现`);
      if (i <= 4) threads.push(`第${i}轮伏笔`);

      state = applyChoiceEffects(state, choice, {
        knownFacts: [`第${i}轮发现`],
        unresolvedThreads: i <= 4 ? [`第${i}轮伏笔`] : [],
      });
    }

    expect(state.turn).toBe(9);
    expect(state.knownFacts.length).toBeGreaterThanOrEqual(5);
    expect(state.unresolvedThreads.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(state.variables).length).toBeGreaterThan(1);
  });
});

describe("Choice differentiation", () => {
  it("checkStateEffectsDifference rejects identical stateEffects", () => {
    const choices: Choice[] = [
      { id: "c1", label: "选项A", intent: "路线A", risk: "low", preview: "预览A", stateEffects: { courage: 2 } },
      { id: "c2", label: "选项B", intent: "路线B", risk: "medium", preview: "预览B", stateEffects: { courage: 2 } },
      { id: "c3", label: "选项C", intent: "路线C", risk: "high", preview: "预览C", stateEffects: { wisdom: 1 } },
    ];
    const result = checkStateEffectsDifference(choices);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.includes("完全相同"))).toBe(true);
  });

  it("checkStateEffectsDifference accepts unique stateEffects", () => {
    const choices: Choice[] = [
      { id: "c1", label: "调查", intent: "仔细调查", risk: "low", preview: "你仔细调查", stateEffects: { caution: 2, knowledge: 1 } },
      { id: "c2", label: "行动", intent: "直接行动", risk: "medium", preview: "你直接行动", stateEffects: { courage: 3 } },
      { id: "c3", label: "交涉", intent: "与人交涉", risk: "high", preview: "你与人交涉", stateEffects: { charisma: 2 } },
    ];
    const result = checkStateEffectsDifference(choices);
    expect(result.passed).toBe(true);
  });

  it("checkStateEffectsDifference rejects empty stateEffects", () => {
    const choices: Choice[] = [
      { id: "c1", label: "选项A", intent: "路线A", risk: "low", preview: "预览A", stateEffects: {} },
      { id: "c2", label: "选项B", intent: "路线B", risk: "medium", preview: "预览B", stateEffects: { courage: 1 } },
    ];
    const result = checkStateEffectsDifference(choices);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.includes("为空"))).toBe(true);
  });

  it("checkChoiceSimilarity rejects near-identical choices", () => {
    const choices: Choice[] = [
      { id: "c1", label: "小心前进", intent: "carefully go forward", risk: "low", preview: "你小心前进", stateEffects: {} },
      { id: "c2", label: "小心地前进", intent: "carefully go ahead", risk: "low", preview: "你小心地前进", stateEffects: {} },
      { id: "c3", label: "大胆行动", intent: "act boldly", risk: "high", preview: "你大胆行动", stateEffects: {} },
    ];
    const result = checkChoiceSimilarity(choices);
    expect(result.passed).toBe(false);
  });

  it("checkRiskCoverage requires all three risk levels", () => {
    const twoRisks: Choice[] = [
      { id: "c1", label: "安全", intent: "safe", risk: "low", preview: "p1", stateEffects: {} },
      { id: "c2", label: "中等", intent: "moderate", risk: "medium", preview: "p2", stateEffects: {} },
    ];
    const result = checkRiskCoverage(twoRisks);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("缺少 high 风险选项");
  });

  it("full quality pipeline: all checks pass for well-differentiated choices", () => {
    const choices: Choice[] = [
      { id: "c1", label: "仔细调查周围环境", intent: "谨慎调查路线：收集更多情报", risk: "low", preview: "你决定先观察再行动", stateEffects: { caution: 2, knowledge: 1 } },
      { id: "c2", label: "直接冲入危险区域", intent: "冒险推进路线：快速突破", risk: "medium", preview: "你决定冒险前进", stateEffects: { courage: 3 } },
      { id: "c3", label: "与守卫谈判通过", intent: "社交绕行路线：交涉解决", risk: "high", preview: "你尝试说服守卫", stateEffects: { charisma: 2 } },
    ];

    expect(checkChoiceSimilarity(choices).passed).toBe(true);
    expect(checkRiskCoverage(choices).passed).toBe(true);
    expect(checkStateEffectsDifference(choices).passed).toBe(true);
  });
});

describe("P1-2 Memory continuity enhancements", () => {
  const baseState: StoryState = createInitialState("sess_p12", "P1-2测试");

  it("lastChoiceImpact is set from statePatch", () => {
    const choice: Choice = {
      id: "c1", label: "调查线索", intent: "仔细检查房间", risk: "low",
      preview: "你仔细检查了房间", stateEffects: { caution: 2 },
    };
    const result = applyChoiceEffects(baseState, choice, {
      lastChoiceImpact: "发现了隐藏的密室入口",
    });
    expect(result.lastChoiceImpact).toBe("发现了隐藏的密室入口");
  });

  it("lastChoiceImpact auto-generates from choice when not provided", () => {
    const choice: Choice = {
      id: "c1", label: "调查线索", intent: "仔细检查房间", risk: "low",
      preview: "你仔细检查了房间", stateEffects: { caution: 2 },
    };
    const result = applyChoiceEffects(baseState, choice, {});
    expect(result.lastChoiceImpact).toContain("调查线索");
    expect(result.lastChoiceImpact).toContain("仔细检查房间");
  });

  it("unresolvedThreads > 5 triggers forced recycling", () => {
    const state: StoryState = {
      ...baseState,
      unresolvedThreads: ["伏笔1", "伏笔2", "伏笔3", "伏笔4", "伏笔5", "伏笔6"],
    };
    const choice: Choice = {
      id: "c1", label: "继续", intent: "继续前进", risk: "low",
      preview: "你继续前进", stateEffects: { tension: 1 },
    };
    const result = applyChoiceEffects(state, choice, {});
    expect(result.unresolvedThreads.length).toBeLessThanOrEqual(5);
    expect(result.resolvedThreads.some((t) => t.includes("[自动回收]"))).toBe(true);
    expect(result.allowNewThreads).toBe(false);
  });

  it("allowNewThreads is true when unresolvedThreads <= 5", () => {
    const state: StoryState = {
      ...baseState,
      unresolvedThreads: ["伏笔1", "伏笔2", "伏笔3"],
    };
    const choice: Choice = {
      id: "c1", label: "继续", intent: "继续前进", risk: "low",
      preview: "你继续前进", stateEffects: { tension: 1 },
    };
    const result = applyChoiceEffects(state, choice, {});
    expect(result.allowNewThreads).toBe(true);
  });

  it("new unresolvedThreads are blocked when allowNewThreads is false", () => {
    const state: StoryState = {
      ...baseState,
      unresolvedThreads: ["伏笔1", "伏笔2", "伏笔3", "伏笔4", "伏笔5", "伏笔6"],
      allowNewThreads: false,
    };
    const choice: Choice = {
      id: "c1", label: "继续", intent: "继续前进", risk: "low",
      preview: "你继续前进", stateEffects: { tension: 1 },
    };
    const beforeCount = state.unresolvedThreads.length;
    const result = applyChoiceEffects(state, choice, {
      unresolvedThreads: ["新伏笔"],
    });
    expect(result.unresolvedThreads.length).toBeLessThanOrEqual(beforeCount);
  });

  it("knownFacts capped at 30", () => {
    const state: StoryState = {
      ...baseState,
      knownFacts: Array.from({ length: 28 }, (_, i) => `事实${i + 1}`),
    };
    const choice: Choice = {
      id: "c1", label: "继续", intent: "继续前进", risk: "low",
      preview: "你继续前进", stateEffects: { tension: 1 },
    };
    const result = applyChoiceEffects(state, choice, {
      knownFacts: ["新事实1", "新事实2", "新事实3", "新事实4"],
    });
    expect(result.knownFacts.length).toBeLessThanOrEqual(30);
  });

  it("compressContext includes lastChoiceImpact", () => {
    const state: StoryState = {
      ...baseState,
      lastChoiceImpact: "选择了调查路线，发现了密室",
    };
    const ctx = compressContext(state);
    expect(ctx).toContain("上次选择影响");
    expect(ctx).toContain("选择了调查路线");
  });

  it("compressContext includes remaining steps", () => {
    const state: StoryState = { ...baseState, turn: 5, targetTurns: 10 };
    const ctx = compressContext(state);
    expect(ctx).toContain("剩余5步");
  });

  it("compressContext warns when new threads blocked", () => {
    const state: StoryState = {
      ...baseState,
      allowNewThreads: false,
    };
    const ctx = compressContext(state);
    expect(ctx).toContain("禁止新增伏笔");
  });

  it("20-turn progression maintains story goal", () => {
    let state: StoryState = {
      ...baseState,
      storyGoal: "找到失踪的村民",
      targetTurns: 20,
    };

    for (let i = 1; i <= 20; i++) {
      const choice: Choice = {
        id: `c${i}`, label: `第${i}步`, intent: `第${i}步行动`, risk: "low" as const,
        preview: `第${i}步预览`, stateEffects: { tension: i },
      };
      state = applyChoiceEffects(state, choice, {
        knownFacts: [`第${i}步发现`],
        unresolvedThreads: i <= 6 ? [`第${i}步伏笔`] : [],
      });
    }

    expect(state.storyGoal).toBe("找到失踪的村民");
    expect(state.knownFacts.length).toBeLessThanOrEqual(30);
    expect(state.unresolvedThreads.length).toBeLessThanOrEqual(10);
  });
});
