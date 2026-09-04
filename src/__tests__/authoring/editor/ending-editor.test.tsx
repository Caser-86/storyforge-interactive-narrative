// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";
import { EndingEditor } from "@/features/authoring/editor/ending-editor";

const api = vi.hoisted(() => ({ putGraph: vi.fn() }));
vi.mock("@/features/authoring/authoring-api", () => api);

describe("EndingEditor", () => {
  it("writes one complete graph mutation for an author-authored ending", async () => {
    const graph = validReleaseGraph();
    const sourceNode = graph.nodes.find((node) => node.id === "node-merge")!;
    const onSaved = vi.fn();
    api.putGraph.mockImplementation(async (_projectId: string, nextGraph: typeof graph, _expectedRevision: number) => ({
      graph: nextGraph,
      issues: [],
    }));

    render(
      <EndingEditor
        projectId="project-1"
        graph={graph}
        sourceNode={sourceNode}
        expectedRevision={7}
        maxNodes={20}
        maxEndings={4}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("结局选择文案"), { target: { value: "Open the final lantern" } });
    fireEvent.change(screen.getByLabelText("结局标题"), { target: { value: "A New Dawn" } });
    fireEvent.change(screen.getByLabelText("结局正文"), { target: { value: "The final lantern opens." } });
    fireEvent.change(screen.getByLabelText("结局摘要"), { target: { value: "The archive finds a new future." } });
    fireEvent.change(screen.getByLabelText("结局目标"), { target: { value: "Give the archive a future." } });
    fireEvent.click(screen.getByRole("button", { name: "保存作者结局" }));

    await waitFor(() => expect(api.putGraph).toHaveBeenCalledTimes(1));
    expect(api.putGraph).toHaveBeenCalledWith("project-1", expect.objectContaining({
      versionId: graph.versionId,
      nodes: expect.arrayContaining([expect.objectContaining({ kind: "ending", title: "A New Dawn", contentStatus: "review_required" })]),
      edges: expect.arrayContaining([expect.objectContaining({ label: "Open the final lantern", branchType: "side" })]),
    }), 7);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ nodes: expect.any(Array) }), 8, [], expect.any(String));
    expect(screen.getByText("已保存作者结局，已切换到新节点。"))
      .toBeInTheDocument();
  });
});
