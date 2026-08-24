// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryNode } from "@/lib/authoring/schemas";
import { NodeEditor } from "@/features/authoring/editor/node-editor";

const api = vi.hoisted(() => ({ patchNode: vi.fn() }));
vi.mock("@/features/authoring/authoring-api", () => api);

const node: StoryNode = {
  id: "node-1",
  versionId: "version-1",
  chapterId: "chapter-1",
  nodeKey: "node-start",
  kind: "start",
  title: "旧标题",
  body: "旧正文",
  summary: "旧摘要",
  objective: "旧目标",
  topologicalRank: 0,
  contentStatus: "generated",
  authorModified: false,
  contentRevision: 4,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

describe("NodeEditor", () => {
  beforeEach(() => api.patchNode.mockReset());
  afterEach(() => vi.useRealTimers());

  it("debounces prose edits, sends the node revision, and reports saved state", async () => {
    vi.useFakeTimers();
    api.patchNode.mockResolvedValue({ node: { ...node, body: "新正文", contentRevision: 5, authorModified: true, contentStatus: "author_edited" }, draftRevision: 1 });
    render(<NodeEditor projectId="project-1" node={node} />);
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "新正文" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.patchNode).toHaveBeenCalledWith("project-1", "node-1", { body: "新正文" }, 4);
    expect(screen.getByText("已保存")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("flushes on blur and reflects the server revision without losing the draft", async () => {
    api.patchNode.mockResolvedValue({ node: { ...node, summary: "本地新摘要", contentRevision: 5, authorModified: true, contentStatus: "author_edited" }, draftRevision: 1 });
    render(<NodeEditor projectId="project-1" node={node} />);
    fireEvent.change(screen.getByLabelText("摘要"), { target: { value: "本地新摘要" } });
    await act(async () => {
      fireEvent.blur(screen.getByLabelText("摘要"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.patchNode).toHaveBeenCalledWith("project-1", "node-1", { summary: "本地新摘要" }, 4);
    expect(screen.getByLabelText("摘要")).toHaveValue("本地新摘要");
    expect(screen.getByText("已保存")).toBeInTheDocument();
  });
});
