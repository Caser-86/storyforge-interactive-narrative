import { z } from "zod";

export const ProjectSizeSchema = z
  .object({
    preset: z.enum(["micro", "short", "medium", "custom"]),
    targetNodes: z.number().int().min(8).max(80),
    targetEndings: z.number().int().min(2).max(10),
  })
  .strict();

export const StoryVersionSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionNumber: z.number().int().min(1),
    kind: z.enum(["draft", "snapshot"]),
    sourceVersionId: z.string().min(1).nullable().optional(),
    status: z.enum(["planning", "generating", "review_required", "valid", "invalid"]),
    briefJson: z.record(z.string(), z.unknown()),
    storyBibleJson: z.record(z.string(), z.unknown()),
    outlineJson: z.record(z.string(), z.unknown()),
    canonJson: z.record(z.string(), z.unknown()),
    createdAt: z.string().min(1),
    sealedAt: z.string().min(1).nullable().optional(),
  })
  .strict();

export const ChapterSchema = z
  .object({
    id: z.string().min(1),
    versionId: z.string().min(1),
    ordinal: z.number().int().min(0),
    title: z.string().min(1),
    goal: z.string().min(1),
    summary: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const StoryNodeSchema = z
  .object({
    id: z.string().min(1),
    versionId: z.string().min(1),
    chapterId: z.string().min(1),
    nodeKey: z.string().min(1),
    kind: z.enum(["start", "scene", "ending"]),
    title: z.string().min(1),
    body: z.string().min(1),
    summary: z.string().min(1),
    objective: z.string().min(1),
    topologicalRank: z.number().int().min(0),
    contentStatus: z.enum(["planned", "generated", "author_edited", "review_required"]),
    authorModified: z.boolean(),
    contentRevision: z.number().int().min(0),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const StoryEdgeSchema = z
  .object({
    id: z.string().min(1),
    versionId: z.string().min(1),
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    label: z.string().min(1),
    intent: z.string().min(1),
    consequenceSummary: z.string().min(1),
    sortOrder: z.number().int().min(0),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const StoryGraphSchema = z
  .object({
    versionId: z.string().min(1),
    chapters: z.array(ChapterSchema),
    nodes: z.array(StoryNodeSchema),
    edges: z.array(StoryEdgeSchema),
  })
  .strict();

export const ProjectSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    premise: z.string().min(1),
    genre: z.string().min(1),
    tone: z.string().min(1),
    pointOfView: z.string().min(1),
    rating: z.string().min(1),
    sizePreset: z.enum(["micro", "short", "medium", "custom"]),
    targetNodeCount: z.number().int().min(8).max(80),
    targetEndingCount: z.number().int().min(2).max(10),
    status: z.enum(["draft", "generating", "ready", "archived"]),
    activeDraftVersionId: z.string().min(1).nullable(),
    settingsJson: z.record(z.string(), z.unknown()),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const ValidationIssueSchema = z
  .object({
    id: z.string().min(1),
    versionId: z.string().min(1),
    source: z.enum(["structural", "rule", "ai_review"]),
    severity: z.enum(["blocking", "warning"]),
    code: z.string().min(1),
    message: z.string().min(1),
    nodeId: z.string().min(1).nullable().optional(),
    edgeId: z.string().min(1).nullable().optional(),
    detailsJson: z.record(z.string(), z.unknown()),
    status: z.enum(["open", "resolved", "dismissed"]),
    createdAt: z.string().min(1),
    resolvedAt: z.string().min(1).nullable().optional(),
  })
  .strict();

export type ProjectSize = z.infer<typeof ProjectSizeSchema>;
export type StoryVersion = z.infer<typeof StoryVersionSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type StoryNode = z.infer<typeof StoryNodeSchema>;
export type StoryEdge = z.infer<typeof StoryEdgeSchema>;
export type StoryGraph = z.infer<typeof StoryGraphSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
