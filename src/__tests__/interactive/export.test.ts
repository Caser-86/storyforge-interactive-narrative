import { describe, expect, it } from "vitest";
import { renderInteractiveJson, renderInteractiveMarkdown } from "@/lib/interactive/export";
import type { InteractiveExport } from "@/lib/interactive/export";

const exportFixture: InteractiveExport = {
  exportVersion: "storyforge-interactive@1",
  project: {
    title: "第九档案室",
    premise: "一名档案员发现一扇不该存在的门。",
    genre: "悬疑",
    tone: "克制紧张",
  },
  session: { id: "session-1", status: "ended", targetTurns: 8 },
  turns: [
    {
      turn: 1,
      scene: {
        title: "门前",
        body: "林缇站在门前。",
        summary: "她必须做出决定。",
        choices: [{ id: "choice_a", label: "推门进入", intent: "确认记录", risk: "medium", consequencePreview: "你会看到线索。" }, { id: "choice_b", label: "先行调查", intent: "寻找入口", risk: "low", consequencePreview: "你会获得信息。" }],
        isEnding: false,
        endingSummary: null,
      },
      selectedChoiceId: "choice_a",
      selectedChoiceLabel: "推门进入",
      createdAt: "2026-08-23T00:00:00.000Z",
    },
  ],
};

describe("interactive export", () => {
  it("renders a readable markdown transcript with the selected path", () => {
    const markdown = renderInteractiveMarkdown(exportFixture);

    expect(markdown).toContain("# 第九档案室");
    expect(markdown).toContain("## 第 1 幕：门前");
    expect(markdown).toContain("**已选择：** 推门进入");
    expect(markdown).not.toContain("state_json");
  });

  it("renders a versioned JSON export without internal generation fields", () => {
    const json = renderInteractiveJson(exportFixture);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.exportVersion).toBe("storyforge-interactive@1");
    expect(json).not.toContain("prompt");
    expect(json).not.toContain("rawResponse");
    expect(json).not.toContain("apiKey");
  });
});
