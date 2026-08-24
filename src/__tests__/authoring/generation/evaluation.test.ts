import { describe, expect, it } from "vitest";
import { buildFakeEvaluationCandidate, evaluateCandidate } from "@/lib/authoring/generation/evaluation";

const fixture = {
  id: "zh-suspense-test",
  title: "第九档案室",
  genre: "悬疑",
  language: "zh-CN" as const,
  targetNodes: 8,
  targetEndings: 2,
  minimumDecisionPoints: 2,
  requiredTerms: ["档案", "门"],
  expectedOutcome: "completed" as const,
};

describe("generation evaluation", () => {
  it("passes a bounded fake candidate and emits only scorecard metrics", () => {
    const result = evaluateCandidate(fixture, buildFakeEvaluationCandidate(fixture));
    expect(result.passed).toBe(true);
    expect(result.structuralPass).toBe(true);
    expect(result.choiceContractPass).toBe(true);
    expect(result.endingContractPass).toBe(true);
    expect(result.languageMatch).toBe(true);
    expect(JSON.stringify(result)).not.toContain("作出选择并承担后果");
  });

  it("reports invalid output schema without throwing or leaking output", () => {
    const result = evaluateCandidate(fixture, { graph: {}, nodeContents: [], outcome: "completed" });
    expect(result).toMatchObject({ passed: false, schemaFailure: true, issueCodes: ["OUTPUT_SCHEMA"] });
  });

  it("detects a missing branch decision", () => {
    const candidate = buildFakeEvaluationCandidate(fixture);
    const graph = structuredClone(candidate.graph) as { edges: Array<{ sourceNodeId: string; id: string }> };
    graph.edges = graph.edges.filter((edge) => !["edge-start-side", "edge-2"].includes(edge.id));
    const result = evaluateCandidate(fixture, { ...candidate, graph });
    expect(result.passed).toBe(false);
    expect(result.issueCodes).toContain("CHOICE_CONTRACT");
  });

  it("detects missing endings and wrong language/terms", () => {
    const candidate = buildFakeEvaluationCandidate(fixture);
    const graph = structuredClone(candidate.graph) as { nodes: Array<{ id: string; kind: string }>; edges: Array<{ targetNodeId: string }> };
    graph.nodes = graph.nodes.filter((node) => node.id !== "ending-2");
    graph.edges = graph.edges.filter((edge) => edge.targetNodeId !== "ending-2");
    const englishGraph = JSON.parse(JSON.stringify(graph).replace(/[\u3400-\u9fff]/gu, "story"));
    const englishContents = Array.from({ length: 8 }, (_, index) => ({ nodeId: "node-" + index, body: "The story continues.", summary: "A choice remains.", objective: "Continue." }));
    const result = evaluateCandidate(fixture, { ...candidate, graph: englishGraph, nodeContents: englishContents });
    expect(result.issueCodes).toEqual(expect.arrayContaining(["ENDING_CONTRACT", "LANGUAGE_OR_TERMS"]));
  });

  it("treats an explicitly expected cancellation or budget pause as observable outcomes", () => {
    const canceledFixture = { ...fixture, id: "zh-cancel-test", expectedOutcome: "canceled" as const };
    const candidate = buildFakeEvaluationCandidate(canceledFixture);
    const result = evaluateCandidate(canceledFixture, { ...candidate, outcome: "canceled" });
    expect(result.passed).toBe(true);
    expect(result.expectedOutcomeObserved).toBe(true);
  });
});
