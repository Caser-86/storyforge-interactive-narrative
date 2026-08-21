import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { z } from "zod";
import { AuthoringError } from "./errors";
import { getAuthoringDbPath, initializeAuthoringDatabase } from "./database";
import {
  ChapterSchema,
  JsonValueSchema,
  ProjectSchema,
  StoryEdgeSchema,
  StoryNodeSchema,
  StoryVersionSchema,
} from "./schemas";
import { GenerationErrorCodeSchema, GenerationStageSchema, GenerationStepStatusSchema, GenerationRunStatusSchema, GenerationCandidateStatusSchema } from "./generation/schemas";
import { ValidationIssueStatusSchema, ValidationRunStatusSchema, ValidationSeveritySchema, ValidationSourceSchema } from "./validation/schemas";
import type { AuthoringDatabaseOptions } from "./database";
import type { Chapter, JsonValue, Project, StoryEdge, StoryNode } from "./schemas";

const BackupGenerationRunSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    versionId: z.string().min(1),
    stage: GenerationStageSchema,
    status: GenerationRunStatusSchema,
    progressCurrent: z.number().int().min(0),
    progressTotal: z.number().int().min(0),
    model: z.string().min(1).nullable(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    retryCount: z.number().int().min(0),
    lastErrorCode: GenerationErrorCodeSchema.nullable(),
    lastErrorMessage: z.string().min(1).nullable(),
    startedAt: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    completedAt: z.string().min(1).nullable(),
  })
  .strict();

const BackupGenerationStepSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    stepKey: z.string().min(1),
    stage: GenerationStageSchema.exclude(["ready"]),
    subjectId: z.string().min(1).nullable(),
    status: GenerationStepStatusSchema,
    attempt: z.number().int().min(0),
    sortOrder: z.number().int().min(0),
    model: z.string().min(1).nullable(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    errorCode: GenerationErrorCodeSchema.nullable(),
    errorMessage: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    completedAt: z.string().min(1).nullable(),
  })
  .strict();

const BackupGenerationCandidateSchema = z
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
    createdAt: z.string().min(1),
    appliedAt: z.string().min(1).nullable(),
    rejectedAt: z.string().min(1).nullable(),
  })
  .strict();

const BackupValidationRunSchema = z
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

const BackupValidationIssueSchema = z
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

const BackupVersionSchema = StoryVersionSchema.extend({
  draftRevision: z.number().int().min(0),
  validationLimitsJson: JsonValueSchema,
}).strict();

export const ProjectBackupV1Schema = z
  .object({
    schema: z.literal("storyforge-project@1"),
    exportedAt: z.string().min(1),
    project: ProjectSchema,
    versions: z.array(BackupVersionSchema),
    chapters: z.array(ChapterSchema),
    nodes: z.array(StoryNodeSchema),
    edges: z.array(StoryEdgeSchema),
    generation: z
      .object({
        runs: z.array(BackupGenerationRunSchema),
        steps: z.array(BackupGenerationStepSchema),
        candidates: z.array(BackupGenerationCandidateSchema),
      })
      .strict(),
    validation: z
      .object({
        runs: z.array(BackupValidationRunSchema),
        issues: z.array(BackupValidationIssueSchema),
      })
      .strict(),
  })
  .strict();

export type ProjectBackupV1 = z.infer<typeof ProjectBackupV1Schema>;

function parseJson(text: string): JsonValue {
  return JsonValueSchema.parse(JSON.parse(text));
}

function safeMessage(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .replace(/https?:\/\/[^\s/]+:[^\s/@]+@/gi, "[redacted]@");
}

function storageError(error: unknown, message: string): AuthoringError {
  if (error instanceof AuthoringError) return error;
  return new AuthoringError("STORAGE", message, { cause: error instanceof Error ? error.message : String(error) });
}

function validationError(error: unknown, message: string): AuthoringError {
  return new AuthoringError("VALIDATION", message, {
    cause: error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join("; ") : String(error),
  });
}

