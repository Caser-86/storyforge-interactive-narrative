import { describe, expect, it } from "vitest";
import { buildPathCoverageReport } from "@/lib/authoring/validation/path-coverage";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

describe("release path coverage", () => {
  it("covers every node and edge when normal path enumeration is capped", () => {
    const report = buildPathCoverageReport(validReleaseGraph(), 1);

    expect(report.reachedCap).toBe(true);
    expect(report.uncoveredNodeIds).toEqual([]);
    expect(report.uncoveredEdgeIds).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("reports unreachable graph elements as blocking coverage gaps", () => {
    const graph = validReleaseGraph();
    const orphan = { ...graph.nodes[1]!, id: "node-orphan", nodeKey: "orphan", topologicalRank: 99 };
    const report = buildPathCoverageReport({ ...graph, nodes: [...graph.nodes, orphan] }, 100);

    expect(report.passed).toBe(false);
    expect(report.uncoveredNodeIds).toContain("node-orphan");
  });
});
