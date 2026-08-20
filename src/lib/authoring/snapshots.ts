import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { z } from "zod";
import { initializeAuthoringDatabase } from "./database";
import { AuthoringError } from "./errors";
import { RELEASE_GRAPH_LIMITS, validateStoryGraph } from "./graph";
import type { GraphLimits } from "./graph";
import {
  ChapterSchema,
  ProjectSchema,
  StoryEdgeSchema,
  StoryGraphSchema,
  StoryNodeSchema,
  StoryVersionSchema,
} from "./schemas";
import type { Chapter, Project, StoryEdge, StoryGraph, StoryNode, StoryVersion } from "./schemas";
import {
  ReaderStoryGraphSchema,
  StoryRuntimeStateSchema,
  createRuntime,
} from "./runtime";
import type { ReaderStoryGraph, StoryRuntimeState } from "./runtime";

type ProjectRow = {
  id: string;
  title: string;
  premise: string;
  genre: string;
  tone: string;
  point_of_view: string;
  rating: string;
  size_preset: Project["sizePreset"];
  target_node_count: number;
  target_ending_count: number;
  status: Project["status"];
  active_draft_version_id: string | null;
  settings_json: string;
  created_at: string;
  updated_at: string;
};

type StoryVersionRow = {
  id: string;
  project_id: string;
  version_number: number;
  kind: StoryVersion["kind"];
  source_version_id: string | null;
  status: StoryVersion["status"];
  brief_json: string;
  story_bible_json: string;
  outline_json: string;
  canon_json: string;
  draft_revision: number;
  created_at: string;
  sealed_at: string | null;
  validation_limits_json: string;
};

type ChapterRow = {
  id: string;
  version_id: string;
  ordinal: number;
  title: string;
  goal: string;
  summary: string;
  created_at: string;
  updated_at: string;
};

type StoryNodeRow = {
  id: string;
  version_id: string;
  chapter_id: string;
  node_key: string;
  kind: StoryNode["kind"];
  title: string;
  body: string;
  summary: string;
  objective: string;
  topological_rank: number;
  content_status: StoryNode["contentStatus"];
  author_modified: number;
  content_revision: number;
  created_at: string;
  updated_at: string;
};

