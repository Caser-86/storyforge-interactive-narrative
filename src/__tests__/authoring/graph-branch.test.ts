import { describe, expect, it } from "vitest";
import { addAuthorBranch, addAuthorEnding } from "@/lib/authoring/graph-branch";
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

const endingDraft = {
  sourceNodeId: "node-merge",
  choiceLabel: "Open the final lantern",
  intent: "Accept the archive's last decision.",
  consequenceSummary: "The courier chooses a new way to carry the light.",
  title: "A New Dawn",
  body: "The final lantern opens, and the archive releases its first morning light.",
  summary: "The courier creates a new future for the archive.",
  objective: "Give the archive a future beyond its old rules.",
};

function createEndingIds() {
  return (kind: "node" | "edge") => kind === "node" ? "new-ending" : "new-ending-edge";
}

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

  it("adds an author-authored ending and connects it to a non-ending node", () => {
    const graph = validReleaseGraph();
    const next = addAuthorEnding(graph, endingDraft, { createId: createEndingIds(), now: NOW });

    expect(next.nodes).toHaveLength(graph.nodes.length + 1);
    expect(next.edges).toHaveLength(graph.edges.length + 1);
    expect(next.nodes.find((node) => node.id === "new-ending")).toMatchObject({
      versionId: graph.versionId,
      chapterId: "chapter-1",
      kind: "ending",
      title: endingDraft.title,
      body: endingDraft.body,
      summary: endingDraft.summary,
      objective: endingDraft.objective,
      contentStatus: "review_required",
      authorModified: true,
      contentRevision: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(next.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "new-ending-edge",
        sourceNodeId: endingDraft.sourceNodeId,
        targetNodeId: "new-ending",
        label: endingDraft.choiceLabel,
        intent: endingDraft.intent,
        consequenceSummary: endingDraft.consequenceSummary,
        branchType: "side",
        sortOrder: 2,
      }),
    ]));
    expect(validateStoryGraph(next, testLimits())).toEqual([]);
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
    expect(() => addAuthorEnding(graph, { ...endingDraft, sourceNodeId: "node-keeper-ending" }, { createId: createEndingIds(), now: NOW })).toThrow(
      /ending/i,
    );
    expect(() => addAuthorEnding(graph, { ...endingDraft, choiceLabel: "Share the lantern" }, { createId: createEndingIds(), now: NOW })).toThrow(
      /choice label/i,
    );
  });
});
