import type { GenerationProvider } from "../provider";
import type { GenerationProjectContext } from "../prompts";
import { buildOutlinePrompt, STAGE_SYSTEM_PROMPT } from "../prompts";
import type { BriefOutput, BibleOutput, OutlineOutput, StageExecutionResult } from "./types";
import { OutlineOutputSchema } from "./types";
import { assertUnique, schemaFailure } from "./common";

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
  });
  const output = providerResult.data;

  assertUnique(output.chapters.map((chapter) => chapter.id), "Chapter");
  assertUnique(output.nodes.map((node) => node.id), "Node");
  if (output.nodes.length > context.size.targetNodes) {
    throw schemaFailure("Outline exceeds the project node budget", {
      nodeCount: output.nodes.length,
      targetNodes: context.size.targetNodes,
    });
  }
  const chapterIds = new Set(output.chapters.map((chapter) => chapter.id));
  if (output.nodes.some((node) => !chapterIds.has(node.chapterId))) {
    throw schemaFailure("Outline node references an unknown chapter");
  }
  if (output.nodes.filter((node) => node.kind === "start").length !== 1) {
    throw schemaFailure("Outline must contain exactly one start node");
  }
  if (output.nodes.filter((node) => node.kind === "ending").length < context.size.targetEndings) {
    throw schemaFailure("Outline does not contain enough ending nodes", { targetEndings: context.size.targetEndings });
  }

  return {
    output,
    providerResult,
    nextSteps: [{ stepKey: "graph:main", stage: "graph", sortOrder: 3 }],
  };
}
