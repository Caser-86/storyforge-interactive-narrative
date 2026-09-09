import { z } from "zod";

export const ProjectGenerationMetricsSchema = z.object({
  totalRuns: z.number().int().min(0),
  activeRuns: z.number().int().min(0),
  completedRuns: z.number().int().min(0),
  failedRuns: z.number().int().min(0),
  canceledRuns: z.number().int().min(0),
  pausedRuns: z.number().int().min(0),
  totalInputTokens: z.number().int().min(0),
  totalOutputTokens: z.number().int().min(0),
  totalRetries: z.number().int().min(0),
  totalCalls: z.number().int().min(0),
  failuresByCode: z.record(z.number().int().min(0)),
  stageLatencyMs: z.record(z.object({ calls: z.number().int().min(0), p50: z.number().min(0), p95: z.number().min(0) }).strict()),
  estimatedCost: z.number().min(0).nullable(),
  interactiveUsage: z.object({
    totalCalls: z.number().int().min(0),
    succeededCalls: z.number().int().min(0),
    unknownCalls: z.number().int().min(0),
    reservedCalls: z.number().int().min(0),
    canceledCalls: z.number().int().min(0),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    unknownOutputTokens: z.number().int().min(0),
    reservedOutputTokens: z.number().int().min(0),
    retries: z.number().int().min(0),
  }).strict(),
}).strict();

export type ProjectGenerationMetricsPayload = z.infer<typeof ProjectGenerationMetricsSchema>;
