import { z } from "zod";
import { GenerationCandidateSchema, GenerationRunSchema, GenerationStepSchema } from "./schemas";
import { StoryNodeSchema } from "../schemas";
import { AuthorEndingOutputSchema } from "./stages/author-ending";

export const GenerationCreateInputSchema = z
  .object({
    versionId: z.string().min(1).optional(),
    model: z.string().trim().min(1).max(80).optional(),
    freshDraft: z.boolean().optional(),
  })
  .strict();

export const GenerationActionInputSchema = z
  .object({
    action: z.enum(["pause", "resume", "cancel"]),
  })
  .strict();

export const GenerationStepSummarySchema = GenerationStepSchema.omit({
  requestJson: true,
  rawResponse: true,
  parsedResponseJson: true,
});

export const GenerationResponseSchema = z
  .object({
    run: GenerationRunSchema,
  })
  .strict();

export const GenerationListResponseSchema = z
  .object({
    runs: z.array(GenerationRunSchema),
  })
  .strict();

export const GenerationStatusResponseSchema = z
  .object({
    run: GenerationRunSchema,
    steps: z.array(GenerationStepSummarySchema),
    lastCompletedStep: GenerationStepSummarySchema.nullable(),
  })
  .strict();

export const GenerationNextResponseSchema = z
  .object({
    run: GenerationRunSchema,
    leasedSteps: z.array(GenerationStepSummarySchema),
    lastCompletedStep: GenerationStepSummarySchema.nullable(),
  })
  .strict();

export const CandidateApplyInputSchema = z.object({ expectedRevision: z.number().int().min(0) }).strict();
export const NodeRegenerateInputSchema = z.object({ expectedRevision: z.number().int().min(0).optional() }).strict();
export const AuthorEndingGenerationInputSchema = z
  .object({
    sourceNodeId: z.string().trim().min(1).max(200),
    expectedRevision: z.number().int().min(0),
    direction: z.string().trim().max(600).optional(),
  })
  .strict();
export const CandidateResponseSchema = z.object({ candidate: GenerationCandidateSchema }).strict();
export const CandidateApplyResponseSchema = z.object({ candidate: GenerationCandidateSchema, node: StoryNodeSchema, draftRevision: z.number().int().min(0) }).strict();
export const AuthorEndingGenerationResponseSchema = z
  .object({
    sourceNodeId: z.string().min(1),
    basedOnRevision: z.number().int().min(0),
    model: z.string().min(1),
    ending: AuthorEndingOutputSchema,
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    usageConfirmed: z.boolean().optional(),
  })
  .strict();

export type GenerationCreateInput = z.infer<typeof GenerationCreateInputSchema>;
export type GenerationActionInput = z.infer<typeof GenerationActionInputSchema>;
export type GenerationStatusResponse = z.infer<typeof GenerationStatusResponseSchema>;
export type CandidateApplyInput = z.infer<typeof CandidateApplyInputSchema>;
export type NodeRegenerateInput = z.infer<typeof NodeRegenerateInputSchema>;
export type AuthorEndingGenerationInput = z.infer<typeof AuthorEndingGenerationInputSchema>;
export type AuthorEndingGenerationResponse = z.infer<typeof AuthorEndingGenerationResponseSchema>;
