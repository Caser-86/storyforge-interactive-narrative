import { z } from "zod";
import { GenerationRunSchema, GenerationStepSchema } from "./schemas";

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

export type GenerationCreateInput = z.infer<typeof GenerationCreateInputSchema>;
export type GenerationActionInput = z.infer<typeof GenerationActionInputSchema>;
export type GenerationStatusResponse = z.infer<typeof GenerationStatusResponseSchema>;
