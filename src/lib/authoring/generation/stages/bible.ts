import type { GenerationProvider } from "../provider";
import type { GenerationProjectContext } from "../prompts";
import { buildBiblePrompt, STAGE_SYSTEM_PROMPT } from "../prompts";
import type { BriefOutput, BibleOutput, StageExecutionResult } from "./types";
import { BibleOutputSchema } from "./types";

export async function executeBibleStage(
  context: GenerationProjectContext,
  provider: GenerationProvider,
  brief: BriefOutput,
): Promise<StageExecutionResult<BibleOutput>> {
  const providerResult = await provider.generate({
    stage: "bible",
    stepKey: "bible:main",
    systemPrompt: STAGE_SYSTEM_PROMPT,
    userPrompt: buildBiblePrompt(context, brief),
    outputSchema: BibleOutputSchema,
    model: context.model,
  });

  return {
    output: providerResult.data,
    providerResult,
    nextSteps: [{ stepKey: "outline:main", stage: "outline", sortOrder: 2 }],
  };
}
