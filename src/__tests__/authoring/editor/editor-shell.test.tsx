// @vitest-environment jsdom

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Project, StoryEdge, StoryNode } from "@/lib/authoring/schemas";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";
import { EditorShell } from "@/features/authoring/editor/editor-shell";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: ComponentPropsWithoutRef<"a"> & { children: ReactNode }) => <a {...props}>{children}</a>,
}));
vi.mock("@/features/authoring/editor/node-editor", () => ({
  NodeEditor: ({ node, onSaved }: { node: StoryNode; onSaved: (node: StoryNode, revision: number) => void }) => (
    <button type="button" onClick={() => onSaved({ ...node, title: "Saved elsewhere" }, 1)}>模拟其他保存</button>
  ),
}));
vi.mock("@/features/authoring/editor/choice-editor", () => ({
  ChoiceEditor: ({ edge }: { edge: StoryEdge }) => <label>choice-{edge.id}<input aria-label={`choice-${edge.id}`} defaultValue={edge.label} /></label>,
}));
vi.mock("@/features/authoring/editor/outline-tree", () => ({ OutlineTree: () => null }));
vi.mock("@/features/authoring/editor/node-inspector", () => ({ NodeInspector: () => null }));
vi.mock("@/features/authoring/editor/issue-panel", () => ({ IssuePanel: () => null }));
vi.mock("@/features/authoring/editor/release-checklist", () => ({ ReleaseChecklist: () => null }));
vi.mock("@/features/authoring/editor/branch-editor", () => ({ BranchEditor: () => null }));
vi.mock("@/features/authoring/editor/ending-editor", () => ({ EndingEditor: () => null }));
vi.mock("@/features/authoring/project-metrics", () => ({ ProjectMetrics: () => null }));

const graph = validReleaseGraph();
const project: Project = {
  id: "project-1",
  title: "第九档案室",
  premise: "一名档案员发现一扇不该存在的门。",
  genre: "悬疑",
  tone: "克制",
  pointOfView: "第二人称",
  rating: "PG-13",
  sizePreset: "custom",
  targetNodeCount: 20,
  targetEndingCount: 4,
  status: "draft",
  activeDraftVersionId: graph.versionId,
  settingsJson: {},
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("EditorShell", () => {
  it("guides an empty draft into author-driven generation instead of a dead-end canvas", () => {
    render(<EditorShell project={project} graph={{ ...graph, nodes: [], edges: [] }} draftRevision={0} />);

    expect(screen.getByRole("heading", { name: "这个草稿还没有可编辑的节点" })).toBeInTheDocument();
    expect(screen.getByText("当前图谱为空，无法从节点开始编辑。先进入分支写作，按你的选择逐幕生成故事。"))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开始分支写作" })).toHaveAttribute("href", "/projects/project-1/generate");
    expect(screen.getByRole("link", { name: "重试一次性结构化生成" }))
      .toHaveAttribute("href", "/projects/project-1/generate/structured");
  });

  it("keeps an unfinished choice edit when another editor save changes the draft revision", () => {
    render(<EditorShell project={project} graph={graph} draftRevision={0} />);

    const choice = graph.edges[0]!;
    const input = screen.getByLabelText(`choice-${choice.id}`);
    fireEvent.change(input, { target: { value: "尚未提交的选择" } });
    fireEvent.click(screen.getByRole("button", { name: "模拟其他保存" }));

    expect(input).toHaveValue("尚未提交的选择");
  });
});
