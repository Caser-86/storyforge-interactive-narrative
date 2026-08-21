// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoryGraph, StoryNode } from "@/lib/authoring/schemas";
import { OutlineTree } from "@/features/authoring/editor/outline-tree";

const timestamp = "2026-08-21T00:00:00.000Z";

function node(id: string, chapterId: string, nodeKey: string, title: string, kind: StoryNode["kind"], rank: number, contentStatus: StoryNode["contentStatus"]): StoryNode {
  return {
    id,
    versionId: "version-1",
    chapterId,
    nodeKey,
    kind,
    title,
    body: `${title} body`,
    summary: `${title} summary`,
    objective: `${title} objective`,
    topologicalRank: rank,
    contentStatus,
    authorModified: contentStatus === "author_edited",
    contentRevision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function graph(): StoryGraph {
  const chapter1 = "chapter-1";
  const chapter2 = "chapter-2";
  return {
    versionId: "version-1",
    chapters: [
      { id: chapter2, versionId: "version-1", ordinal: 1, title: "第二章 · 回声", goal: "收束", summary: "回声", createdAt: timestamp, updatedAt: timestamp },
      { id: chapter1, versionId: "version-1", ordinal: 0, title: "第一章 · 分岔", goal: "选择", summary: "分岔", createdAt: timestamp, updatedAt: timestamp },
    ],
    nodes: [
      node("start", chapter1, "n-start", "起点", "start", 0, "generated"),
      node("left", chapter1, "n-left", "左路", "scene", 1, "author_edited"),
      node("right", chapter1, "n-right", "右路", "scene", 2, "review_required"),
      node("merge", chapter1, "n-merge", "汇合点", "scene", 3, "planned"),
      node("ending", chapter1, "n-ending", "唯一结局", "ending", 4, "generated"),
      node("chapter-2-node", chapter2, "n-after", "余波", "scene", 5, "planned"),
    ],
    edges: [
      { id: "edge-1", versionId: "version-1", sourceNodeId: "start", targetNodeId: "left", label: "走左边", intent: "left", consequenceSummary: "左", branchType: "main", sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
      { id: "edge-2", versionId: "version-1", sourceNodeId: "start", targetNodeId: "right", label: "走右边", intent: "right", consequenceSummary: "右", branchType: "side", sortOrder: 1, createdAt: timestamp, updatedAt: timestamp },
      { id: "edge-3", versionId: "version-1", sourceNodeId: "left", targetNodeId: "merge", label: "返回", intent: "merge", consequenceSummary: "汇合", branchType: "main", sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
      { id: "edge-4", versionId: "version-1", sourceNodeId: "right", targetNodeId: "merge", label: "穿过", intent: "merge", consequenceSummary: "汇合", branchType: "main", sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
      { id: "edge-5", versionId: "version-1", sourceNodeId: "merge", targetNodeId: "ending", label: "决定", intent: "end", consequenceSummary: "结束", branchType: "main", sortOrder: 0, createdAt: timestamp, updatedAt: timestamp },
    ],
  };
}

describe("OutlineTree", () => {
  it("orders chapters, nests branches, and renders a converged node only once", () => {
    render(<OutlineTree graph={graph()} selectedNodeId="start" collapsedChapterIds={[]} onSelect={vi.fn()} onToggleChapter={vi.fn()} />);

    const chapterHeadings = screen.getAllByRole("button", { name: /第一章|第二章/ });
    expect(chapterHeadings[0]).toHaveTextContent("第一章 · 分岔");
    expect(chapterHeadings[1]).toHaveTextContent("第二章 · 回声");
    expect(screen.getAllByRole("button", { name: /汇合点/ })).toHaveLength(1);
    expect(screen.getByText("主线 · 穿过 · 汇合至 汇合点")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /左路/ })).toHaveAttribute("data-depth", "1");
  });

  it("shows content status badges and supports arrow-key selection", () => {
    const onSelect = vi.fn();
    render(<OutlineTree graph={graph()} selectedNodeId="start" collapsedChapterIds={[]} onSelect={onSelect} onToggleChapter={vi.fn()} />);

    expect(screen.getByRole("button", { name: "起点，已生成" })).toBeInTheDocument();
    expect(screen.getByText("已改写")).toBeInTheDocument();
    expect(screen.getByText("需审阅")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "起点，已生成" }), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith("left");
  });
});
