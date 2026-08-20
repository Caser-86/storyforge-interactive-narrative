import { z } from "zod";
import { GenerationCandidateSchema, GenerationRunSchema, GenerationStepSchema } from "./schemas";
import { StoryNodeSchema } from "../schemas";

export const GenerationCreateInputSchema = z
  .object({
    versionId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
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
export const CandidateResponseSchema = z.object({ candidate: GenerationCandidateSchema }).strict();
export const CandidateApplyResponseSchema = z.object({ candidate: GenerationCandidateSchema, node: StoryNodeSchema }).strict();

export type GenerationCreateInput = z.infer<typeof GenerationCreateInputSchema>;
export type GenerationActionInput = z.infer<typeof GenerationActionInputSchema>;
export type GenerationStatusResponse = z.infer<typeof GenerationStatusResponseSchema>;
export type CandidateApplyInput = z.infer<typeof CandidateApplyInputSchema>;
export type NodeRegenerateInput = z.infer<typeof NodeRegenerateInputSchema>;
