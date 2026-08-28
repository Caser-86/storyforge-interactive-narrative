import { describe, expect, it } from "vitest";
import { addAuthorBranch } from "@/lib/authoring/graph-branch";
import { validateStoryGraph } from "@/lib/authoring/graph";
import { testLimits, validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

const NOW = "2026-08-28T00:00:00.000Z";

function createTestIds() {
  let edgeIndex = 0;
  return (kind: "node" | "edge") => kind === "node" ? "new-node" : `new-edge-${++edgeIndex}`;
}

const draft = {
  sourceNodeId: "node-left",
  endingNodeId: "node-keeper-ending",
  choiceLabel: "Cross the flooded gallery",
  intent: "Trade time for a hidden route.",
  consequenceSummary: "The courier reaches the archive from below.",
  continuationLabel: "Follow the lantern below",
  title: "Flooded Gallery",
  body: "Water climbs the gallery steps as the courier finds a second entrance.",
  summary: "The courier discovers a submerged route.",
  objective: "Find a safe route back to the archive.",
};

describe("addAuthorBranch", () => {
  it("adds an author-authored side scene and connects it to an existing ending", () => {
    const graph = validReleaseGraph();
    const next = addAuthorBranch(graph, draft, { createId: createTestIds(), now: NOW });

    expect(next.nodes).toHaveLength(graph.nodes.length + 1);
    expect(next.edges).toHaveLength(graph.edges.length + 2);

    const branchNode = next.nodes.find((node) => node.id === "new-node");
    expect(branchNode).toMatchObject({
      versionId: graph.versionId,
      chapterId: "chapter-1",
      kind: "scene",
      title: draft.title,
      body: draft.body,
      summary: draft.summary,
      objective: draft.objective,
      contentStatus: "review_required",
      authorModified: true,
      contentRevision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(next.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "new-edge-1",
        sourceNodeId: draft.sourceNodeId,
        targetNodeId: "new-node",
        label: draft.choiceLabel,
        intent: draft.intent,
        consequenceSummary: draft.consequenceSummary,
        branchType: "side",
        sortOrder: 1,
      }),
      expect.objectContaining({
        id: "new-edge-2",
        sourceNodeId: "new-node",
        targetNodeId: draft.endingNodeId,
        label: draft.continuationLabel,
        branchType: "main",
        sortOrder: 0,
      }),
    ]));
    expect(validateStoryGraph(next, testLimits())).toEqual([]);
  });

  it("rejects a duplicate choice before the graph can be mutated", () => {
    const graph = validReleaseGraph();

    expect(() => addAuthorBranch(graph, { ...draft, choiceLabel: "Search the left gallery" }, { createId: createTestIds(), now: NOW })).toThrow(
      /choice label/i,
    );
  });

  it("rejects ending nodes and nodes without a main path", () => {
    const graph = validReleaseGraph();

    expect(() => addAuthorBranch(graph, { ...draft, sourceNodeId: "node-keeper-ending" }, { createId: createTestIds(), now: NOW })).toThrow(
      /ending/i,
    );
    const graphWithoutMainPath = {
      ...graph,
      edges: graph.edges.map((edge) => edge.id === "edge-left-merge" ? { ...edge, branchType: "side" as const } : edge),
    };
    expect(() => addAuthorBranch(graphWithoutMainPath, { ...draft, sourceNodeId: "node-left-detail" }, { createId: createTestIds(), now: NOW })).toThrow(
      /main/i,
    );
  });
});
