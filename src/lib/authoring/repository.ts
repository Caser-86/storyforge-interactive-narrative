import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { AuthoringError } from "./errors";
import { initializeAuthoringDatabase } from "./database";
import type { AuthoringDatabaseOptions } from "./database";
import { sealSnapshotInDatabase } from "./snapshots";
import { RELEASE_GRAPH_LIMITS, validateStoryGraph } from "./graph";
import type {
  Chapter,
  JsonValue,
  Project,
  ProjectSize,
  StoryEdge,
  StoryGraph,
  StoryNode,
  StoryVersion,
} from "./schemas";

export type ProjectStatus = Project["status"];

export interface CreateProjectInput {
  title: string;
  premise: string;
  genre: string;
  tone: string;
  pointOfView: string;
  rating: string;
  size: ProjectSize;
  settingsJson?: JsonValue;
}

export interface UpdateProjectInput {
  title?: string;
  premise?: string;
  genre?: string;
  tone?: string;
  pointOfView?: string;
  rating?: string;
  size?: ProjectSize;
  status?: ProjectStatus;
  settingsJson?: JsonValue;
}

export type ProjectSummary = Project & {
  draftRevision: number | null;
  versionCount: number;
  snapshotCount: number;
  blockingIssueCount: number;
};

export interface AuthoringRepository {
  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(projectId: string): Promise<Project>;
  listProjects(): Promise<ProjectSummary[]>;
  updateProject(projectId: string, input: UpdateProjectInput): Promise<Project>;
  getProjectGraph(projectId: string, versionId?: string): Promise<StoryGraph>;
  replaceDraftGraph(projectId: string, graph: StoryGraph, expectedRevision: number): Promise<StoryGraph>;
  createSnapshot(projectId: string): Promise<StoryVersion>;
  restoreSnapshot(projectId: string, snapshotId: string): Promise<StoryVersion>;
  duplicateProject(projectId: string): Promise<Project>;
  setProjectStatus(projectId: string, status: ProjectStatus): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  close(): void;
}

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
  status: ProjectStatus;
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

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(text: string): JsonValue {
  return JSON.parse(text) as JsonValue;
}

function stringifyJson(value: JsonValue | undefined, fallback: JsonValue): string {
  return JSON.stringify(value ?? fallback);
}

function storageError(error: unknown, message: string): AuthoringError {
  if (error instanceof AuthoringError) {
    return error;
  }

  return new AuthoringError("STORAGE", message, {
    cause: error instanceof Error ? error.message : String(error),
  });
}

function toProject(row: ProjectRow): Project {
  return {
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
  };
}

function toStoryVersion(row: StoryVersionRow): StoryVersion {
  return {
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
  };
}

function toChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    versionId: row.version_id,
    ordinal: row.ordinal,
    title: row.title,
    goal: row.goal,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStoryNode(row: StoryNodeRow): StoryNode {
  return {
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
  };
}

function toStoryEdge(row: StoryEdgeRow): StoryEdge {
  return {
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
  };
}

export class BetterSqliteAuthoringRepository implements AuthoringRepository {
  private readonly db: Database.Database;

  constructor(options: AuthoringDatabaseOptions = {}) {
    this.db = initializeAuthoringDatabase(options);
  }

  public async createProject(input: CreateProjectInput): Promise<Project> {
    try {
      const create = this.db.transaction(() => {
        const timestamp = nowIso();
        const projectId = randomUUID();
        const versionId = randomUUID();

        this.db
          .prepare(
            `
              INSERT INTO projects (
                id, title, premise, genre, tone, point_of_view, rating, size_preset,
                target_node_count, target_ending_count, status, active_draft_version_id,
                settings_json, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?)
            `,
          )
          .run(
            projectId,
            input.title,
            input.premise,
            input.genre,
            input.tone,
            input.pointOfView,
            input.rating,
            input.size.preset,
            input.size.targetNodes,
            input.size.targetEndings,
            stringifyJson(input.settingsJson, {}),
            timestamp,
            timestamp,
          );

        this.db
          .prepare(
            `
              INSERT INTO story_versions (
                id, project_id, version_number, kind, source_version_id, status,
                brief_json, story_bible_json, outline_json, canon_json, draft_revision,
                created_at, sealed_at
              )
              VALUES (?, ?, 1, 'draft', NULL, 'planning', ?, '{}', '{}', '{}', 0, ?, NULL)
            `,
          )
          .run(versionId, projectId, JSON.stringify(input), timestamp);

        this.db
          .prepare("UPDATE projects SET active_draft_version_id = ?, updated_at = ? WHERE id = ?")
          .run(versionId, timestamp, projectId);

        return this.requireProject(projectId);
      });

      return create();
    } catch (error) {
      throw storageError(error, "Failed to create authoring project");
    }
  }

