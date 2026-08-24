import { describe, expect, it } from "vitest";
import { FakeGenerationProvider } from "@/lib/authoring/generation/fake-provider";
import type { GenerationProvider } from "@/lib/authoring/generation/provider";
import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import { executeBibleStage, executeBriefStage, executeContinuityReview, executeGraphStage, executeOutlineStage } from "@/lib/authoring/generation/stages";
import { generationContext, bibleFixture, briefFixture, graphFixture, outlineFixture } from "@/__tests__/fixtures/authoring-generation";

function providerWithFixtures(): FakeGenerationProvider {
  const provider = new FakeGenerationProvider();
  provider.reply("brief", "brief:main", briefFixture);
  provider.reply("bible", "bible:main", bibleFixture);
  provider.reply("outline", "outline:main", outlineFixture);
  provider.reply("graph", "graph:main", graphFixture);
  return provider;
}

describe("generation stage handlers", () => {
  it("generates a brief and schedules the bible stage", async () => {
    const provider = providerWithFixtures();
    const result = await executeBriefStage(generationContext, provider);

    expect(result.output).toEqual(briefFixture);
    expect(result.nextSteps).toEqual([expect.objectContaining({ stepKey: "bible:main", stage: "bible", sortOrder: 1 })]);
    expect(provider.callsFor("brief:main")).toHaveLength(1);
  });

  it("passes prior stage outputs into dependent prompts", async () => {
    const provider = providerWithFixtures();
    const context = {
      ...generationContext,
      size: { ...generationContext.size, targetNodes: outlineFixture.nodes.length },
    };
    await executeBibleStage(context, provider, briefFixture);
    await executeOutlineStage(context, provider, briefFixture, bibleFixture);

    const bibleCall = provider.callsFor("bible:main")[0];
    const outlineCall = provider.callsFor("outline:main")[0];
    expect(bibleCall.userPrompt).toContain(briefFixture.promise);
    expect(outlineCall.userPrompt).toContain(bibleFixture.characters[0].name);
  });

  it("rejects an outline that underfills the requested node budget", async () => {
    const provider = providerWithFixtures();
    const context = {
      ...generationContext,
      size: { ...generationContext.size, targetNodes: 6 },
    };

    await expect(executeOutlineStage(context, provider, briefFixture, bibleFixture)).rejects.toMatchObject({
      code: "SCHEMA",
      retryable: false,
    } satisfies Partial<ProviderError>);
  });

  it("promotes a scene plan when the outline is short one ending", async () => {
    const provider = providerWithFixtures();
    const context = {
      ...generationContext,
      size: { ...generationContext.size, targetNodes: outlineFixture.nodes.length },
    };
    provider.reply("outline", "outline:main", {
      ...outlineFixture,
      nodes: outlineFixture.nodes.map((node) => node.id === "node-right-end" ? { ...node, kind: "scene" as const } : node),
    });

    const result = await executeOutlineStage(context, provider, briefFixture, bibleFixture);

    expect(result.output.nodes.filter((node) => node.kind === "ending")).toHaveLength(2);
    expect(result.output.nodes.find((node) => node.id === "node-right-end")?.kind).toBe("ending");
  });

  it("requires graph IDs to match the outline and schedules bounded work", async () => {
    const provider = providerWithFixtures();
    const result = await executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture);

    expect(result.output.nodes.map((node) => node.id)).toEqual(outlineFixture.nodes.map((node) => `${generationContext.versionId}:${node.id}`));
    expect(result.nextSteps).toHaveLength(7);
    expect(result.nextSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepKey: "structural_check:main", stage: "structural_check", sortOrder: 4 }),
      expect.objectContaining({ stepKey: "nodes:version-1:node-start", stage: "nodes", sortOrder: 5 }),
      expect.objectContaining({ stepKey: "continuity_review:main", stage: "continuity_review", sortOrder: 10 }),
    ]));
  });

  it("namespaces graph IDs before downstream persistence", async () => {
    const provider = providerWithFixtures();
    const result = await executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture);

    expect(result.output.nodes[0]?.id).toBe("version-1:node-start");
    expect(result.output.edges[0]?.id).toBe("version-1:edge-start-left");
    expect(result.nextSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepKey: "nodes:version-1:node-start", stage: "nodes" }),
    ]));
  });

  it("repairs a self-loop by routing it to the nearest later node", async () => {
    const provider = providerWithFixtures();
    provider.reply("graph", "graph:main", {
      ...graphFixture,
      edges: [
        ...graphFixture.edges,
        { id: "edge-start-loop", sourceNodeId: "node-start", targetNodeId: "node-start", label: "Stay and listen", intent: "wait", consequenceSummary: "The archive answers.", branchType: "side" as const, sortOrder: 2 },
      ],
    });

    const result = await executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture);
    const repaired = result.output.edges.find((edge) => edge.id.endsWith(":edge-start-loop"));
    expect(repaired?.targetNodeId).toBe("version-1:node-left");
  });

  it("repairs a non-ending dead end by connecting it to an ending", async () => {
    const provider = providerWithFixtures();
    provider.reply("graph", "graph:main", {
      ...graphFixture,
      edges: graphFixture.edges.filter((edge) => edge.sourceNodeId !== "node-right"),
    });

    const result = await executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture);
    const repaired = result.output.edges.find((edge) => edge.sourceNodeId === "version-1:node-right" && edge.id.includes(":repair:"));
    expect(repaired?.targetNodeId).toBe("version-1:node-left-end");
    expect(repaired?.branchType).toBe("main");
  });

  it("removes outgoing edges from ending nodes before structural validation", async () => {
    const provider = providerWithFixtures();
    provider.reply("graph", "graph:main", {
      ...graphFixture,
      edges: [
        ...graphFixture.edges,
        { id: "edge-ending-loop", sourceNodeId: "node-left-end", targetNodeId: "node-right", label: "Reopen the case", intent: "return to the investigation", consequenceSummary: "The ending is undone.", branchType: "side" as const, sortOrder: 0 },
      ],
    });

    const result = await executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture);

    expect(result.output.edges.some((edge) => edge.sourceNodeId === "version-1:node-left-end")).toBe(false);
    expect(result.output.edges.some((edge) => edge.sourceNodeId === "version-1:node-right-end")).toBe(false);
  });

  it("rejects graph output beyond the project node budget", async () => {
    const provider = providerWithFixtures();
    const oversized = {
      ...graphFixture,
      nodes: Array.from({ length: 9 }, (_, index) => ({
        ...graphFixture.nodes[index % graphFixture.nodes.length],
        id: `node-${index}`,
      })),
    };
    provider.reply("graph", "graph:main", oversized);

    await expect(executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture)).rejects.toMatchObject({
      code: "SCHEMA",
      retryable: false,
    } satisfies Partial<ProviderError>);
  });

  it("keeps graph node kinds aligned with the outline", async () => {
    const provider = providerWithFixtures();
    provider.reply("graph", "graph:main", {
      ...graphFixture,
      nodes: graphFixture.nodes.map((node) => node.id === "node-right" ? { ...node, kind: "ending" as const } : node),
    });

    const result = await executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture);

    expect(result.output.nodes.find((node) => node.id === "version-1:node-right")?.kind).toBe("scene");
  });

  it("requires exactly one main edge at each branching node", async () => {
    const provider = providerWithFixtures();
    provider.reply("graph", "graph:main", {
      ...graphFixture,
      edges: graphFixture.edges.map((edge) => edge.sourceNodeId === "node-start" ? { ...edge, branchType: "main" as const } : edge),
    });

    await expect(executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture)).rejects.toMatchObject({
      code: "SCHEMA",
      retryable: false,
    } satisfies Partial<ProviderError>);
  });

  it("keeps continuity review non-blocking when the provider returns invalid JSON", async () => {
    const provider: GenerationProvider = {
      generate: async () => {
        throw new ProviderError("SCHEMA", "Provider returned invalid JSON", false);
      },
    };

    const result = await executeContinuityReview({
      provider,
      context: generationContext,
      graph: graphFixture,
      bible: bibleFixture,
      outline: outlineFixture,
      nodeContents: graphFixture.nodes.map((node) => ({
        nodeId: node.id,
        body: `${node.title} body.`,
        summary: node.summary,
        objective: node.objective,
      })),
    });

    expect(result.output).toEqual({
      passed: true,
      issues: [expect.objectContaining({ code: "CONTINUITY_REVIEW_FALLBACK", severity: "warning" })],
    });
    expect(result.providerResult.model).toBe("local-continuity-fallback");
  });

  it("rejects a graph that has only one decision point", async () => {
    const provider = providerWithFixtures();
    provider.reply("graph", "graph:main", {
      ...graphFixture,
      edges: graphFixture.edges.filter((edge) => edge.sourceNodeId !== "node-left"),
    });

    await expect(executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture)).rejects.toMatchObject({
      code: "SCHEMA",
      retryable: false,
    } satisfies Partial<ProviderError>);
  });

  it("repairs a start node that has only one choice", async () => {
    const provider = providerWithFixtures();
    provider.reply("graph", "graph:main", {
      ...graphFixture,
      edges: graphFixture.edges.filter((edge) => edge.sourceNodeId !== "node-start" || edge.sortOrder === 0),
    });

    const result = await executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture);
    expect(result.output.edges.filter((edge) => edge.sourceNodeId === "version-1:node-start")).toHaveLength(2);
  });

  it("rejects a repaired start when two choices would share one target", async () => {
    const provider = providerWithFixtures();
    provider.reply("graph", "graph:main", {
      ...graphFixture,
      nodes: graphFixture.nodes.map((node) => ({
        ...node,
        topologicalRank: node.id === "node-left" ? 1 : 0,
      })),
      edges: graphFixture.edges.filter((edge) => edge.sourceNodeId !== "node-start"),
    });

    await expect(executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture)).rejects.toMatchObject({
      code: "SCHEMA",
      retryable: false,
    } satisfies Partial<ProviderError>);
  });
});
