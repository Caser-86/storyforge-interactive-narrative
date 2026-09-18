import { z } from "zod";
import type { StoryGraph } from "../../schemas";
import { AuthoringError } from "../../errors";
import { buildNodeContext } from "../context";
import type { GenerationProvider, ProviderResult } from "../provider";
import { STAGE_MAX_TOKENS, STAGE_SYSTEM_PROMPT, type GenerationProjectContext } from "../prompts";
import type { GraphOutput } from "./types";

export const AuthorEndingOutputSchema = z
  .object({
    choiceLabel: z.string().trim().min(1).max(240),
    intent: z.string().trim().min(1).max(600),
    consequenceSummary: z.string().trim().min(1).max(800),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(12_000),
    summary: z.string().trim().min(1).max(600),
    objective: z.string().trim().min(1).max(600),
  })
  .strict();

export type AuthorEndingOutput = z.infer<typeof AuthorEndingOutputSchema>;

export interface AuthorEndingGenerationInput {
  provider: GenerationProvider;
  context: GenerationProjectContext;
  graph: StoryGraph;
  sourceNodeId: string;
  direction?: string;
}

export interface AuthorEndingGenerationResult {
  output: AuthorEndingOutput;
  providerResult: ProviderResult<AuthorEndingOutput>;
}

function toGenerationGraph(graph: StoryGraph): GraphOutput {
  return {
    chapters: graph.chapters.map(({ id, title, goal, summary }) => ({ id, title, goal, summary })),
    nodes: graph.nodes.map(({ id, chapterId, kind, title, summary, objective, topologicalRank }) => ({
      id,
      chapterId,
      kind,
      title,
      summary,
      objective,
      topologicalRank,
    })),
    edges: graph.edges.map(({ id, sourceNodeId, targetNodeId, label, intent, consequenceSummary, branchType, sortOrder }) => ({
      id,
      sourceNodeId,
      targetNodeId,
      label,
      intent,
      consequenceSummary,
      branchType,
      sortOrder,
    })),
  };
}

export async function generateAuthorEnding(input: AuthorEndingGenerationInput): Promise<AuthorEndingGenerationResult> {
  const sourceNode = input.graph.nodes.find((node) => node.id === input.sourceNodeId);
  if (!sourceNode) {
    throw new AuthoringError("NOT_FOUND", "Source node not found.", { sourceNodeId: input.sourceNodeId });
  }
  if (sourceNode.kind === "ending") {
    throw new AuthoringError("VALIDATION", "An ending node cannot create another ending.", { sourceNodeId: input.sourceNodeId });
  }

  const generationGraph = toGenerationGraph(input.graph);
  const nodeContext = buildNodeContext(generationGraph, sourceNode.id);
  const direction = input.direction?.trim() || "请根据当前故事自然推进，并让主要冲突得到有代价但完整的收束。";
  const existingEndings = input.graph.nodes
    .filter((node) => node.kind === "ending")
    .map(({ id, title, summary, objective }) => ({ id, title, summary, objective }));

  const providerResult = await input.provider.generate({
    stage: "author_ending",
    stepKey: `author-ending:${sourceNode.id}`,
    systemPrompt: STAGE_SYSTEM_PROMPT,
    userPrompt: [
      "Generate one author-confirmable ending for the current story branch.",
      `Project: ${JSON.stringify({
        title: input.context.title,
        premise: input.context.premise,
        genre: input.context.genre,
        tone: input.context.tone,
        pointOfView: input.context.pointOfView,
        rating: input.context.rating,
        language: input.context.language,
        size: input.context.size,
      })}.`,
      `Current source node: ${JSON.stringify({
        id: sourceNode.id,
        title: sourceNode.title,
        body: sourceNode.body,
        summary: sourceNode.summary,
        objective: sourceNode.objective,
      })}.`,
      `Story context: ${JSON.stringify(nodeContext)}.`,
      `Existing endings: ${JSON.stringify(existingEndings)}.`,
      `Author direction: ${JSON.stringify(direction)}.`,
      "Write every natural-language value in the project language. Make this a final ending, not another open branch. Preserve established facts and resolve the main conflict. Return exactly this JSON shape: { \"choiceLabel\": \"string\", \"intent\": \"string\", \"consequenceSummary\": \"string\", \"title\": \"string\", \"body\": \"string\", \"summary\": \"string\", \"objective\": \"string\" }. Do not include extra keys, markdown, analysis, or commentary.",
    ].join(" "),
    outputSchema: AuthorEndingOutputSchema,
    model: input.context.model,
    maxTokens: STAGE_MAX_TOKENS.author_ending,
  });

  return { output: providerResult.data, providerResult };
}
