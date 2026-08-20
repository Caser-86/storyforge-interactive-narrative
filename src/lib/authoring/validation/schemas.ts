import { z } from "zod";
import { JsonValueSchema } from "../schemas";

export const ValidationSourceSchema = z.enum(["structural", "rule", "ai_review"]);
export const ValidationSeveritySchema = z.enum(["blocking", "warning"]);
export const ValidationIssueStatusSchema = z.enum(["open", "resolved", "dismissed"]);
export const ValidationRunStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

export const ValidationIssueRecordSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionId: z.string().min(1),
    runId: z.string().min(1).nullable(),
    draftRevision: z.number().int().min(0),
    source: ValidationSourceSchema,
    severity: ValidationSeveritySchema,
    code: z.string().min(1),
    message: z.string().min(1),
    nodeId: z.string().min(1).nullable(),
    edgeId: z.string().min(1).nullable(),
    detailsJson: JsonValueSchema,
    fingerprint: z.string().min(1),
    status: ValidationIssueStatusSchema,
    createdAt: z.string().min(1),
    resolvedAt: z.string().min(1).nullable(),
  })
  .strict();

export const ValidationRunSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionId: z.string().min(1),
    draftRevision: z.number().int().min(0),
    sources: z.array(ValidationSourceSchema),
    status: ValidationRunStatusSchema,
    errorMessage: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    completedAt: z.string().min(1).nullable(),
  })
  .strict();

export const ValidationIssueInputSchema = z
  .object({
    source: ValidationSourceSchema,
    severity: ValidationSeveritySchema,
    code: z.string().min(1),
    message: z.string().min(1),
    nodeId: z.string().min(1).nullable().optional(),
    edgeId: z.string().min(1).nullable().optional(),
    detailsJson: JsonValueSchema.optional(),
  })
  .strict();

export type ValidationSource = z.infer<typeof ValidationSourceSchema>;
export type ValidationSeverity = z.infer<typeof ValidationSeveritySchema>;
export type ValidationIssueStatus = z.infer<typeof ValidationIssueStatusSchema>;
export type ValidationRunStatus = z.infer<typeof ValidationRunStatusSchema>;
export type ValidationIssueRecord = z.infer<typeof ValidationIssueRecordSchema>;
export type ValidationRun = z.infer<typeof ValidationRunSchema>;
export type ValidationIssueInput = z.infer<typeof ValidationIssueInputSchema>;
