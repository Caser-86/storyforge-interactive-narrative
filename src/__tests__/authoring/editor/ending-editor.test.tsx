// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";
import { EndingEditor } from "@/features/authoring/editor/ending-editor";

const api = vi.hoisted(() => ({ generateAuthorEnding: vi.fn(), putGraph: vi.fn() }));
vi.mock("@/features/authoring/authoring-api", () => api);

describe("EndingEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews a model-generated ending and only writes after confirmation", async () => {
    const graph = validReleaseGraph();
    const sourceNode = graph.nodes.find((node) => node.id === "node-merge")!;
    const onSaved = vi.fn();
    const ending = {
      choiceLabel: "公开档案，结束潮汐循环",
      intent: "让主角选择公开真相。",
      consequenceSummary: "真相公开，港口居民得到保护。",
      title: "潮声退去之后",
      body: "沈砚把档案交给记者，潮声终于在清晨退去。",
      summary: "沈砚公开档案，结束潮汐循环。",
      objective: "完成主角的道德选择。",
    };
    api.generateAuthorEnding.mockResolvedValue({
      sourceNodeId: sourceNode.id,
      basedOnRevision: 7,
      model: "deepseek-v4-flash",
      ending,
    });
    api.putGraph.mockImplementation(async (_projectId: string, nextGraph: typeof graph) => ({ graph: nextGraph, issues: [] }));

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

    fireEvent.change(screen.getByLabelText("结局方向（可选）"), { target: { value: "让主角公开真相并承担代价。" } });
    fireEvent.click(screen.getByRole("button", { name: "让大模型生成结局" }));

    await waitFor(() => expect(api.generateAuthorEnding).toHaveBeenCalledWith("project-1", {
      sourceNodeId: sourceNode.id,
      expectedRevision: 7,
      direction: "让主角公开真相并承担代价。",
    }));
    expect(screen.getByText("潮声退去之后")).toBeInTheDocument();
    expect(api.putGraph).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "采用并保存" }));

    await waitFor(() => expect(api.putGraph).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ nodes: expect.any(Array) }), 8, [], expect.any(String));
  });

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

    fireEvent.click(screen.getByText("手动填写（高级）"));
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
