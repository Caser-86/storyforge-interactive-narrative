import { describe, expect, it } from "vitest";
import { InteractiveSceneSchema } from "@/lib/interactive/schemas";

const choice = {
  id: "choice_a",
  label: "推门进入",
  intent: "立刻确认门后的记录",
  risk: "medium" as const,
  consequencePreview: "你会更快获得关键线索，但也可能触发门内变化。",
};

const scene = {
  title: "门前",
  body: "林缇站在门前。",
  summary: "她必须做出决定。",
  choices: [choice, { ...choice, id: "choice_b", label: "先行调查" }],
  isEnding: false,
  endingSummary: null,
};

describe("interactive narrative schemas", () => {
  it("requires multiple choices for an active scene", () => {
    expect(InteractiveSceneSchema.safeParse({ ...scene, choices: [choice] }).success).toBe(false);
  });

  it("prevents choices from appearing after an ending", () => {
    expect(InteractiveSceneSchema.safeParse({ ...scene, isEnding: true, endingSummary: "故事结束。" }).success).toBe(false);
  });

  it("accepts a bounded choice-driven scene", () => {
    expect(InteractiveSceneSchema.parse(scene).choices).toHaveLength(2);
  });
});
