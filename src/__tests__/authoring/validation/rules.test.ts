import { describe, expect, it } from "vitest";
import { runDeterministicRules } from "@/lib/authoring/validation/rules";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

describe("deterministic quality rules", () => {
  it("flags similar choices and similar endings", () => {
    const graph = validReleaseGraph();
    graph.edges[0] = { ...graph.edges[0]!, label: "Open the left gate" };
    graph.edges[1] = { ...graph.edges[1]!, label: "Open the left gate" };
    graph.nodes[6] = { ...graph.nodes[6]!, title: "Share the light", body: "You share the light with the city.", summary: "The city receives the light." };
    graph.nodes[7] = { ...graph.nodes[7]!, title: "Share the light", body: "You share the light with the city.", summary: "The city receives the light." };
    const codes = runDeterministicRules(graph).map((issue) => issue.code);
    expect(codes).toContain("SIMILAR_CHOICES");
    expect(codes).toContain("SIMILAR_ENDINGS");
  });

  it("flags repeated prose across nodes and reports measured n-gram details", () => {
    const graph = validReleaseGraph();
    const repeated = "The brass gate opens slowly while the courier listens for the hidden mechanism.";
    graph.nodes[1] = { ...graph.nodes[1]!, body: repeated };
    graph.nodes[2] = { ...graph.nodes[2]!, body: `${repeated} A second lamp flickers.` };
    const issue = runDeterministicRules(graph).find((candidate) => candidate.code === "REPEATED_PROSE");
    expect(issue).toMatchObject({ severity: "warning", nodeId: graph.nodes[2]!.id });
    expect(issue?.detailsJson).toHaveProperty("ngram");
  });

  it("flags path depth imbalance, merge canon conflicts, and unresolved threads", () => {
    const graph = validReleaseGraph();
    graph.nodes[5] = { ...graph.nodes[5]!, title: "Lantern", body: "The lantern is blue at the merge.", summary: "The lantern changes color." };
    graph.edges.push({ ...graph.edges[0]!, id: "edge-start-short-ending", targetNodeId: graph.nodes[6]!.id, label: "End the search", sortOrder: 2 });
    const codes = runDeterministicRules(graph, { canonFacts: ["lantern: red"], openThreads: ["the missing map"] }).map((issue) => issue.code);
    expect(codes).toContain("DEPTH_IMBALANCE");
    expect(codes).toContain("MERGE_FACT_CONFLICT");
    expect(codes).toContain("MISSING_THREAD_RESOLUTION");
  });

  it("does not flag ordinary varied release prose", () => {
    const graph = validReleaseGraph();
    const issues = runDeterministicRules(graph);
    expect(issues).toEqual([]);
  });
});
