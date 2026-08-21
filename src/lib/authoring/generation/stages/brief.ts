import type { GenerationProvider } from "../provider";
import type { GenerationProjectContext } from "../prompts";
import { buildBriefPrompt, STAGE_MAX_TOKENS, STAGE_SYSTEM_PROMPT } from "../prompts";
import { BriefOutputSchema } from "./types";
import type { BriefOutput, StageExecutionResult } from "./types";

export async function executeBriefStage(
  context: GenerationProjectContext,
  provider: GenerationProvider,
): Promise<StageExecutionResult<BriefOutput>> {
  const providerResult = await provider.generate({
    stage: "brief",
    stepKey: "brief:main",
    systemPrompt: STAGE_SYSTEM_PROMPT,
    userPrompt: buildBriefPrompt(context),
    outputSchema: BriefOutputSchema,
    model: context.model,
    maxTokens: STAGE_MAX_TOKENS.brief,
  });

  return {
    output: providerResult.data,
    providerResult,
    nextSteps: [{ stepKey: "bible:main", stage: "bible", sortOrder: 1 }],
  };
}
