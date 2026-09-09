// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BranchEditor } from "@/features/authoring/editor/branch-editor";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

const api = vi.hoisted(() => ({ putGraph: vi.fn() }));
vi.mock("@/features/authoring/authoring-api", () => api);

describe("BranchEditor", () => {
  it("writes one complete graph mutation and reports the new branch", async () => {
    const graph = validReleaseGraph();
    const sourceNode = graph.nodes.find((node) => node.id === "node-left")!;
    const onSaved = vi.fn();
    api.putGraph.mockImplementation(async (_projectId: string, nextGraph: typeof graph, _expectedRevision: number) => ({
      graph: nextGraph,
      issues: [],
    }));

    render(
      <BranchEditor
        projectId="project-1"
        graph={graph}
        sourceNode={sourceNode}
        expectedRevision={7}
        maxNodes={20}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("选择文案"), { target: { value: "Cross the flooded gallery" } });
    fireEvent.change(screen.getByLabelText("新节点标题"), { target: { value: "Flooded Gallery" } });
    fireEvent.change(screen.getByLabelText("新节点正文"), { target: { value: "Water climbs the gallery steps." } });
    fireEvent.change(screen.getByLabelText("新节点摘要"), { target: { value: "The courier finds a submerged route." } });
    fireEvent.change(screen.getByLabelText("新节点目标"), { target: { value: "Find a safe route back." } });
    fireEvent.click(screen.getByRole("button", { name: "保存作者分支" }));

    await waitFor(() => expect(api.putGraph).toHaveBeenCalledTimes(1));
    expect(api.putGraph).toHaveBeenCalledWith("project-1", expect.objectContaining({
      versionId: graph.versionId,
      nodes: expect.arrayContaining([expect.objectContaining({ title: "Flooded Gallery", contentStatus: "review_required" })]),
      edges: expect.arrayContaining([expect.objectContaining({ label: "Cross the flooded gallery", branchType: "side" })]),
    }), 7);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ nodes: expect.any(Array) }), 8, [], expect.any(String));
    expect(screen.getByText("已保存作者分支，已切换到新节点。"))
      .toBeInTheDocument();
  });
});
