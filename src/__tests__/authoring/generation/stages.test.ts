import { describe, expect, it } from "vitest";
import { FakeGenerationProvider } from "@/lib/authoring/generation/fake-provider";
import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import { executeBibleStage, executeBriefStage, executeGraphStage, executeOutlineStage } from "@/lib/authoring/generation/stages";
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
});
