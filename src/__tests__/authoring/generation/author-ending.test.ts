import { describe, expect, it } from "vitest";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";
import { FakeGenerationProvider } from "@/lib/authoring/generation/fake-provider";
import { AuthorEndingOutputSchema, generateAuthorEnding } from "@/lib/authoring/generation/stages/author-ending";
import type { GenerationProjectContext } from "@/lib/authoring/generation/prompts";

const context: GenerationProjectContext = {
  projectId: "project-1",
  versionId: "version-1",
  title: "雾港第七号档案",
  premise: "一名档案员发现一份预告失踪名单。",
  genre: "悬疑",
  tone: "克制紧张",
  pointOfView: "第三人称",
  rating: "PG-13",
  language: "Chinese",
  size: { preset: "short", targetNodes: 15, targetEndings: 2 },
  model: "deepseek-v4-flash",
};

const ending = {
  choiceLabel: "公开档案，结束潮汐循环",
  intent: "让主角选择公开真相而不是继续隐瞒。",
  consequenceSummary: "真相公开会带来调查，但也会保护港口居民。",
  title: "潮声退去之后",
  body: "沈砚把档案交给记者，潮声终于在清晨退去。",
  summary: "沈砚公开档案，结束潮汐循环并承担后果。",
  objective: "让真相公开，同时完成主角的道德选择。",
};

describe("author ending generation", () => {
  it("returns a structured ending preview without changing the graph", async () => {
    const graph = validReleaseGraph();
    const provider = new FakeGenerationProvider();
    provider.reply("author_ending", "author-ending:node-merge", ending, { inputTokens: 20, outputTokens: 40 });

    const result = await generateAuthorEnding({
      provider,
      context,
      graph,
      sourceNodeId: "node-merge",
      direction: "让沈砚选择公开档案并承担代价。",
    });

    expect(result.output).toEqual(AuthorEndingOutputSchema.parse(ending));
    expect(result.providerResult.inputTokens).toBe(20);
    expect(provider.allCalls()).toHaveLength(1);
    expect(provider.allCalls()[0]?.stage).toBe("author_ending");
    expect(provider.allCalls()[0]?.userPrompt).toContain("让沈砚选择公开档案并承担代价");
    expect(provider.allCalls()[0]?.userPrompt).toContain("merge title");
    expect(graph.nodes).toHaveLength(8);
    expect(graph.nodes.filter((node) => node.kind === "ending")).toHaveLength(2);
  });

  it("rejects incomplete or extra model fields", () => {
    expect(AuthorEndingOutputSchema.safeParse({ ...ending, summary: "" }).success).toBe(false);
    expect(AuthorEndingOutputSchema.safeParse({ ...ending, extra: "do not accept" }).success).toBe(false);
  });
});