  public async getProject(projectId: string): Promise<Project> {
    try {
      return this.requireProject(projectId);
    } catch (error) {
      throw storageError(error, "Failed to read authoring project");
    }
  }

  public async listProjects(): Promise<ProjectSummary[]> {
    try {
      const rows = this.db
        .prepare(
          `
            SELECT
              p.*,
              active.draft_revision AS draft_revision,
              COUNT(v.id) AS version_count,
              SUM(CASE WHEN v.kind = 'snapshot' THEN 1 ELSE 0 END) AS snapshot_count
            FROM projects p
            LEFT JOIN story_versions active ON active.id = p.active_draft_version_id
            LEFT JOIN story_versions v ON v.project_id = p.id
            GROUP BY p.id
            ORDER BY p.updated_at DESC, p.created_at DESC
          `,
        )
        .all() as (ProjectRow & { draft_revision: number | null; version_count: number; snapshot_count: number | null })[];

      return rows.map((row) => {
        const graph = this.readProjectGraph(row.id);
        const blockingIssueCount = validateStoryGraph(graph, RELEASE_GRAPH_LIMITS).filter(
          (issue) => issue.severity === "blocking",
        ).length;

        return {
          ...toProject(row),
          draftRevision: row.draft_revision,
          versionCount: row.version_count,
          snapshotCount: row.snapshot_count ?? 0,
          blockingIssueCount,
        };
      });
    } catch (error) {
      throw storageError(error, "Failed to list authoring projects");
    }
  }

  public async updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
    if (input.status !== undefined && !["draft", "generating", "ready", "archived"].includes(input.status)) {
      throw new AuthoringError("VALIDATION", "Invalid project status", { status: input.status });
    }

