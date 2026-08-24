// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPlayer } from "@/features/authoring/preview-player";

const api = vi.hoisted(() => ({ createPreviewSnapshot: vi.fn(), loadPreview: vi.fn() }));
vi.mock("@/features/authoring/authoring-api", () => api);

const preview = {
  snapshot: { id: "snapshot-1", projectId: "project-1", versionNumber: 1, createdAt: "2026-08-21T00:00:00.000Z", sealedAt: "2026-08-21T00:00:00.000Z" },
  graph: {
    versionId: "snapshot-1",
    chapters: [{ id: "chapter-1", ordinal: 0, title: "第一章", summary: "进入档案馆" }],
    nodes: [
      { id: "start", chapterId: "chapter-1", nodeKey: "start", kind: "start" as const, title: "入口", body: "你站在档案馆门口。", summary: "故事开始。" },
      { id: "ending", chapterId: "chapter-1", nodeKey: "ending", kind: "ending" as const, title: "灯塔结局", body: "你点亮了灯塔。", summary: "故事结束。" },
    ],
    edges: [{ id: "edge-1", sourceNodeId: "start", targetNodeId: "ending", label: "点亮灯塔", sortOrder: 0 }],
  },
  runtime: { currentNodeId: "start", nodePath: [], edgePath: [], isEnding: false },
};

describe("PreviewPlayer", () => {
  it("seals a draft, runs choices locally, and reaches an ending", async () => {
    api.createPreviewSnapshot.mockResolvedValue({ id: "snapshot-1" });
    api.loadPreview.mockResolvedValue(preview);
    render(<PreviewPlayer projectId="project-1" projectTitle="灯塔档案" initialSnapshotId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "封存当前草稿并预览" }));

    expect(await screen.findByRole("heading", { name: "入口" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /点亮灯塔/ }));
    expect(screen.getByRole("heading", { name: "灯塔结局" })).toBeInTheDocument();
    expect(screen.getByText("故事到达结局")).toBeInTheDocument();
    expect(api.createPreviewSnapshot).toHaveBeenCalledWith("project-1");
    expect(api.loadPreview).toHaveBeenCalledWith("project-1", "snapshot-1");
  });
});
