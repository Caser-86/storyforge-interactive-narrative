import type { GenerationProvider } from "../provider";
import type { GenerationProjectContext } from "../prompts";
import { buildOutlinePrompt, STAGE_MAX_TOKENS, STAGE_SYSTEM_PROMPT } from "../prompts";
import type { BriefOutput, BibleOutput, OutlineOutput, StageExecutionResult } from "./types";
import { OutlineOutputSchema } from "./types";
import { assertUnique, schemaFailure } from "./common";

function repairMissingEndings(context: GenerationProjectContext, output: OutlineOutput): OutlineOutput {
  const endingCount = output.nodes.filter((node) => node.kind === "ending").length;
  const missingCount = context.size.targetEndings - endingCount;
  if (missingCount <= 0) return output;

  const candidates = output.nodes.filter((node) => node.kind === "scene").slice(-missingCount);
  if (candidates.length < missingCount) return output;

  const candidateIds = new Set(candidates.map((node) => node.id));
  return {
    ...output,
    nodes: output.nodes.map((node) => candidateIds.has(node.id) ? { ...node, kind: "ending" as const } : node),
  };
}

export async function executeOutlineStage(
  context: GenerationProjectContext,
  provider: GenerationProvider,
  brief: BriefOutput,
  bible: BibleOutput,
): Promise<StageExecutionResult<OutlineOutput>> {
  const providerResult = await provider.generate({
    stage: "outline",
    stepKey: "outline:main",
    systemPrompt: STAGE_SYSTEM_PROMPT,
    userPrompt: buildOutlinePrompt(context, brief, bible),
    outputSchema: OutlineOutputSchema,
    model: context.model,
    maxTokens: STAGE_MAX_TOKENS.outline,
  });
  const output = providerResult.data;

  assertUnique(output.chapters.map((chapter) => chapter.id), "Chapter");
  assertUnique(output.nodes.map((node) => node.id), "Node");
  if (output.nodes.length !== context.size.targetNodes) {
    throw schemaFailure("Outline must contain exactly the project node budget", {
      nodeCount: output.nodes.length,
      targetNodes: context.size.targetNodes,
    });
  }
  const chapterIds = new Set(output.chapters.map((chapter) => chapter.id));
  if (output.nodes.some((node) => !chapterIds.has(node.chapterId))) {
    throw schemaFailure("Outline node references an unknown chapter");
  }
  const repairedOutput = repairMissingEndings(context, output);
  if (repairedOutput.nodes.filter((node) => node.kind === "start").length !== 1) {
    throw schemaFailure("Outline must contain exactly one start node");
  }
  const endingCount = repairedOutput.nodes.filter((node) => node.kind === "ending").length;
  if (endingCount !== context.size.targetEndings) {
    throw schemaFailure("Outline must contain exactly the requested ending nodes", {
      endingCount,
      targetEndings: context.size.targetEndings,
    });
  }

  return {
    output: repairedOutput,
    providerResult,
    nextSteps: [{ stepKey: "graph:main", stage: "graph", sortOrder: 3 }],
  };
}
