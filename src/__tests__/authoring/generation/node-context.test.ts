import { describe, expect, it } from "vitest";
import { FakeGenerationProvider } from "@/lib/authoring/generation/fake-provider";
import { buildNodeContext } from "@/lib/authoring/generation/context";
import { executeContinuityReview } from "@/lib/authoring/generation/stages/continuity-review";
import { executeNodeBatch } from "@/lib/authoring/generation/stages/nodes";
import { executeStructuralCheck } from "@/lib/authoring/generation/stages/structural-check";
import { generationContext, bibleFixture, graphFixture, outlineFixture } from "@/__tests__/fixtures/authoring-generation";

const nodeContent = {
  nodeId: "node-start",
  body: "You open the service door and hear roots turning below the rails.",
  summary: "Mara enters the hidden route.",
  objective: "Reach the orchard without alerting the city.",
};

describe("generation node context", () => {
  it("includes shared predecessor facts but excludes unrelated graph prose", () => {
    const context = buildNodeContext(graphFixture, "node-left-end");

    expect(context.predecessorSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "node-start" }),
      expect.objectContaining({ nodeId: "node-left" }),
    ]));
    expect(JSON.stringify(context)).not.toContain("node-right");
    expect(JSON.stringify(context)).not.toContain("node-right-end");
  });

  it("stops before node calls when structural issues are blocking", () => {
    const cyclic = {
      ...graphFixture,
      edges: [
        ...graphFixture.edges,
        {
          id: "edge-cycle",
          sourceNodeId: "node-left-end",
          targetNodeId: "node-start",
          label: "Return",
          intent: "loop",
          consequenceSummary: "The route folds back.",
          sortOrder: 1,
        },
      ],
    };

    const result = executeStructuralCheck(generationContext, cyclic);

    expect(result.passed).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain("CYCLE");
  });

  it("generates at most two uncompleted nodes per bounded batch", async () => {
    const provider = new FakeGenerationProvider();
    for (const node of graphFixture.nodes.slice(0, 3)) {
      provider.reply("nodes", `nodes:${node.id}`, {
        ...nodeContent,
        nodeId: node.id,
        body: `${node.title} body`,
        summary: `${node.title} summary`,
        objective: `${node.title} objective`,
      });
    }

    const result = await executeNodeBatch({ provider, graph: graphFixture, nodeIds: ["node-start", "node-left", "node-right"] }, 2);

    expect(result.outputs).toHaveLength(2);
    expect(provider.allCalls()).toHaveLength(2);
  });

  it("returns warning-only continuity review output", async () => {
    const provider = new FakeGenerationProvider();
    provider.reply("continuity_review", "continuity_review:main", {
      passed: true,
      issues: [
        { code: "THREAD_UNRESOLVED", message: "The orchard map remains ambiguous.", nodeIds: ["node-left"] },
      ],
    });

    const result = await executeContinuityReview({
      provider,
      context: generationContext,
      graph: graphFixture,
      bible: bibleFixture,
      outline: outlineFixture,
      nodeContents: [nodeContent],
    });

    expect(result.output.issues[0]).toMatchObject({ code: "THREAD_UNRESOLVED" });
    expect(result.output.issues[0].severity).toBe("warning");
  });
});
