import { describe, expect, it } from "vitest";
import { AuthoringError } from "@/lib/authoring/errors";
import {
  enumeratePaths,
  getBlockingGraphIssues,
  topologicalSort,
  validateStoryGraph,
} from "@/lib/authoring/graph";
import {
  graphOverEndingLimit,
  graphOverNodeLimit,
  graphWithBrokenEdge,
  graphWithCycle,
  graphWithCycleAndAcyclicTail,
  graphWithDeadEnd,
  graphWithDuplicateChoices,
  graphWithEmptyChoice,
  graphWithEmptyNodeContent,
  graphWithEndingOutgoingEdge,
  graphWithMultipleIssues,
  graphWithOrphan,
  graphWithThreePaths,
  graphWithTrappedBranch,
  graphWithoutEnding,
  graphWithoutStart,
  testLimits,
  validConvergingGraph,
} from "@/__tests__/fixtures/authoring-graphs";

describe("authoring graph validation", () => {
  it.each([
    ["START_COUNT", graphWithoutStart()],
    ["ENDING_COUNT", graphWithoutEnding()],
    ["CYCLE", graphWithCycle()],
    ["UNREACHABLE_NODE", graphWithOrphan()],
    ["DEAD_END", graphWithDeadEnd()],
    ["NO_PATH_TO_ENDING", graphWithTrappedBranch()],
    ["BROKEN_EDGE", graphWithBrokenEdge()],
  ])("returns %s", (code, graph) => {
    expect(validateStoryGraph(graph, testLimits()).map((issue) => issue.code)).toContain(code);
  });

  it("returns no issues for a valid converging branch graph", () => {
    expect(validateStoryGraph(validConvergingGraph(), testLimits())).toEqual([]);
  });

  it("reports duplicate and empty choices under the same source", () => {
    expect(validateStoryGraph(graphWithDuplicateChoices(), testLimits()).map((issue) => issue.code)).toContain(
      "DUPLICATE_CHOICE",
    );
    expect(validateStoryGraph(graphWithEmptyChoice(), testLimits()).map((issue) => issue.code)).toContain(
      "EMPTY_CHOICE",
    );
  });

  it("reports outgoing edges from ending nodes", () => {
    expect(validateStoryGraph(graphWithEndingOutgoingEdge(), testLimits()).map((issue) => issue.code)).toContain(
      "ENDING_OUTGOING_EDGE",
    );
  });

  it("reports missing required node content", () => {
    expect(validateStoryGraph(graphWithEmptyNodeContent(), testLimits()).map((issue) => issue.code)).toContain(
      "EMPTY_NODE_CONTENT",
    );
  });

  it("reports node and ending limits", () => {
    expect(validateStoryGraph(graphOverNodeLimit(), testLimits({ maxNodes: 4 })).map((issue) => issue.code)).toContain(
      "NODE_LIMIT",
    );
    expect(
      validateStoryGraph(graphOverEndingLimit(), testLimits({ maxEndings: 1 })).map((issue) => issue.code),
    ).toContain("ENDING_LIMIT");
    expect(validateStoryGraph(validConvergingGraph(), testLimits({ minNodes: 6 })).map((issue) => issue.code)).toContain(
      "NODE_MIN_LIMIT",
    );
    expect(validateStoryGraph(validConvergingGraph(), testLimits({ minEndings: 2 })).map((issue) => issue.code)).toContain(
      "ENDING_MIN_LIMIT",
    );
  });

  it("derives the current blocking issues from the current graph", () => {
    const graph = graphWithMultipleIssues();
    const blockingIssues = getBlockingGraphIssues(graph, testLimits());

    expect(blockingIssues).toEqual(validateStoryGraph(graph, testLimits()).filter((issue) => issue.severity === "blocking"));
    expect(blockingIssues.every((issue) => issue.severity === "blocking")).toBe(true);
  });

  it("returns a deterministic topological order", () => {
    expect(topologicalSort(validConvergingGraph())).toEqual([
      "node-start",
      "node-left",
      "node-right",
      "node-merge",
      "node-ending",
    ]);
  });

  it("throws a validation error when topological sort sees a cycle", () => {
    expect(() => topologicalSort(graphWithCycle())).toThrowError(
      expect.objectContaining({
        code: "VALIDATION",
      } satisfies Partial<AuthoringError>),
    );
  });

  it("identifies only actual cycle nodes when a cycle has an acyclic tail", () => {
    const graph = graphWithCycleAndAcyclicTail();
    const cycleIssues = validateStoryGraph(graph, testLimits()).filter((issue) => issue.code === "CYCLE");

    expect(cycleIssues.map((issue) => issue.nodeId)).toEqual(["node-a", "node-b"]);
    expect(cycleIssues.map((issue) => issue.nodeId)).not.toContain("node-c");
    expect(cycleIssues.map((issue) => issue.nodeId)).not.toContain("node-ending");

    expect(() => topologicalSort(graph)).toThrowError(
      expect.objectContaining({
        details: { cycleNodeIds: ["node-a", "node-b"] },
      } satisfies Partial<AuthoringError>),
    );
  });

  it("enumerates deterministic root-to-ending paths and coverage", () => {
    expect(enumeratePaths(validConvergingGraph(), 10)).toEqual({
      cap: 10,
      reachedCap: false,
      startNodeId: "node-start",
      endingNodeIds: ["node-ending"],
      visitedNodeIds: ["node-start", "node-left", "node-merge", "node-ending", "node-right"],
      visitedEdgeIds: [
        "edge-start-left",
        "edge-left-merge",
        "edge-merge-ending",
        "edge-start-right",
        "edge-right-merge",
      ],
      paths: [
        {
          nodeIds: ["node-start", "node-left", "node-merge", "node-ending"],
          edgeIds: ["edge-start-left", "edge-left-merge", "edge-merge-ending"],
        },
        {
          nodeIds: ["node-start", "node-right", "node-merge", "node-ending"],
          edgeIds: ["edge-start-right", "edge-right-merge", "edge-merge-ending"],
        },
      ],
    });
  });

  it("makes capped path enumeration explicit", () => {
    expect(enumeratePaths(graphWithThreePaths(), 2)).toEqual({
      cap: 2,
      reachedCap: true,
      startNodeId: "node-start",
      endingNodeIds: ["node-ending"],
      visitedNodeIds: ["node-start", "node-left", "node-ending", "node-middle"],
      visitedEdgeIds: ["edge-start-left", "edge-left-ending", "edge-start-middle", "edge-middle-ending"],
      paths: [
        {
          nodeIds: ["node-start", "node-left", "node-ending"],
          edgeIds: ["edge-start-left", "edge-left-ending"],
        },
        {
          nodeIds: ["node-start", "node-middle", "node-ending"],
          edgeIds: ["edge-start-middle", "edge-middle-ending"],
        },
      ],
    });
  });

  it("orders issues deterministically by severity, code, and node key", () => {
    expect(
      validateStoryGraph(graphWithMultipleIssues(), testLimits()).map((issue) => ({
        code: issue.code,
        nodeId: issue.nodeId,
        edgeId: issue.edgeId,
      })),
    ).toEqual([
      { code: "DUPLICATE_CHOICE", nodeId: "node-start", edgeId: "edge-start-ending-duplicate" },
      { code: "EMPTY_CHOICE", nodeId: "node-start", edgeId: "edge-start-alpha" },
      { code: "EMPTY_NODE_CONTENT", nodeId: "node-alpha", edgeId: null },
    ]);
  });

  it("does not mutate the supplied graph", () => {
    const graph = validConvergingGraph();
    const snapshot = JSON.parse(JSON.stringify(graph));

    validateStoryGraph(graph, testLimits());
    topologicalSort(graph);
    enumeratePaths(graph, 10);

    expect(graph).toEqual(snapshot);
  });
});
