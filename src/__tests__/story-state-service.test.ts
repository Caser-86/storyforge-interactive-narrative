import { describe, it, expect } from "vitest";
import { createInitialState, applyChoiceEffects } from "@/lib/story-state-service";
import type { StoryState, Choice } from "@/lib/schemas";

describe("createInitialState", () => {
  it("creates a valid initial state", () => {
    const state = createInitialState("session_1", "测试提示词");
    expect(state.sessionId).toBe("session_1");
    expect(state.turn).toBe(1);
    expect(state.chapter).toBe(1);
    expect(state.inventory).toEqual([]);
    expect(state.knownFacts).toEqual([]);
    expect(state.unresolvedThreads).toEqual([]);
  });
});

describe("applyChoiceEffects", () => {
  const baseState: StoryState = {
    sessionId: "session_1",
    chapter: 1,
    turn: 3,
    tone: "紧张",
    protagonist: { name: "主角", traits: ["勇敢"] },
    variables: { tension: 20, danger_level: 5 },
    inventory: ["手电筒"],
    knownFacts: ["森林有危险"],
    unresolvedThreads: ["神秘声音"],
    flags: { met_sage: true },
    npcRelations: { npc_sage: 10 },
    endingPotential: 9,
    styleBible: { visualStyle: "dark fantasy", musicStyle: "suspense" },
  };

  const choice: Choice = {
    id: "choice_a",
    label: "深入森林探索未知区域",
    intent: "追踪神秘蓝光，探索森林深处的秘密",
    risk: "high",
    preview: "你决定跟随那道神秘的蓝光，向森林更深处走去",
    stateEffects: { tension: 10 },
  };

  it("increments turn", () => {
    const result = applyChoiceEffects(baseState, choice, {});
    expect(result.turn).toBe(4);
  });

  it("applies choice state effects", () => {
    const result = applyChoiceEffects(baseState, choice, {});
    expect(result.variables.tension).toBe(30);
  });

  it("applies statePatch for inventory", () => {
    const result = applyChoiceEffects(baseState, choice, {
      inventory: ["钥匙"],
    });
    expect(result.inventory).toContain("手电筒");
    expect(result.inventory).toContain("钥匙");
  });

  it("applies statePatch for knownFacts", () => {
    const result = applyChoiceEffects(baseState, choice, {
      knownFacts: ["森林深处有遗迹"],
    });
    expect(result.knownFacts).toContain("森林深处有遗迹");
  });

  it("applies statePatch for tone", () => {
    const result = applyChoiceEffects(baseState, choice, {
      tone: "恐惧",
    });
    expect(result.tone).toBe("恐惧");
  });

  it("applies statePatch for numeric variables", () => {
    const result = applyChoiceEffects(baseState, choice, {
      danger_level: 50,
    });
    expect(result.variables.danger_level).toBe(50);
  });

  it("does not mutate original state", () => {
    const originalTurn = baseState.turn;
    applyChoiceEffects(baseState, choice, {});
    expect(baseState.turn).toBe(originalTurn);
  });
});
