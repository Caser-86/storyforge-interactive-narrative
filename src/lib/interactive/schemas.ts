import { z } from "zod";
import { StoryMemorySchema } from "./story-memory";

export const InteractiveChoiceSchema = z
  .object({
    id: z.string().regex(/^choice_[a-z0-9_-]+$/),
    label: z.string().min(2).max(100),
    intent: z.string().min(4).max(180),
    risk: z.enum(["low", "medium", "high"]),
    consequencePreview: z.string().min(4).max(180),
  })
  .strict();

const InteractiveSceneFieldsSchema = z
  .object({
    title: z.string().min(2).max(80),
    body: z.string().min(1).max(1800),
    summary: z.string().min(2).max(300),
    choices: z.array(InteractiveChoiceSchema).max(3),
    isEnding: z.boolean(),
    endingSummary: z.string().trim().min(1).max(300).nullable(),
  })
  .strict();

export const InteractiveContinuitySchema = z
  .object({
    location: z.string().trim().min(1).max(120),
    time: z.string().trim().min(1).max(120),
    activeCharacters: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
    sceneGoal: z.string().trim().min(1).max(240),
  })
  .strict();

function validateEndingSemantics(scene: z.infer<typeof InteractiveSceneFieldsSchema>, context: z.RefinementCtx): void {
  if (scene.isEnding && scene.choices.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["choices"], message: "An ending scene cannot offer choices." });
  }
  if (scene.isEnding && !scene.endingSummary) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endingSummary"], message: "An ending scene must include a summary." });
  }
}

export const InteractiveSceneSchema = InteractiveSceneFieldsSchema.superRefine((scene, context) => {
    if (!scene.isEnding && scene.choices.length < 2) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["choices"], message: "An active scene must offer at least two choices." });
    }
    validateEndingSemantics(scene, context);
  });

// Old sessions may contain an active scene saved before the three-choice contract.
// Reads stay compatible so the UI can preserve the record and offer a new session.
export const InteractiveSceneReadSchema = InteractiveSceneFieldsSchema.superRefine(validateEndingSemantics);

export const InteractiveStateSchema = z
  .object({
    seedPrompt: z.string().min(1),
    turn: z.number().int().min(1),
    targetTurns: z.number().int().min(2).max(40),
    knownFacts: z.array(z.string().min(1)).max(20),
    openThreads: z.array(z.string().min(1)).max(10),
    resolvedThreads: z.array(z.string().min(1)).max(20),
    lastChoiceImpact: z.string(),
    endingReadiness: z.number().min(0).max(100),
    continuity: InteractiveContinuitySchema.optional(),
    memory: StoryMemorySchema.optional(),
  })
  .strict();

export const InteractiveSessionStatusSchema = z.enum(["generating", "active", "ended", "failed"]);

export const InteractiveSessionBudgetSchema = z
  .object({
    limit: z.number().int().positive().nullable(),
    reserved: z.number().int().min(0),
    consumed: z.number().int().min(0),
    unknown: z.number().int().min(0),
  })
  .strict();

export const InteractiveGenerationStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "canceled"]);
export const InteractiveGenerationProgressSchema = z
  .object({
    kind: z.enum(["opening", "next"]),
    status: InteractiveGenerationStatusSchema,
    attempt: z.number().int().min(0),
    maxAttempts: z.number().int().positive(),
    deadlineAt: z.string().min(1),
    startedAt: z.string().min(1).nullable(),
    updatedAt: z.string().min(1),
    lastError: z.string().min(1).nullable(),
  })
  .strict();

export const InteractiveSessionSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    status: InteractiveSessionStatusSchema,
    turn: z.number().int().min(0),
    targetTurns: z.number().int().min(2).max(40),
    state: InteractiveStateSchema,
    scene: InteractiveSceneReadSchema.nullable(),
    lastError: z.string().min(1).nullable(),
    materializedVersionId: z.string().min(1).nullable(),
    budget: InteractiveSessionBudgetSchema.optional(),
    generation: InteractiveGenerationProgressSchema.optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const InteractiveSessionSummarySchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    status: InteractiveSessionStatusSchema,
    turn: z.number().int().min(0),
    targetTurns: z.number().int().min(2).max(40),
    lastError: z.string().min(1).nullable(),
    materializedVersionId: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type InteractiveChoice = z.infer<typeof InteractiveChoiceSchema>;
export type InteractiveContinuity = z.infer<typeof InteractiveContinuitySchema>;
export type InteractiveScene = z.infer<typeof InteractiveSceneSchema>;

export const InteractiveTurnRecordSchema = z
  .object({
    turn: z.number().int().min(1),
    scene: InteractiveSceneReadSchema,
    selectedChoiceId: z.string().min(1).nullable(),
    selectedChoiceLabel: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
  })
  .strict();

export type InteractiveTurnRecord = z.infer<typeof InteractiveTurnRecordSchema>;
export type InteractiveState = z.infer<typeof InteractiveStateSchema>;
export type InteractiveSessionStatus = z.infer<typeof InteractiveSessionStatusSchema>;
export type InteractiveSessionBudget = z.infer<typeof InteractiveSessionBudgetSchema>;
export type InteractiveSession = z.infer<typeof InteractiveSessionSchema>;
export type InteractiveSessionSummary = z.infer<typeof InteractiveSessionSummarySchema>;
