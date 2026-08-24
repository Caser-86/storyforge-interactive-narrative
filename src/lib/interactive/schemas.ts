import { z } from "zod";

export const InteractiveChoiceSchema = z
  .object({
    id: z.string().regex(/^choice_[a-z0-9_-]+$/),
    label: z.string().min(2).max(100),
    intent: z.string().min(4).max(180),
    risk: z.enum(["low", "medium", "high"]),
    consequencePreview: z.string().min(4).max(180),
  })
  .strict();

export const InteractiveSceneSchema = z
  .object({
    title: z.string().min(2).max(80),
    body: z.string().min(1).max(1800),
    summary: z.string().min(2).max(300),
    choices: z.array(InteractiveChoiceSchema).max(3),
    isEnding: z.boolean(),
    endingSummary: z.string().max(300).nullable(),
  })
  .strict()
  .superRefine((scene, context) => {
    if (!scene.isEnding && scene.choices.length < 2) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["choices"], message: "An active scene must offer at least two choices." });
    }
    if (scene.isEnding && scene.choices.length > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["choices"], message: "An ending scene cannot offer choices." });
    }
  });

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
  })
  .strict();

export const InteractiveSessionStatusSchema = z.enum(["generating", "active", "ended", "failed"]);

export const InteractiveSessionSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    status: InteractiveSessionStatusSchema,
    turn: z.number().int().min(0),
    targetTurns: z.number().int().min(2).max(40),
    state: InteractiveStateSchema,
    scene: InteractiveSceneSchema.nullable(),
    materializedVersionId: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type InteractiveChoice = z.infer<typeof InteractiveChoiceSchema>;
export type InteractiveScene = z.infer<typeof InteractiveSceneSchema>;

export const InteractiveTurnRecordSchema = z
  .object({
    turn: z.number().int().min(1),
    scene: InteractiveSceneSchema,
    selectedChoiceId: z.string().min(1).nullable(),
    selectedChoiceLabel: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
  })
  .strict();

export type InteractiveTurnRecord = z.infer<typeof InteractiveTurnRecordSchema>;
export type InteractiveState = z.infer<typeof InteractiveStateSchema>;
export type InteractiveSessionStatus = z.infer<typeof InteractiveSessionStatusSchema>;
export type InteractiveSession = z.infer<typeof InteractiveSessionSchema>;