type StoryEdgeRow = {
  id: string;
  version_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string;
  intent: string;
  consequence_summary: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const SnapshotResponseSchema = z
  .object({
    snapshot: StoryVersionSchema,
  })
  .strict();

export const ListSnapshotsResponseSchema = z
  .object({
    snapshots: z.array(StoryVersionSchema),
  })
  .strict();

export const PreviewRequestSchema = z
  .object({
    snapshotId: z.string().trim().min(1).optional(),
    versionId: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((input) => (input.snapshotId === undefined) !== (input.versionId === undefined), {
    message: "Provide exactly one of snapshotId or versionId.",
  });

export const PreviewSnapshotSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionNumber: z.number().int().min(1),
    createdAt: z.string().min(1),
    sealedAt: z.string().min(1),
  })
  .strict();

export const PreviewResponseSchema = z
  .object({
    snapshot: PreviewSnapshotSchema,
    graph: ReaderStoryGraphSchema,
    runtime: StoryRuntimeStateSchema,
  })
  .strict();

export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;
export type PreviewSnapshot = z.infer<typeof PreviewSnapshotSchema>;
export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(text: string) {
  return JSON.parse(text) as unknown;
}

const StoredGraphLimitsSchema = z
  .object({
    minNodes: z.number().int().min(0),
    minEndings: z.number().int().min(0),
    maxNodes: z.number().int().min(1),
    maxEndings: z.number().int().min(1),
  })
  .strict();

function parseStoredGraphLimits(text: string): GraphLimits {
  try {
    return StoredGraphLimitsSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new AuthoringError("STORAGE", "Snapshot validation limits are invalid", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function storageError(error: unknown, message: string): AuthoringError {
  if (error instanceof AuthoringError) {
    return error;
  }

  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return error as AuthoringError;
  }

  return new AuthoringError("STORAGE", message, {
    cause: error instanceof Error ? error.message : String(error),
  });
}

function toProject(row: ProjectRow): Project {
  return ProjectSchema.parse({
    id: row.id,
    title: row.title,
    premise: row.premise,
    genre: row.genre,
    tone: row.tone,
    pointOfView: row.point_of_view,
    rating: row.rating,
    sizePreset: row.size_preset,
    targetNodeCount: row.target_node_count,
    targetEndingCount: row.target_ending_count,
    status: row.status,
    activeDraftVersionId: row.active_draft_version_id,
    settingsJson: parseJson(row.settings_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toStoryVersion(row: StoryVersionRow): StoryVersion {
  return StoryVersionSchema.parse({
    id: row.id,
    projectId: row.project_id,
    versionNumber: row.version_number,
    kind: row.kind,
    sourceVersionId: row.source_version_id,
    status: row.status,
    briefJson: parseJson(row.brief_json),
    storyBibleJson: parseJson(row.story_bible_json),
    outlineJson: parseJson(row.outline_json),
    canonJson: parseJson(row.canon_json),
    createdAt: row.created_at,
    sealedAt: row.sealed_at,
  });
}

function toChapter(row: ChapterRow): Chapter {
  return ChapterSchema.parse({
    id: row.id,
    versionId: row.version_id,
    ordinal: row.ordinal,
    title: row.title,
    goal: row.goal,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toStoryNode(row: StoryNodeRow): StoryNode {
  return StoryNodeSchema.parse({
    id: row.id,
    versionId: row.version_id,
    chapterId: row.chapter_id,
    nodeKey: row.node_key,
    kind: row.kind,
    title: row.title,
    body: row.body,
    summary: row.summary,
    objective: row.objective,
    topologicalRank: row.topological_rank,
    contentStatus: row.content_status,
    authorModified: row.author_modified === 1,
    contentRevision: row.content_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toStoryEdge(row: StoryEdgeRow): StoryEdge {
  return StoryEdgeSchema.parse({
    id: row.id,
    versionId: row.version_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    label: row.label,
    intent: row.intent,
    consequenceSummary: row.consequence_summary,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function requireProject(db: Database.Database, projectId: string): Project {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
  if (row === undefined) {
    throw new AuthoringError("NOT_FOUND", "Project not found", { projectId });
  }

  return toProject(row);
}

function requireVersionRow(db: Database.Database, projectId: string, versionId: string): StoryVersionRow {
  const row = db
    .prepare("SELECT * FROM story_versions WHERE project_id = ? AND id = ?")
    .get(projectId, versionId) as StoryVersionRow | undefined;

  if (row === undefined) {
    throw new AuthoringError("NOT_FOUND", "Story version not found", { projectId, versionId });
  }

  return row;
}

function nextVersionNumber(db: Database.Database, projectId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number FROM story_versions WHERE project_id = ?")
    .get(projectId) as { next_version_number: number };

  return row.next_version_number;
}

function readGraphByVersionId(db: Database.Database, versionId: string): StoryGraph {
  const chapters = db
    .prepare("SELECT * FROM chapters WHERE version_id = ? ORDER BY ordinal ASC, id ASC")
    .all(versionId) as ChapterRow[];
  const nodes = db
    .prepare("SELECT * FROM story_nodes WHERE version_id = ? ORDER BY topological_rank ASC, id ASC")
    .all(versionId) as StoryNodeRow[];
  const edges = db
    .prepare("SELECT * FROM story_edges WHERE version_id = ? ORDER BY sort_order ASC, id ASC")
    .all(versionId) as StoryEdgeRow[];

  return StoryGraphSchema.parse({
    versionId,
    chapters: chapters.map(toChapter),
    nodes: nodes.map(toStoryNode),
    edges: edges.map(toStoryEdge),
  });
}

function insertVersionCopy(
  db: Database.Database,
  projectId: string,
  sourceVersion: StoryVersionRow,
  kind: StoryVersion["kind"],
  sourceVersionId: string,
  status: StoryVersion["status"],
  sealedAt: string | null,
  validationLimitsJson = sourceVersion.validation_limits_json,
): StoryVersionRow {
  const versionId = randomUUID();
  const createdAt = nowIso();

  db.prepare(
    `
      INSERT INTO story_versions (
        id, project_id, version_number, kind, source_version_id, status,
        brief_json, story_bible_json, outline_json, canon_json, draft_revision,
        created_at, sealed_at, validation_limits_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `,
  ).run(
    versionId,
    projectId,
    nextVersionNumber(db, projectId),
    kind,
    sourceVersionId,
    status,
    sourceVersion.brief_json,
    sourceVersion.story_bible_json,
    sourceVersion.outline_json,
    sourceVersion.canon_json,
    createdAt,
    sealedAt,
    validationLimitsJson,
  );

  return requireVersionRow(db, projectId, versionId);
}

function copyGraphRows(db: Database.Database, sourceVersionId: string, targetVersionId: string): void {
  const sourceGraph = readGraphByVersionId(db, sourceVersionId);
  const chapterIdMap = new Map<string, string>();
  const nodeIdMap = new Map<string, string>();
  const copiedGraph: StoryGraph = {
    versionId: targetVersionId,
    chapters: sourceGraph.chapters.map((chapter) => {
      const copiedId = randomUUID();
      chapterIdMap.set(chapter.id, copiedId);

      return {
        ...chapter,
        id: copiedId,
        versionId: targetVersionId,
      };
    }),
    nodes: sourceGraph.nodes.map((node) => {
      const copiedId = randomUUID();
      const chapterId = chapterIdMap.get(node.chapterId);
      if (chapterId === undefined) {
        throw new AuthoringError("STORAGE", "Source graph has a node without a copied chapter", {
          nodeId: node.id,
        });
      }

      nodeIdMap.set(node.id, copiedId);

      return {
        ...node,
        id: copiedId,
        versionId: targetVersionId,
        chapterId,
      };
    }),
    edges: sourceGraph.edges.map((edge) => {
      const sourceNodeId = nodeIdMap.get(edge.sourceNodeId);
      const targetNodeId = nodeIdMap.get(edge.targetNodeId);
      if (sourceNodeId === undefined || targetNodeId === undefined) {
        throw new AuthoringError("STORAGE", "Source graph has an edge without copied endpoint nodes", {
          edgeId: edge.id,
        });
      }

      return {
        ...edge,
        id: randomUUID(),
        versionId: targetVersionId,
        sourceNodeId,
        targetNodeId,
      };
    }),
  };

  insertGraphRows(db, copiedGraph);
}

function insertGraphRows(db: Database.Database, graph: StoryGraph): void {
  const insertChapter = db.prepare(`
    INSERT INTO chapters (id, version_id, ordinal, title, goal, summary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertNode = db.prepare(`
    INSERT INTO story_nodes (
      id, version_id, chapter_id, node_key, kind, title, body, summary, objective,
      topological_rank, content_status, author_modified, content_revision, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEdge = db.prepare(`
    INSERT INTO story_edges (
      id, version_id, source_node_id, target_node_id, label, intent,
      consequence_summary, sort_order, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const chapter of graph.chapters) {
    insertChapter.run(
      chapter.id,
      graph.versionId,
      chapter.ordinal,
      chapter.title,
      chapter.goal,
      chapter.summary,
      chapter.createdAt,
      chapter.updatedAt,
    );
  }

  for (const node of graph.nodes) {
    insertNode.run(
      node.id,
      graph.versionId,
      node.chapterId,
      node.nodeKey,
      node.kind,
      node.title,
      node.body,
      node.summary,
      node.objective,
      node.topologicalRank,
      node.contentStatus,
      node.authorModified ? 1 : 0,
      node.contentRevision,
      node.createdAt,
      node.updatedAt,
    );
  }

  for (const edge of graph.edges) {
    insertEdge.run(
      edge.id,
      graph.versionId,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.label,
      edge.intent,
      edge.consequenceSummary,
      edge.sortOrder,
      edge.createdAt,
      edge.updatedAt,
    );
  }
}

export function toReaderStoryGraph(graph: StoryGraph): ReaderStoryGraph {
  return ReaderStoryGraphSchema.parse({
    versionId: graph.versionId,
    chapters: graph.chapters.map((chapter) => ({
      id: chapter.id,
      ordinal: chapter.ordinal,
      title: chapter.title,
      summary: chapter.summary,
    })),
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      chapterId: node.chapterId,
      nodeKey: node.nodeKey,
      kind: node.kind,
      title: node.title,
      body: node.body,
      summary: node.summary,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      sortOrder: edge.sortOrder,
    })),
  });
}

export function sealSnapshotInDatabase(db: Database.Database, projectId: string): StoryVersion {
  const seal = db.transaction(() => {
    const project = requireProject(db, projectId);
    if (project.activeDraftVersionId === null) {
      throw new AuthoringError("NOT_FOUND", "Active draft version not found", { projectId });
    }

    const draft = requireVersionRow(db, projectId, project.activeDraftVersionId);
    if (draft.kind !== "draft") {
      throw new AuthoringError("IMMUTABLE_VERSION", "Active version is not a mutable draft", {
        versionId: draft.id,
      });
    }

    const draftGraph = readGraphByVersionId(db, draft.id);
    const validationLimits: GraphLimits = {
      ...RELEASE_GRAPH_LIMITS,
      maxNodes: project.targetNodeCount,
      maxEndings: project.targetEndingCount,
    };
    const issues = validateStoryGraph(draftGraph, validationLimits);
    const blockingIssues = issues.filter((issue) => issue.severity === "blocking");

    if (blockingIssues.length > 0) {
      throw new AuthoringError("BLOCKING_ISSUES", "Cannot seal a snapshot while blocking graph issues remain", {
        issues: blockingIssues,
      });
    }

    const snapshot = insertVersionCopy(
      db,
      projectId,
      draft,
      "snapshot",
      draft.id,
      "valid",
      nowIso(),
      JSON.stringify(validationLimits),
    );
    copyGraphRows(db, draft.id, snapshot.id);

    return toStoryVersion(snapshot);
  });

  return seal();
}

export async function sealSnapshot(projectId: string): Promise<StoryVersion> {
  const db = initializeAuthoringDatabase();

  try {
    const draft = db
      .prepare("SELECT draft_revision FROM story_versions WHERE id = (SELECT active_draft_version_id FROM projects WHERE id = ?)")
      .get(projectId) as { draft_revision: number } | undefined;
    if (!draft) {
      throw new AuthoringError("NOT_FOUND", "Active draft version not found", { projectId });
    }
    const { assertReleaseReady } = await import("./release-gate");
    await assertReleaseReady(projectId, draft.draft_revision);
    return sealSnapshotInDatabase(db, projectId);
  } catch (error) {
    throw storageError(error, "Failed to seal authoring snapshot");
  } finally {
    db.close();
  }
}

export async function restoreSnapshot(projectId: string, snapshotId: string): Promise<StoryVersion> {
  const db = initializeAuthoringDatabase();

  try {
    const restore = db.transaction(() => {
      requireProject(db, projectId);
      const snapshot = requireVersionRow(db, projectId, snapshotId);
      if (snapshot.kind !== "snapshot") {
        throw new AuthoringError("VALIDATION", "Only sealed snapshots can be restored", {
          projectId,
          snapshotId,
        });
      }

      const draft = insertVersionCopy(db, projectId, snapshot, "draft", snapshot.id, snapshot.status, null);
      copyGraphRows(db, snapshot.id, draft.id);
      db.prepare("UPDATE projects SET active_draft_version_id = ?, updated_at = ? WHERE id = ?").run(
        draft.id,
        nowIso(),
        projectId,
      );

      return toStoryVersion(draft);
    });

    return restore();
  } catch (error) {
    throw storageError(error, "Failed to restore authoring snapshot");
  } finally {
    db.close();
  }
}

export async function listSnapshots(projectId: string): Promise<StoryVersion[]> {
  const db = initializeAuthoringDatabase();

  try {
    requireProject(db, projectId);
    const rows = db
      .prepare(
        `
          SELECT *
          FROM story_versions
          WHERE project_id = ? AND kind = 'snapshot'
          ORDER BY version_number ASC, created_at ASC
        `,
      )
      .all(projectId) as StoryVersionRow[];

    return rows.map(toStoryVersion);
  } catch (error) {
    throw storageError(error, "Failed to list authoring snapshots");
  } finally {
    db.close();
  }
}

export async function readPreview(projectId: string, versionId: string): Promise<PreviewResponse> {
  const db = initializeAuthoringDatabase();

  try {
    requireProject(db, projectId);
    const version = toStoryVersion(requireVersionRow(db, projectId, versionId));
    if (version.kind !== "snapshot" || version.sealedAt === null || version.status !== "valid") {
      throw new AuthoringError("VALIDATION", "Preview requires a valid sealed snapshot", {
        projectId,
        versionId,
      });
    }

    const versionRow = requireVersionRow(db, projectId, versionId);
    const graph = readGraphByVersionId(db, version.id);
    const issues = validateStoryGraph(graph, parseStoredGraphLimits(versionRow.validation_limits_json));
    const blockingIssues = issues.filter((issue) => issue.severity === "blocking");
    if (blockingIssues.length > 0) {
      throw new AuthoringError("BLOCKING_ISSUES", "Snapshot graph has blocking issues", {
        issues: blockingIssues,
      });
    }

    const readerGraph = toReaderStoryGraph(graph);
    const runtime: StoryRuntimeState = createRuntime(readerGraph);

    return PreviewResponseSchema.parse({
      snapshot: {
        id: version.id,
        projectId: version.projectId,
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        sealedAt: version.sealedAt,
      },
      graph: readerGraph,
      runtime,
    });
  } catch (error) {
    throw storageError(error, "Failed to read authoring preview");
  } finally {
    db.close();
  }
}
