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

  it("does not flag short shared Chinese phrases as repeated prose", () => {
    const graph = validReleaseGraph();
    graph.nodes[1] = {
      ...graph.nodes[1]!,
      body: "潮声穿过旧门，沈砚检查档案，微光落在桌面，时间正在逼近。",
    };
    graph.nodes[2] = {
      ...graph.nodes[2]!,
      body: "潮声穿过旧门，林小满守住入口，雨水打湿台阶，她等待回应。",
    };

    expect(runDeterministicRules(graph).some((issue) => issue.code === "REPEATED_PROSE")).toBe(false);
  });

  it("flags a long Chinese phrase with an eight-character measured n-gram", () => {
    const graph = validReleaseGraph();
    graph.nodes[1] = {
      ...graph.nodes[1]!,
      body: "沈砚沿着潮湿的长廊回到档案馆，发现墙上的标记仍在，门外的潮声渐远。",
    };
    graph.nodes[2] = {
      ...graph.nodes[2]!,
      body: "林小满沿着潮湿的长廊回到档案馆，发现墙上的标记仍在，门外的灯光渐暗。",
    };

    const issue = runDeterministicRules(graph).find((candidate) => candidate.code === "REPEATED_PROSE");
    expect(issue?.detailsJson).toMatchObject({ ngramSize: 8 });
  });

  it("reports at most one repeated-prose warning for a node pair", () => {
    const graph = validReleaseGraph();
    const repeated = "The brass gate opens slowly while the courier listens for the hidden mechanism.";
    graph.nodes[1] = { ...graph.nodes[1]!, body: `${repeated} The brass gate opens slowly again.` };
    graph.nodes[2] = { ...graph.nodes[2]!, body: `${repeated} The brass gate opens slowly again.` };

    expect(runDeterministicRules(graph).filter((issue) => issue.code === "REPEATED_PROSE")).toHaveLength(1);
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
