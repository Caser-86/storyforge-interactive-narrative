import { z } from "zod";
import type { GenerationProvider, ProviderResult } from "../provider";
import type { GenerationProjectContext } from "../prompts";
import { STAGE_MAX_TOKENS, STAGE_SYSTEM_PROMPT } from "../prompts";
import type { BibleOutput, GraphOutput, OutlineOutput } from "./types";
import { NodeContentOutputSchema, type NodeContentOutput } from "./nodes";

const ContinuityReviewIssueSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    nodeIds: z.array(z.string().min(1)).min(1),
    severity: z.literal("warning").optional(),
  })
  .strict();

export const ContinuityReviewOutputSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(ContinuityReviewIssueSchema),
  })
  .strict();

type ProviderContinuityReviewOutput = z.infer<typeof ContinuityReviewOutputSchema>;
export type ContinuityReviewOutput = {
  passed: boolean;
  issues: Array<ProviderContinuityReviewOutput["issues"][number] & { severity: "warning" }>;
};

export interface ContinuityReviewInput {
  provider: GenerationProvider;
  context: GenerationProjectContext;
  graph: GraphOutput;
  bible: BibleOutput;
  outline: OutlineOutput;
  nodeContents: NodeContentOutput[];
}

export interface ContinuityReviewResult {
  output: ContinuityReviewOutput;
  providerResult: ProviderResult<ProviderContinuityReviewOutput>;
}

export async function executeContinuityReview(input: ContinuityReviewInput): Promise<ContinuityReviewResult> {
  const providerResult = await input.provider.generate({
    stage: "continuity_review",
    stepKey: "continuity_review:main",
    systemPrompt: STAGE_SYSTEM_PROMPT,
    userPrompt: `Review continuity only. Return warnings with node evidence; do not invent blocking validation issues. Bible: ${JSON.stringify(input.bible)}. Outline: ${JSON.stringify(input.outline)}. Graph: ${JSON.stringify(input.graph)}. Node contents: ${JSON.stringify(input.nodeContents.map((node) => NodeContentOutputSchema.parse(node)))}. Return exactly this JSON shape: { "passed": true, "issues": [{ "code": "string", "message": "string", "nodeIds": ["string"], "severity": "warning" }] }. Use an empty issues array when no continuity warning exists. Do not include extra keys, markdown, or blocking validation claims.`,
    outputSchema: ContinuityReviewOutputSchema,
    model: input.context.model,
    maxTokens: STAGE_MAX_TOKENS.continuity_review,
  });

  return {
    output: {
      passed: providerResult.data.passed,
      issues: providerResult.data.issues.map((issue) => ({ ...issue, severity: "warning" as const })),
    },
    providerResult,
  };
}
