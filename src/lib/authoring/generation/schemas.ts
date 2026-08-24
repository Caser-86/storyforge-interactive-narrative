import { z } from "zod";
import { JsonValueSchema } from "../schemas";
import { GenerationBudgetSchema } from "./budget";

export const GenerationStageSchema = z.enum([
  "brief",
  "bible",
  "outline",
  "graph",
  "structural_check",
  "nodes",
  "continuity_review",
  "ready",
]);

export const GenerationRunStatusSchema = z.enum(["queued", "running", "paused", "failed", "completed", "canceled"]);

export const GenerationStepStatusSchema = z.enum(["queued", "running", "completed", "failed", "canceled"]);

export const GenerationErrorCodeSchema = z.enum([
  "AUTH",
  "RATE_LIMIT",
  "TIMEOUT",
  "NETWORK",
  "EMPTY",
  "SCHEMA",
  "VALIDATION",
  "STORAGE",
  "LEASE_EXPIRED",
  "CANCELED",
  "UNKNOWN",
]);

export const GenerationCandidateStatusSchema = z.enum(["pending", "applied", "rejected"]);

export const GenerationStepDescriptorSchema = z
  .object({
    stepKey: z.string().min(1),
    stage: GenerationStageSchema.exclude(["ready"]),
    subjectId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0),
    request: JsonValueSchema.optional(),
  })
  .strict();

export const GenerationRunSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionId: z.string().min(1),
    stage: GenerationStageSchema,
    status: GenerationRunStatusSchema,
    progressCurrent: z.number().int().min(0),
    progressTotal: z.number().int().min(0),
    model: z.string().min(1).nullable(),
    budget: GenerationBudgetSchema.optional(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    retryCount: z.number().int().min(0),
    lastErrorCode: GenerationErrorCodeSchema.nullable(),
    lastErrorMessage: z.string().min(1).nullable(),
    leaseExpiresAt: z.string().min(1).nullable(),
    startedAt: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    completedAt: z.string().min(1).nullable(),
  })
  .strict();

export const GenerationStepSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    stepKey: z.string().min(1),
    stage: GenerationStageSchema.exclude(["ready"]),
    subjectId: z.string().min(1).nullable(),
    status: GenerationStepStatusSchema,
    attempt: z.number().int().min(0),
    sortOrder: z.number().int().min(0),
    leaseExpiresAt: z.string().min(1).nullable(),
    nextAttemptAt: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    requestJson: JsonValueSchema,
    rawResponse: z.string().nullable(),
    parsedResponseJson: JsonValueSchema.nullable(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    errorCode: GenerationErrorCodeSchema.nullable(),
    errorMessage: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    completedAt: z.string().min(1).nullable(),
  })
  .strict();

export const GenerationCandidateSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionId: z.string().min(1),
    runId: z.string().min(1).nullable(),
    stepId: z.string().min(1).nullable(),
    nodeId: z.string().min(1),
    baseContentRevision: z.number().int().min(0),
    status: GenerationCandidateStatusSchema,
    candidateBody: z.string().min(1),
    model: z.string().min(1).nullable(),
    rawResponse: z.string().nullable(),
    createdAt: z.string().min(1),
    appliedAt: z.string().min(1).nullable(),
    rejectedAt: z.string().min(1).nullable(),
  })
  .strict();

export type GenerationStage = z.infer<typeof GenerationStageSchema>;
export type GenerationRunStatus = z.infer<typeof GenerationRunStatusSchema>;
export type GenerationStepStatus = z.infer<typeof GenerationStepStatusSchema>;
export type GenerationErrorCode = z.infer<typeof GenerationErrorCodeSchema>;
export type GenerationCandidateStatus = z.infer<typeof GenerationCandidateStatusSchema>;
export type GenerationStepDescriptor = z.infer<typeof GenerationStepDescriptorSchema>;
export type GenerationRun = z.infer<typeof GenerationRunSchema>;
export type GenerationStep = z.infer<typeof GenerationStepSchema>;
export type GenerationCandidate = z.infer<typeof GenerationCandidateSchema>;