    try {
      const update = this.db.transaction(() => {
        const current = this.requireProject(projectId);
        const size = input.size ?? {
          preset: current.sizePreset,
          targetNodes: current.targetNodeCount,
          targetEndings: current.targetEndingCount,
        };

        this.db
          .prepare(
            `
              UPDATE projects
              SET
                title = ?,
                premise = ?,
                genre = ?,
                tone = ?,
                point_of_view = ?,
                rating = ?,
                size_preset = ?,
                target_node_count = ?,
                target_ending_count = ?,
                status = ?,
                settings_json = ?,
                updated_at = ?
              WHERE id = ?
            `,
          )
          .run(
            input.title ?? current.title,
            input.premise ?? current.premise,
            input.genre ?? current.genre,
            input.tone ?? current.tone,
            input.pointOfView ?? current.pointOfView,
            input.rating ?? current.rating,
            size.preset,
            size.targetNodes,
            size.targetEndings,
            input.status ?? current.status,
            stringifyJson(input.settingsJson, current.settingsJson),
            nowIso(),
            projectId,
          );

        return this.requireProject(projectId);
      });

      return update();
    } catch (error) {
      throw storageError(error, "Failed to update authoring project");
    }
  }

  public async getProjectGraph(projectId: string, versionId?: string): Promise<StoryGraph> {
    try {
      return this.readProjectGraph(projectId, versionId);
    } catch (error) {
      throw storageError(error, "Failed to read authoring project graph");
    }
  }

  public async replaceDraftGraph(projectId: string, graph: StoryGraph, expectedRevision: number): Promise<StoryGraph> {
    try {
      const replace = this.db.transaction(() => {
        const project = this.requireProject(projectId);
        const requestedVersion = this.findVersion(projectId, graph.versionId);

        if (requestedVersion?.kind === "snapshot") {
          throw new AuthoringError("IMMUTABLE_VERSION", "Cannot replace graph for an immutable snapshot", {
            versionId: graph.versionId,
          });
        }

        if (!project.activeDraftVersionId || graph.versionId !== project.activeDraftVersionId) {
          throw new AuthoringError("NOT_FOUND", "Draft version not found", { projectId, versionId: graph.versionId });
        }

        const draft = this.requireVersion(projectId, project.activeDraftVersionId);
        if (draft.draft_revision !== expectedRevision) {
          throw new AuthoringError("CONFLICT", "Draft revision is stale", {
            expectedRevision,
            actualRevision: draft.draft_revision,
          });
        }

        this.db
          .prepare("UPDATE story_versions SET draft_revision = draft_revision + 1 WHERE id = ? AND draft_revision = ?")
          .run(draft.id, expectedRevision);

        this.replaceVersionGraphRows(draft.id, graph);
        this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(nowIso(), projectId);

        return this.readProjectGraph(projectId, draft.id);
      });

      return replace();
    } catch (error) {
      throw storageError(error, "Failed to replace authoring draft graph");
    }
  }

  public async createSnapshot(projectId: string): Promise<StoryVersion> {
    try {
      return sealSnapshotInDatabase(this.db, projectId);
    } catch (error) {
      throw storageError(error, "Failed to create authoring snapshot");
    }
  }

  public async restoreSnapshot(projectId: string, snapshotId: string): Promise<StoryVersion> {
    try {
      const restore = this.db.transaction(() => {
        this.requireProject(projectId);
        const snapshot = this.requireVersion(projectId, snapshotId);
        if (snapshot.kind !== "snapshot") {
          throw new AuthoringError("IMMUTABLE_VERSION", "Only snapshot versions can be restored", {
            projectId,
            snapshotId,
          });
        }

        const newDraft = this.createVersionCopy(projectId, snapshot, "draft", snapshot.id, null);
        this.copyVersionGraph(snapshot.id, newDraft.id);

        this.db
          .prepare("UPDATE projects SET active_draft_version_id = ?, updated_at = ? WHERE id = ?")
          .run(newDraft.id, nowIso(), projectId);

        return newDraft;
      });

      return restore();
    } catch (error) {
      throw storageError(error, "Failed to restore authoring snapshot");
    }
  }

  public async duplicateProject(projectId: string): Promise<Project> {
    try {
      const duplicate = this.db.transaction(() => {
        const source = this.requireProject(projectId);
        if (!source.activeDraftVersionId) {
          throw new AuthoringError("NOT_FOUND", "Active draft version not found", { projectId });
        }

        const timestamp = nowIso();
        const copiedProjectId = randomUUID();
        const copiedVersionId = randomUUID();

        this.db
          .prepare(
            `
              INSERT INTO projects (
                id, title, premise, genre, tone, point_of_view, rating, size_preset,
                target_node_count, target_ending_count, status, active_draft_version_id,
                settings_json, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            copiedProjectId,
            `${source.title} Copy`,
            source.premise,
            source.genre,
            source.tone,
            source.pointOfView,
            source.rating,
            source.sizePreset,
            source.targetNodeCount,
            source.targetEndingCount,
            source.status,
            null,
            stringifyJson(source.settingsJson, {}),
            timestamp,
            timestamp,
          );

        const sourceDraft = this.requireVersion(projectId, source.activeDraftVersionId);
        this.db
          .prepare(
            `
              INSERT INTO story_versions (
                id, project_id, version_number, kind, source_version_id, status,
                brief_json, story_bible_json, outline_json, canon_json, draft_revision,
                created_at, sealed_at
              )
              VALUES (?, ?, 1, 'draft', NULL, ?, ?, ?, ?, ?, 0, ?, NULL)
            `,
          )
          .run(
            copiedVersionId,
            copiedProjectId,
            sourceDraft.status,
            sourceDraft.brief_json,
            sourceDraft.story_bible_json,
            sourceDraft.outline_json,
            sourceDraft.canon_json,
            timestamp,
          );

        this.db
          .prepare("UPDATE projects SET active_draft_version_id = ?, updated_at = ? WHERE id = ?")
          .run(copiedVersionId, timestamp, copiedProjectId);

        this.copyVersionGraph(source.activeDraftVersionId, copiedVersionId);

        return this.requireProject(copiedProjectId);
      });

      return duplicate();
    } catch (error) {
      throw storageError(error, "Failed to duplicate authoring project");
    }
  }

  public async setProjectStatus(projectId: string, status: ProjectStatus): Promise<Project> {
    if (!["draft", "generating", "ready", "archived"].includes(status)) {
      throw new AuthoringError("VALIDATION", "Invalid project status", { status });
    }

    try {
      const result = this.db
        .prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, nowIso(), projectId);

      if (result.changes === 0) {
        throw new AuthoringError("NOT_FOUND", "Project not found", { projectId });
      }

      return this.requireProject(projectId);
    } catch (error) {
      throw storageError(error, "Failed to update authoring project status");
    }
  }

  public async deleteProject(projectId: string): Promise<void> {
    try {
      const result = this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
      if (result.changes === 0) {
        throw new AuthoringError("NOT_FOUND", "Project not found", { projectId });
      }
    } catch (error) {
      throw storageError(error, "Failed to delete authoring project");
    }
  }

  public close(): void {
    this.db.close();
  }

  private readProjectGraph(projectId: string, versionId?: string): StoryGraph {
    const project = this.requireProject(projectId);
    const resolvedVersionId = versionId ?? project.activeDraftVersionId;
    if (!resolvedVersionId) {
      throw new AuthoringError("NOT_FOUND", "Project has no active draft version", { projectId });
    }

    this.requireVersion(projectId, resolvedVersionId);

    const chapters = this.db
      .prepare("SELECT * FROM chapters WHERE version_id = ? ORDER BY ordinal ASC, id ASC")
      .all(resolvedVersionId) as ChapterRow[];
    const nodes = this.db
      .prepare("SELECT * FROM story_nodes WHERE version_id = ? ORDER BY topological_rank ASC, id ASC")
      .all(resolvedVersionId) as StoryNodeRow[];
    const edges = this.db
      .prepare("SELECT * FROM story_edges WHERE version_id = ? ORDER BY sort_order ASC, id ASC")
      .all(resolvedVersionId) as StoryEdgeRow[];

    return {
      versionId: resolvedVersionId,
      chapters: chapters.map(toChapter),
      nodes: nodes.map(toStoryNode),
      edges: edges.map(toStoryEdge),
    };
  }

  private replaceVersionGraphRows(versionId: string, graph: StoryGraph): void {
    this.db.prepare("DELETE FROM story_edges WHERE version_id = ?").run(versionId);
    this.db.prepare("DELETE FROM story_nodes WHERE version_id = ?").run(versionId);
    this.db.prepare("DELETE FROM chapters WHERE version_id = ?").run(versionId);

    const insertChapter = this.db.prepare(`
      INSERT INTO chapters (id, version_id, ordinal, title, goal, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertNode = this.db.prepare(`
      INSERT INTO story_nodes (
        id, version_id, chapter_id, node_key, kind, title, body, summary, objective,
        topological_rank, content_status, author_modified, content_revision, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEdge = this.db.prepare(`
      INSERT INTO story_edges (
        id, version_id, source_node_id, target_node_id, label, intent,
        consequence_summary, sort_order, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const chapter of graph.chapters) {
      insertChapter.run(
        chapter.id,
        versionId,
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
        versionId,
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
        versionId,
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

  private copyVersionGraph(sourceVersionId: string, targetVersionId: string): void {
    const graph = this.readGraphByVersionId(sourceVersionId);
    const chapterIdMap = new Map<string, string>();
    const nodeIdMap = new Map<string, string>();

    const copiedGraph: StoryGraph = {
      versionId: targetVersionId,
      chapters: graph.chapters.map((sourceChapter) => {
        const copiedId = randomUUID();
        chapterIdMap.set(sourceChapter.id, copiedId);
        return { ...sourceChapter, id: copiedId, versionId: targetVersionId };
      }),
      nodes: graph.nodes.map((sourceNode) => {
        const copiedId = randomUUID();
        const copiedChapterId = chapterIdMap.get(sourceNode.chapterId);
        if (!copiedChapterId) {
          throw new AuthoringError("STORAGE", "Source graph has a node without a chapter", {
            nodeId: sourceNode.id,
          });
        }

        nodeIdMap.set(sourceNode.id, copiedId);
        return { ...sourceNode, id: copiedId, versionId: targetVersionId, chapterId: copiedChapterId };
      }),
      edges: graph.edges.map((sourceEdge) => {
        const copiedSourceId = nodeIdMap.get(sourceEdge.sourceNodeId);
        const copiedTargetId = nodeIdMap.get(sourceEdge.targetNodeId);
        if (!copiedSourceId || !copiedTargetId) {
          throw new AuthoringError("STORAGE", "Source graph has an edge without both endpoint nodes", {
            edgeId: sourceEdge.id,
          });
        }

        return {
          ...sourceEdge,
          id: randomUUID(),
          versionId: targetVersionId,
          sourceNodeId: copiedSourceId,
          targetNodeId: copiedTargetId,
        };
      }),
    };

    this.replaceVersionGraphRows(targetVersionId, copiedGraph);
  }

  private readGraphByVersionId(versionId: string): StoryGraph {
    const chapters = this.db
      .prepare("SELECT * FROM chapters WHERE version_id = ? ORDER BY ordinal ASC, id ASC")
      .all(versionId) as ChapterRow[];
    const nodes = this.db
      .prepare("SELECT * FROM story_nodes WHERE version_id = ? ORDER BY topological_rank ASC, id ASC")
      .all(versionId) as StoryNodeRow[];
    const edges = this.db
      .prepare("SELECT * FROM story_edges WHERE version_id = ? ORDER BY sort_order ASC, id ASC")
      .all(versionId) as StoryEdgeRow[];

    return {
      versionId,
      chapters: chapters.map(toChapter),
      nodes: nodes.map(toStoryNode),
      edges: edges.map(toStoryEdge),
    };
  }

  private createVersionCopy(
    projectId: string,
    sourceVersion: StoryVersionRow,
    kind: StoryVersion["kind"],
    sourceVersionId: string | null,
    sealedAt: string | null,
  ): StoryVersion {
    const id = randomUUID();
    const nextVersionNumber = this.nextVersionNumber(projectId);
    const createdAt = nowIso();

    this.db
      .prepare(
        `
          INSERT INTO story_versions (
            id, project_id, version_number, kind, source_version_id, status,
            brief_json, story_bible_json, outline_json, canon_json, draft_revision,
            created_at, sealed_at, validation_limits_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `,
      )
      .run(
        id,
        projectId,
        nextVersionNumber,
        kind,
        sourceVersionId,
        sourceVersion.status,
        sourceVersion.brief_json,
        sourceVersion.story_bible_json,
        sourceVersion.outline_json,
        sourceVersion.canon_json,
        createdAt,
        sealedAt,
        sourceVersion.validation_limits_json,
      );

    return toStoryVersion(this.requireVersion(projectId, id));
  }

  private nextVersionNumber(projectId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number FROM story_versions WHERE project_id = ?")
      .get(projectId) as { next_version_number: number };

    return row.next_version_number;
  }

  private requireProject(projectId: string): Project {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
    if (!row) {
      throw new AuthoringError("NOT_FOUND", "Project not found", { projectId });
    }

    return toProject(row);
  }

  private requireVersion(projectId: string, versionId: string): StoryVersionRow {
    const row = this.findVersion(projectId, versionId);
    if (!row) {
      throw new AuthoringError("NOT_FOUND", "Story version not found", { projectId, versionId });
    }

    return row;
  }

  private findVersion(projectId: string, versionId: string): StoryVersionRow | undefined {
    return this.db
      .prepare("SELECT * FROM story_versions WHERE project_id = ? AND id = ?")
      .get(projectId, versionId) as StoryVersionRow | undefined;
  }
}

export function createAuthoringRepository(options: AuthoringDatabaseOptions = {}): AuthoringRepository {
  return new BetterSqliteAuthoringRepository(options);
}

let singletonRepository: AuthoringRepository | null = null;

export function getAuthoringRepository(): AuthoringRepository {
  singletonRepository ??= createAuthoringRepository();
  return singletonRepository;
}
