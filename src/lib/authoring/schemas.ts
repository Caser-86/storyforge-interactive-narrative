import { z } from "zod";

const projectSizePresets = ["micro", "short", "medium", "custom"] as const;
const storyNodeKinds = ["start", "scene", "ending"] as const;
const versionKinds = ["draft", "snapshot"] as const;

export type ProjectSizePreset = (typeof projectSizePresets)[number];
export type StoryNodeKind = (typeof storyNodeKinds)[number];
export type VersionKind = (typeof versionKinds)[number];

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

export const ProjectSizePresetSchema = z.enum(projectSizePresets);
export const StoryNodeKindSchema = z.enum(storyNodeKinds);
export const VersionKindSchema = z.enum(versionKinds);

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]),
);

export const ProjectSizeSchema = z
  .object({
    preset: ProjectSizePresetSchema,
    targetNodes: z.number().int().min(8).max(80),
    targetEndings: z.number().int().min(2).max(10),
  })
  .strict();

export const StoryVersionSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionNumber: z.number().int().min(1),
    kind: VersionKindSchema,
    sourceVersionId: z.string().min(1).nullable(),
    status: z.enum(["planning", "generating", "review_required", "valid", "invalid"]),
    briefJson: JsonValueSchema,
    storyBibleJson: JsonValueSchema,
    outlineJson: JsonValueSchema,
    canonJson: JsonValueSchema,
    createdAt: z.string().min(1),
    sealedAt: z.string().min(1).nullable(),
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
    kind: StoryNodeKindSchema,
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

export const StoryNodePatchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    body: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1).optional(),
    objective: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "At least one node field is required." });

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
    sizePreset: ProjectSizePresetSchema,
    targetNodeCount: z.number().int().min(8).max(80),
    targetEndingCount: z.number().int().min(2).max(10),
    status: z.enum(["draft", "generating", "ready", "archived"]),
    activeDraftVersionId: z.string().min(1).nullable(),
    settingsJson: JsonValueSchema,
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
    nodeId: z.string().min(1).nullable(),
    edgeId: z.string().min(1).nullable(),
    detailsJson: JsonValueSchema,
    status: z.enum(["open", "resolved", "dismissed"]),
    createdAt: z.string().min(1),
    resolvedAt: z.string().min(1).nullable(),
  })
  .strict();

export type ProjectSize = z.infer<typeof ProjectSizeSchema>;
export type StoryVersion = z.infer<typeof StoryVersionSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type StoryNode = z.infer<typeof StoryNodeSchema>;
export type StoryNodePatch = z.infer<typeof StoryNodePatchSchema>;
export type StoryEdge = z.infer<typeof StoryEdgeSchema>;
export type StoryGraph = z.infer<typeof StoryGraphSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
