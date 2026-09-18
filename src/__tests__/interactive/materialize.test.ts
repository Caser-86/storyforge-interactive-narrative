import { describe, expect, it } from "vitest";
import { materializeInteractivePath } from "@/lib/interactive/materialize";
import type { InteractiveTurnRecord } from "@/lib/interactive/schemas";

function scene(overrides: Partial<InteractiveTurnRecord["scene"]> = {}): InteractiveTurnRecord["scene"] {
  return {
    title: "门前",
    body: "林缇站在门前。",
    summary: "她必须做出决定。",
    choices: [
      { id: "choice_a", label: "推门进入", intent: "确认门后的记录", risk: "medium", consequencePreview: "你会看到线索。" },
      { id: "choice_b", label: "先行调查", intent: "寻找更安全的入口", risk: "low", consequencePreview: "你会获得信息。" },
    ],
    isEnding: false,
    endingSummary: null,
    ...overrides,
  };
}

function turns(): InteractiveTurnRecord[] {
  return [
    { turn: 1, scene: scene(), selectedChoiceId: "choice_a", selectedChoiceLabel: "推门进入", createdAt: "2026-08-24T00:00:00.000Z" },
    { turn: 2, scene: scene({ title: "门后", body: "门后亮起一排档案柜。", summary: "新的线索改变了调查方向。" }), selectedChoiceId: "choice_b", selectedChoiceLabel: "先行调查", createdAt: "2026-08-24T00:01:00.000Z" },
    { turn: 3, scene: scene({ title: "收束", body: "所有线索在桌面上合拢。", summary: "真相已经完整。", choices: [], isEnding: true, endingSummary: "档案室终于恢复安静。" }), selectedChoiceId: null, selectedChoiceLabel: null, createdAt: "2026-08-24T00:02:00.000Z" },
  ];
}

describe("materializeInteractivePath", () => {
  it("turns the author's selected scenes into a linear editable graph", () => {
    const graph = materializeInteractivePath({ versionId: "version-1", projectTitle: "第九档案室", turns: turns() });

    expect(graph.chapters).toHaveLength(1);
    expect(graph.nodes.map((node) => node.kind)).toEqual(["start", "scene", "ending"]);
    expect(graph.nodes.map((node) => node.body)).toEqual(["林缇站在门前。", "门后亮起一排档案柜。", "所有线索在桌面上合拢。"]);
    expect(graph.edges.map((edge) => ({ label: edge.label, intent: edge.intent, consequence: edge.consequenceSummary, branchType: edge.branchType }))).toEqual([
      { label: "推门进入", intent: "确认门后的记录", consequence: "你会看到线索。", branchType: "main" },
      { label: "先行调查", intent: "寻找更安全的入口", consequence: "你会获得信息。", branchType: "main" },
    ]);
  });

  it("rejects a path when a selected choice is not present in the scene", () => {
    const invalid = turns();
    invalid[0] = { ...invalid[0], selectedChoiceId: "choice_missing", selectedChoiceLabel: "不存在的选择" };

    expect(() => materializeInteractivePath({ versionId: "version-1", projectTitle: "第九档案室", turns: invalid })).toThrow(/selected choice/i);
  });

  it("rejects incomplete or non-contiguous paths", () => {
    const incomplete = turns();
    incomplete.pop();
    expect(() => materializeInteractivePath({ versionId: "version-1", projectTitle: "第九档案室", turns: incomplete })).toThrow(/结局/);

    const nonContiguous = turns();
    nonContiguous[1] = { ...nonContiguous[1], turn: 3 };
    expect(() => materializeInteractivePath({ versionId: "version-1", projectTitle: "第九档案室", turns: nonContiguous })).toThrow(/连续/);
  });

  it("rejects an ending record that still carries a selected choice", () => {
    const invalid = turns();
    invalid[2] = { ...invalid[2], selectedChoiceId: "choice_a", selectedChoiceLabel: "推门进入" };

    expect(() => materializeInteractivePath({ versionId: "version-1", projectTitle: "第九档案室", turns: invalid })).toThrow(/结局回合/);
  });
});
