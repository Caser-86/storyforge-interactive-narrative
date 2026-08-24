import { z } from "zod";
import type { GenerationStepDescriptor } from "../schemas";
import type { ProviderResult } from "../provider";

export const BriefOutputSchema = z
  .object({
    title: z.string().min(1),
    premise: z.string().min(1),
    promise: z.string().min(1),
    genre: z.string().min(1),
    tone: z.string().min(1),
    audience: z.string().min(1),
  })
  .strict();

export const BibleCharacterSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.string().min(1),
    traits: z.array(z.string().min(1)).min(1),
    goal: z.string().min(1),
    secret: z.string().min(1),
  })
  .strict();

export const BibleOutputSchema = z
  .object({
    worldRules: z.array(z.string().min(1)).min(1),
    themes: z.array(z.string().min(1)).min(1),
    characters: z.array(BibleCharacterSchema).min(1),
    canonFacts: z.array(z.string().min(1)).min(1),
    forbiddenChanges: z.array(z.string().min(1)),
  })
  .strict();

export const OutlineChapterSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    goal: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export const OutlineNodePlanSchema = z
  .object({
    id: z.string().min(1),
    chapterId: z.string().min(1),
    kind: z.enum(["start", "scene", "ending"]),
    title: z.string().min(1),
    objective: z.string().min(1),
  })
  .strict();

export const OutlineOutputSchema = z
  .object({
    chapters: z.array(OutlineChapterSchema).min(1),
    nodes: z.array(OutlineNodePlanSchema).min(1),
  })
  .strict();

export const GraphNodeSchema = OutlineNodePlanSchema.extend({
  summary: z.string().min(1),
  topologicalRank: z.number().int().min(0),
});

export const GraphEdgeSchema = z
  .object({
    id: z.string().min(1),
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    label: z.string().min(1),
    intent: z.string().min(1),
    consequenceSummary: z.string().min(1),
    branchType: z.enum(["main", "side"]),
    sortOrder: z.number().int().min(0),
  })
  .strict();

export const GraphOutputSchema = z
  .object({
    chapters: z.array(OutlineChapterSchema).min(1),
    nodes: z.array(GraphNodeSchema).min(1),
    edges: z.array(GraphEdgeSchema),
  })
  .strict();

export type BriefOutput = z.infer<typeof BriefOutputSchema>;
export type BibleOutput = z.infer<typeof BibleOutputSchema>;
export type OutlineOutput = z.infer<typeof OutlineOutputSchema>;
export type GraphOutput = z.infer<typeof GraphOutputSchema>;

export interface StageExecutionResult<T> {
  output: T;
  nextSteps: GenerationStepDescriptor[];
  providerResult: ProviderResult<T>;
}
