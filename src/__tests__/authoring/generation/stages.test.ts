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
    await executeBibleStage(generationContext, provider, briefFixture);
    await executeOutlineStage(generationContext, provider, briefFixture, bibleFixture);

    const bibleCall = provider.callsFor("bible:main")[0];
    const outlineCall = provider.callsFor("outline:main")[0];
    expect(bibleCall.userPrompt).toContain(briefFixture.promise);
    expect(outlineCall.userPrompt).toContain(bibleFixture.characters[0].name);
  });

  it("requires graph IDs to match the outline and schedules bounded work", async () => {
    const provider = providerWithFixtures();
    const result = await executeGraphStage(generationContext, provider, briefFixture, bibleFixture, outlineFixture);

    expect(result.output.nodes.map((node) => node.id)).toEqual(outlineFixture.nodes.map((node) => node.id));
    expect(result.nextSteps).toHaveLength(7);
    expect(result.nextSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepKey: "structural_check:main", stage: "structural_check", sortOrder: 4 }),
      expect.objectContaining({ stepKey: "nodes:node-start", stage: "nodes", sortOrder: 5 }),
      expect.objectContaining({ stepKey: "continuity_review:main", stage: "continuity_review", sortOrder: 10 }),
    ]));
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