function readProjectBackup(db: Database.Database, projectId: string): ProjectBackupV1 {
  const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as Record<string, unknown> | undefined;
  if (!projectRow) throw new AuthoringError("NOT_FOUND", "Project not found", { projectId });

  const project = ProjectSchema.parse({
    id: projectRow.id,
    title: projectRow.title,
    premise: projectRow.premise,
    genre: projectRow.genre,
    tone: projectRow.tone,
    pointOfView: projectRow.point_of_view,
    rating: projectRow.rating,
    sizePreset: projectRow.size_preset,
    targetNodeCount: projectRow.target_node_count,
    targetEndingCount: projectRow.target_ending_count,
    status: projectRow.status,
    activeDraftVersionId: projectRow.active_draft_version_id,
    settingsJson: parseJson(String(projectRow.settings_json)),
    createdAt: projectRow.created_at,
    updatedAt: projectRow.updated_at,
  });

  const versions = (db.prepare("SELECT * FROM story_versions WHERE project_id = ? ORDER BY version_number").all(projectId) as Record<string, unknown>[]).map((row) =>
    BackupVersionSchema.parse({
      id: row.id,
      projectId: row.project_id,
      versionNumber: row.version_number,
      kind: row.kind,
      sourceVersionId: row.source_version_id,
      status: row.status,
      briefJson: parseJson(String(row.brief_json)),
      storyBibleJson: parseJson(String(row.story_bible_json)),
      outlineJson: parseJson(String(row.outline_json)),
      canonJson: parseJson(String(row.canon_json)),
      draftRevision: row.draft_revision,
      validationLimitsJson: parseJson(String(row.validation_limits_json ?? "{}")),
      createdAt: row.created_at,
      sealedAt: row.sealed_at,
    }),
  );
  const versionIds = versions.map((version) => version.id);
  const inVersions = versionIds.length > 0 ? versionIds.map(() => "?").join(",") : "NULL";
  const chapters = (db.prepare(`SELECT * FROM chapters WHERE version_id IN (${inVersions}) ORDER BY ordinal, id`).all(...versionIds) as Record<string, unknown>[]).map((row) =>
    ChapterSchema.parse({
      id: row.id,
      versionId: row.version_id,
      ordinal: row.ordinal,
      title: row.title,
      goal: row.goal,
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );
  const nodes = (db.prepare(`SELECT * FROM story_nodes WHERE version_id IN (${inVersions}) ORDER BY topological_rank, id`).all(...versionIds) as Record<string, unknown>[]).map((row) =>
    StoryNodeSchema.parse({
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
    }),
  );
  const edges = (db.prepare(`SELECT * FROM story_edges WHERE version_id IN (${inVersions}) ORDER BY sort_order, id`).all(...versionIds) as Record<string, unknown>[]).map((row) =>
    StoryEdgeSchema.parse({
      id: row.id,
      versionId: row.version_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      label: row.label,
      intent: row.intent,
      consequenceSummary: row.consequence_summary,
      branchType: row.branch_type,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );

  const runs = (db.prepare("SELECT * FROM generation_runs WHERE project_id = ? ORDER BY created_at, id").all(projectId) as Record<string, unknown>[]).map((row) =>
    BackupGenerationRunSchema.parse({
      id: row.id,
      projectId: row.project_id,
      versionId: row.version_id,
      stage: row.stage,
      status: row.status === "running" ? "paused" : row.status,
      progressCurrent: row.progress_current,
      progressTotal: row.progress_total,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      retryCount: row.retry_count,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: safeMessage(row.last_error_message as string | null),
      startedAt: row.started_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    }),
  );
  const runIds = runs.map((run) => run.id);
  const runPlaceholders = runIds.length > 0 ? runIds.map(() => "?").join(",") : "NULL";
  const steps = (db.prepare(`SELECT * FROM generation_steps WHERE run_id IN (${runPlaceholders}) ORDER BY sort_order, id`).all(...runIds) as Record<string, unknown>[]).map((row) =>
    BackupGenerationStepSchema.parse({
      id: row.id,
      runId: row.run_id,
      stepKey: row.step_key,
      stage: row.stage,
      subjectId: row.subject_id,
      status: row.status === "running" ? "queued" : row.status,
      attempt: row.attempt,
      sortOrder: row.sort_order,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      errorCode: row.error_code,
      errorMessage: safeMessage(row.error_message as string | null),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    }),
  );
  const candidates = (db.prepare("SELECT * FROM generation_candidates WHERE project_id = ? ORDER BY created_at, id").all(projectId) as Record<string, unknown>[]).map((row) =>
    BackupGenerationCandidateSchema.parse({
      id: row.id,
      projectId: row.project_id,
      versionId: row.version_id,
      runId: row.run_id,
      stepId: row.step_id,
      nodeId: row.node_id,
      baseContentRevision: row.base_content_revision,
      status: row.status,
      candidateBody: row.candidate_body,
      model: row.model,
      createdAt: row.created_at,
      appliedAt: row.applied_at,
      rejectedAt: row.rejected_at,
    }),
  );

  const validationRuns = (db.prepare("SELECT * FROM validation_runs WHERE project_id = ? ORDER BY created_at, id").all(projectId) as Record<string, unknown>[]).map((row) =>
    BackupValidationRunSchema.parse({
      id: row.id,
      projectId: row.project_id,
      versionId: row.version_id,
      draftRevision: row.draft_revision,
      sources: JSON.parse(String(row.sources_json)),
      status: row.status,
      errorMessage: safeMessage(row.error_message as string | null),
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }),
  );
  const validationIssues = (db.prepare("SELECT * FROM validation_issues WHERE project_id = ? ORDER BY created_at, id").all(projectId) as Record<string, unknown>[]).map((row) =>
    BackupValidationIssueSchema.parse({
      id: row.id,
      projectId: row.project_id,
      versionId: row.version_id,
      runId: row.run_id,
      draftRevision: row.draft_revision,
      source: row.source,
      severity: row.severity,
      code: row.code,
      message: row.message,
      nodeId: row.node_id,
      edgeId: row.edge_id,
      detailsJson: parseJson(String(row.details_json)),
      fingerprint: row.fingerprint,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }),
  );

  return ProjectBackupV1Schema.parse({
    schema: "storyforge-project@1",
    exportedAt: new Date().toISOString(),
    project,
    versions,
    chapters,
    nodes,
    edges,
    generation: { runs, steps, candidates },
    validation: { runs: validationRuns, issues: validationIssues },
  });
}

export async function exportProjectBackup(projectId: string, options: AuthoringDatabaseOptions = {}): Promise<ProjectBackupV1> {
  let db: Database.Database | undefined;
  try {
    db = initializeAuthoringDatabase(options);
    return readProjectBackup(db, projectId);
  } catch (error) {
    throw storageError(error, "Failed to export project backup");
  } finally {
    db?.close();
  }
}

function mapIds(backup: ProjectBackupV1, remap: boolean): {
  project: ProjectBackupV1["project"];
  versions: ProjectBackupV1["versions"];
  chapters: Chapter[];
  nodes: StoryNode[];
  edges: StoryEdge[];
  generation: ProjectBackupV1["generation"];
  validation: ProjectBackupV1["validation"];
} {
  const id = (value: string | null): string | null => (value && remap ? randomUUID() : value);
  const projectId = remap ? randomUUID() : backup.project.id;
  const versionIds = new Map(backup.versions.map((version) => [version.id, id(version.id)!]));
  const chapterIds = new Map(backup.chapters.map((chapter) => [chapter.id, id(chapter.id)!]));
  const nodeIds = new Map(backup.nodes.map((node) => [node.id, id(node.id)!]));
  const runIds = new Map(backup.generation.runs.map((run) => [run.id, id(run.id)!]));
  const stepIds = new Map(backup.generation.steps.map((step) => [step.id, id(step.id)!]));
  const validationRunIds = new Map(backup.validation.runs.map((run) => [run.id, id(run.id)!]));

  const project = {
    ...backup.project,
    id: projectId,
    activeDraftVersionId: backup.project.activeDraftVersionId
      ? versionIds.get(backup.project.activeDraftVersionId)!
      : null,
  };
  const versions = backup.versions.map((version) => ({
    ...version,
    id: versionIds.get(version.id)!,
    projectId,
    sourceVersionId: version.sourceVersionId ? versionIds.get(version.sourceVersionId) ?? null : null,
  }));
  const chapters = backup.chapters.map((chapter) => ({ ...chapter, id: chapterIds.get(chapter.id)!, versionId: versionIds.get(chapter.versionId)! }));
  const nodes = backup.nodes.map((node) => ({ ...node, id: nodeIds.get(node.id)!, versionId: versionIds.get(node.versionId)!, chapterId: chapterIds.get(node.chapterId)! }));
  const edgeIds = new Map(backup.edges.map((edge) => [edge.id, id(edge.id)!]));
  const edges = backup.edges.map((edge) => ({
    ...edge,
    id: edgeIds.get(edge.id)!,
    versionId: versionIds.get(edge.versionId)!,
    sourceNodeId: nodeIds.get(edge.sourceNodeId)!,
    targetNodeId: nodeIds.get(edge.targetNodeId)!,
  }));
  const generation = {
    runs: backup.generation.runs.map((run) => ({ ...run, id: runIds.get(run.id)!, projectId, versionId: versionIds.get(run.versionId)! })),
    steps: backup.generation.steps.map((step) => ({ ...step, id: stepIds.get(step.id)!, runId: runIds.get(step.runId)!, subjectId: step.subjectId ? nodeIds.get(step.subjectId) ?? step.subjectId : null })),
    candidates: backup.generation.candidates.map((candidate) => ({
      ...candidate,
      id: id(candidate.id)!,
      projectId,
      versionId: versionIds.get(candidate.versionId)!,
      runId: candidate.runId ? runIds.get(candidate.runId) ?? null : null,
      stepId: candidate.stepId ? stepIds.get(candidate.stepId) ?? null : null,
      nodeId: nodeIds.get(candidate.nodeId)!,
    })),
  };
  const validation = {
    runs: backup.validation.runs.map((run) => ({ ...run, id: validationRunIds.get(run.id)!, projectId, versionId: versionIds.get(run.versionId)! })),
    issues: backup.validation.issues.map((issue) => ({
      ...issue,
      id: id(issue.id)!,
      projectId,
      versionId: versionIds.get(issue.versionId)!,
      runId: issue.runId ? validationRunIds.get(issue.runId) ?? null : null,
      nodeId: issue.nodeId ? nodeIds.get(issue.nodeId) ?? null : null,
      edgeId: issue.edgeId ? edgeIds.get(issue.edgeId) ?? null : null,
    })),
  };

  return { project, versions, chapters, nodes, edges, generation, validation };
}

function assertRelations(backup: ProjectBackupV1): void {
  const versionIds = new Set(backup.versions.map((version) => version.id));
  const chapterIds = new Set(backup.chapters.map((chapter) => chapter.id));
  const nodeIds = new Set(backup.nodes.map((node) => node.id));
  const runIds = new Set(backup.generation.runs.map((run) => run.id));
  const stepIds = new Set(backup.generation.steps.map((step) => step.id));
  const validationRunIds = new Set(backup.validation.runs.map((run) => run.id));
  if (!backup.project.activeDraftVersionId || !versionIds.has(backup.project.activeDraftVersionId)) throw new Error("active draft version is missing");
  for (const version of backup.versions) if (version.projectId !== backup.project.id || (version.sourceVersionId && !versionIds.has(version.sourceVersionId))) throw new Error("version relation is invalid");
  for (const chapter of backup.chapters) if (!versionIds.has(chapter.versionId)) throw new Error("chapter version relation is invalid");
  for (const node of backup.nodes) if (!versionIds.has(node.versionId) || !chapterIds.has(node.chapterId)) throw new Error("node relation is invalid");
  for (const edge of backup.edges) if (!versionIds.has(edge.versionId) || !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) throw new Error("edge relation is invalid");
  for (const run of backup.generation.runs) if (run.projectId !== backup.project.id || !versionIds.has(run.versionId)) throw new Error("generation run relation is invalid");
  for (const step of backup.generation.steps) if (!runIds.has(step.runId)) throw new Error("generation step relation is invalid");
  for (const candidate of backup.generation.candidates) if (candidate.projectId !== backup.project.id || !versionIds.has(candidate.versionId) || !nodeIds.has(candidate.nodeId) || (candidate.runId && !runIds.has(candidate.runId)) || (candidate.stepId && !stepIds.has(candidate.stepId))) throw new Error("generation candidate relation is invalid");
  for (const run of backup.validation.runs) if (run.projectId !== backup.project.id || !versionIds.has(run.versionId)) throw new Error("validation run relation is invalid");
  for (const issue of backup.validation.issues) if (issue.projectId !== backup.project.id || !versionIds.has(issue.versionId) || (issue.runId && !validationRunIds.has(issue.runId)) || (issue.nodeId && !nodeIds.has(issue.nodeId))) throw new Error("validation issue relation is invalid");
}

function insertBackup(db: Database.Database, backup: ProjectBackupV1, mode: "new-id" | "replace"): Project {
  assertRelations(backup);
  const mapped = mapIds(backup, mode === "new-id");
  if (mode === "replace") db.prepare("DELETE FROM projects WHERE id = ?").run(mapped.project.id);

  db.prepare(`INSERT INTO projects (id, title, premise, genre, tone, point_of_view, rating, size_preset, target_node_count, target_ending_count, status, active_draft_version_id, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    mapped.project.id, mapped.project.title, mapped.project.premise, mapped.project.genre, mapped.project.tone, mapped.project.pointOfView, mapped.project.rating, mapped.project.sizePreset, mapped.project.targetNodeCount, mapped.project.targetEndingCount, mapped.project.status, null, JSON.stringify(mapped.project.settingsJson), mapped.project.createdAt, mapped.project.updatedAt,
  );
  const insertVersion = db.prepare(`INSERT INTO story_versions (id, project_id, version_number, kind, source_version_id, status, brief_json, story_bible_json, outline_json, canon_json, draft_revision, created_at, sealed_at, validation_limits_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const version of mapped.versions) insertVersion.run(version.id, version.projectId, version.versionNumber, version.kind, version.sourceVersionId, version.status, JSON.stringify(version.briefJson), JSON.stringify(version.storyBibleJson), JSON.stringify(version.outlineJson), JSON.stringify(version.canonJson), version.draftRevision, version.createdAt, version.sealedAt, JSON.stringify(version.validationLimitsJson));
  db.prepare("UPDATE projects SET active_draft_version_id = ? WHERE id = ?").run(mapped.project.activeDraftVersionId, mapped.project.id);
  const insertChapter = db.prepare("INSERT INTO chapters (id, version_id, ordinal, title, goal, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const chapter of mapped.chapters) insertChapter.run(chapter.id, chapter.versionId, chapter.ordinal, chapter.title, chapter.goal, chapter.summary, chapter.createdAt, chapter.updatedAt);
  const insertNode = db.prepare("INSERT INTO story_nodes (id, version_id, chapter_id, node_key, kind, title, body, summary, objective, topological_rank, content_status, author_modified, content_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const node of mapped.nodes) insertNode.run(node.id, node.versionId, node.chapterId, node.nodeKey, node.kind, node.title, node.body, node.summary, node.objective, node.topologicalRank, node.contentStatus, node.authorModified ? 1 : 0, node.contentRevision, node.createdAt, node.updatedAt);
  const insertEdge = db.prepare("INSERT INTO story_edges (id, version_id, source_node_id, target_node_id, label, intent, consequence_summary, branch_type, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const edge of mapped.edges) insertEdge.run(edge.id, edge.versionId, edge.sourceNodeId, edge.targetNodeId, edge.label, edge.intent, edge.consequenceSummary, edge.branchType, edge.sortOrder, edge.createdAt, edge.updatedAt);
  const insertRun = db.prepare("INSERT INTO generation_runs (id, project_id, version_id, stage, status, progress_current, progress_total, model, input_tokens, output_tokens, retry_count, last_error_code, last_error_message, lease_expires_at, started_at, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)");
  for (const run of mapped.generation.runs) insertRun.run(run.id, run.projectId, run.versionId, run.stage, run.status, run.progressCurrent, run.progressTotal, run.model, run.inputTokens, run.outputTokens, run.retryCount, run.lastErrorCode, run.lastErrorMessage, run.startedAt, run.createdAt, run.updatedAt, run.completedAt);
  const insertStep = db.prepare("INSERT INTO generation_steps (id, run_id, step_key, stage, subject_id, status, attempt, sort_order, lease_expires_at, next_attempt_at, model, request_json, raw_response, parsed_response_json, input_tokens, output_tokens, error_code, error_message, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, '{}', NULL, NULL, ?, ?, ?, ?, ?, ?, ?)");
  for (const step of mapped.generation.steps) insertStep.run(step.id, step.runId, step.stepKey, step.stage, step.subjectId, step.status, step.attempt, step.sortOrder, step.model, step.inputTokens, step.outputTokens, step.errorCode, step.errorMessage, step.createdAt, step.updatedAt, step.completedAt);
  const insertCandidate = db.prepare("INSERT INTO generation_candidates (id, project_id, version_id, run_id, step_id, node_id, base_content_revision, status, candidate_body, model, raw_response, created_at, applied_at, rejected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)");
  for (const candidate of mapped.generation.candidates) insertCandidate.run(candidate.id, candidate.projectId, candidate.versionId, candidate.runId, candidate.stepId, candidate.nodeId, candidate.baseContentRevision, candidate.status, candidate.candidateBody, candidate.model, candidate.createdAt, candidate.appliedAt, candidate.rejectedAt);
  const insertValidationRun = db.prepare("INSERT INTO validation_runs (id, project_id, version_id, draft_revision, sources_json, status, error_message, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const run of mapped.validation.runs) insertValidationRun.run(run.id, run.projectId, run.versionId, run.draftRevision, JSON.stringify(run.sources), run.status, run.errorMessage, run.createdAt, run.completedAt);
  const insertValidationIssue = db.prepare("INSERT INTO validation_issues (id, project_id, version_id, run_id, draft_revision, source, severity, code, message, node_id, edge_id, details_json, fingerprint, status, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const issue of mapped.validation.issues) insertValidationIssue.run(issue.id, issue.projectId, issue.versionId, issue.runId, issue.draftRevision, issue.source, issue.severity, issue.code, issue.message, issue.nodeId, issue.edgeId, JSON.stringify(issue.detailsJson), issue.fingerprint, issue.status, issue.createdAt, issue.resolvedAt);
  return mapped.project;
}

export async function importProjectBackup(input: unknown, mode: "new-id" | "replace", options: AuthoringDatabaseOptions = {}): Promise<Project> {
  let backup: ProjectBackupV1;
  try {
    backup = ProjectBackupV1Schema.parse(input);
    assertRelations(backup);
  } catch (error) {
    throw validationError(error, "Invalid StoryForge project backup");
  }
  const dbPath = getAuthoringDbPath(options);
  let db: Database.Database | undefined;
  try {
    db = initializeAuthoringDatabase(options);
    const imported = db.transaction(() => insertBackup(db!, backup, mode))();
    return ProjectSchema.parse(imported);
  } catch (error) {
    if (error instanceof AuthoringError && error.code === "VALIDATION") throw error;
    throw storageError(error, "Failed to import project backup");
  } finally {
    db?.close();
    void dbPath;
  }
}
