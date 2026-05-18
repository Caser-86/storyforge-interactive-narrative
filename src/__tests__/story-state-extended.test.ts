import { describe, it, expect } from "vitest";
import { createInitialState, applyChoiceEffects, compressContext } from "@/lib/story-state-service";
import type { StoryState, Choice } from "@/lib/schemas";

describe("StoryState new fields", () => {
  const baseState: StoryState = createInitialState("sess_test", "测试");

  const choice: Choice = {
    id: "choice_a",
    label: "测试选项",
    intent: "测试意图，确保足够长度",
    risk: "low",
    preview: "测试预览，确保足够长度",
    stateEffects: { tension: 5 },
  };

  it("initial state has empty flags", () => {
    expect(baseState.flags).toEqual({});
  });

  it("initial state has empty npcRelations", () => {
    expect(baseState.npcRelations).toEqual({});
  });

  it("initial state has zero endingPotential", () => {
    expect(baseState.endingPotential).toBe(0);
  });

  it("applies flags from statePatch", () => {
    const result = applyChoiceEffects(baseState, choice, {
      flags: { met_king: true, has_key: true },
    });
    expect(result.flags.met_king).toBe(true);
    expect(result.flags.has_key).toBe(true);
  });

  it("applies npcRelations from statePatch", () => {
    const result = applyChoiceEffects(baseState, choice, {
      npcRelations: { npc_king: 10, npc_merchant: -5 },
    });
    expect(result.npcRelations.npc_king).toBe(10);
    expect(result.npcRelations.npc_merchant).toBe(-5);
  });

  it("npcRelations are clamped to [-100, 100]", () => {
    const state: StoryState = {
      ...baseState,
      npcRelations: { npc_test: 95 },
    };
    const result = applyChoiceEffects(state, choice, {
      npcRelations: { npc_test: 20 },
    });
    expect(result.npcRelations.npc_test).toBe(100);
  });

  it("endingPotential increments from statePatch", () => {
    const result = applyChoiceEffects(baseState, choice, {
      endingPotential: 15,
    });
    expect(result.endingPotential).toBe(18);
  });

  it("endingPotential auto-increments by 3 each turn", () => {
    const result = applyChoiceEffects(baseState, choice, {});
    expect(result.endingPotential).toBe(3);
  });

  it("endingPotential is clamped to max 100", () => {
    const state: StoryState = { ...baseState, endingPotential: 99 };
    const result = applyChoiceEffects(state, choice, {});
    expect(result.endingPotential).toBe(100);
  });

  it("chapter increments every 10 turns", () => {
    const state: StoryState = { ...baseState, turn: 9 };
    const result = applyChoiceEffects(state, choice, {});
    expect(result.chapter).toBe(2);
  });

  it("chapter does not increment before 10 turns", () => {
    const state: StoryState = { ...baseState, turn: 8 };
    const result = applyChoiceEffects(state, choice, {});
    expect(result.chapter).toBe(1);
  });

  it("compressContext includes flags", () => {
    const state: StoryState = {
      ...baseState,
      flags: { met_sage: true, has_map: true, unused: false },
    };
    const ctx = compressContext(state);
    expect(ctx).toContain("标记：met_sage、has_map");
    expect(ctx).not.toContain("unused");
  });

  it("compressContext includes npcRelations", () => {
    const state: StoryState = {
      ...baseState,
      npcRelations: { npc_sage: 10, npc_enemy: -20 },
    };
    const ctx = compressContext(state);
    expect(ctx).toContain("NPC关系");
    expect(ctx).toContain("npc_sage=10");
  });

  it("compressContext includes endingPotential", () => {
    const state: StoryState = { ...baseState, endingPotential: 50 };
    const ctx = compressContext(state);
    expect(ctx).toContain("结局潜力：50/100");
  });
});
