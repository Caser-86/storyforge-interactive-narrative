import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { initializeAuthoringDatabase } from "../database";
import type { AuthoringDatabaseOptions } from "../database";
import { AuthoringError } from "../errors";
import type { JsonValue } from "../schemas";
import {
  GenerationRunSchema,
  GenerationStepDescriptorSchema,
  GenerationStepSchema,
} from "./schemas";
import type {
  GenerationErrorCode,
  GenerationRun,
  GenerationStage,
  GenerationStep,
  GenerationStepDescriptor,
} from "./schemas";

const LEASE_MINUTES = 5;

const STAGE_ORDER: GenerationStage[] = [
  "brief",
  "bible",
  "outline",
  "graph",
  "structural_check",
  "nodes",
  "continuity_review",
];

export const DEFAULT_GENERATION_STEP_DESCRIPTORS: GenerationStepDescriptor[] = [
  { stepKey: "brief:main", stage: "brief", sortOrder: 0 },
  { stepKey: "bible:main", stage: "bible", sortOrder: 1 },
  { stepKey: "outline:main", stage: "outline", sortOrder: 2 },
  { stepKey: "graph:main", stage: "graph", sortOrder: 3 },
  { stepKey: "structural_check:main", stage: "structural_check", sortOrder: 4 },
  { stepKey: "continuity_review:main", stage: "continuity_review", sortOrder: 5 },
];

export interface CreateGenerationRunOptions {
  now?: Date;
  model?: string | null;
  steps?: GenerationStepDescriptor[];
}

export interface CompleteGenerationStepInput {
  attempt: number;
  leaseExpiresAt: string;
  completedAt?: Date;
  model?: string | null;
  rawResponse?: JsonValue | string | null;
  parsedResponse?: JsonValue | null;
  inputTokens?: number;
  outputTokens?: number;
}

export interface FailGenerationStepInput {
  attempt: number;
  leaseExpiresAt: string;
  failedAt?: Date;
  code: GenerationErrorCode;
  message: string;
  retryable: boolean;
  nextAttemptAt?: Date | null;
}

export interface PauseGenerationRunError {
  code: GenerationErrorCode;
  message: string;
}

export interface GenerationRepository {
  createRun(projectId: string, versionId: string, options?: CreateGenerationRunOptions): Promise<GenerationRun>;
  getRun(runId: string): Promise<GenerationRun>;
  listRuns(projectId: string): Promise<GenerationRun[]>;
  listActiveRuns(): Promise<GenerationRun[]>;
  listSteps(runId: string): Promise<GenerationStep[]>;
  getStep(stepId: string): Promise<GenerationStep>;
  leaseNextSteps(runId: string, now: Date, limit: number): Promise<GenerationStep[]>;
  recoverExpiredSteps(runId: string, now: Date): Promise<number>;
  completeStep(stepId: string, input: CompleteGenerationStepInput): Promise<GenerationStep>;
  failStep(stepId: string, input: FailGenerationStepInput): Promise<GenerationStep>;
  pauseRun(runId: string, now: Date, error?: PauseGenerationRunError): Promise<GenerationRun>;
  resumeRun(runId: string, now: Date): Promise<GenerationRun>;
  cancelRun(runId: string, now: Date): Promise<GenerationRun>;
  close(): void;
}

type GenerationRunRow = {
  id: string;
  project_id: string;
  version_id: string;
  stage: GenerationStage;
  status: GenerationRun["status"];
  progress_current: number;
  progress_total: number;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  retry_count: number;
  last_error_code: GenerationErrorCode | null;
  last_error_message: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type GenerationStepRow = {
  id: string;
  run_id: string;
  step_key: string;
  stage: Exclude<GenerationStage, "ready">;
  subject_id: string | null;
  status: GenerationStep["status"];
  attempt: number;
  sort_order: number;
  lease_expires_at: string | null;
  next_attempt_at: string | null;
  model: string | null;
  request_json: string;
  raw_response: string | null;
  parsed_response_json: string | null;
  input_tokens: number;
  output_tokens: number;
  error_code: GenerationErrorCode | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

function addMinutes(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function parseJsonValue(text: string): JsonValue {
  return JSON.parse(text) as JsonValue;
}

function stringifyJson(value: JsonValue | string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function toRun(row: GenerationRunRow): GenerationRun {
  return GenerationRunSchema.parse({
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id,
    stage: row.stage,
    status: row.status,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    retryCount: row.retry_count,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    leaseExpiresAt: row.lease_expires_at,
    startedAt: row.started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  });
}

function toStep(row: GenerationStepRow): GenerationStep {
  return GenerationStepSchema.parse({
    id: row.id,
    runId: row.run_id,
    stepKey: row.step_key,
    stage: row.stage,
    subjectId: row.subject_id,
    status: row.status,
    attempt: row.attempt,
    sortOrder: row.sort_order,
    leaseExpiresAt: row.lease_expires_at,
    nextAttemptAt: row.next_attempt_at,
    model: row.model,
    requestJson: parseJsonValue(row.request_json),
    rawResponse: row.raw_response,
    parsedResponseJson: row.parsed_response_json === null ? null : parseJsonValue(row.parsed_response_json),
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  });
}

function storageError(error: unknown, message: string): AuthoringError {
  if (error instanceof AuthoringError) {
    return error;
  }

  return new AuthoringError("STORAGE", message, {
    cause: error instanceof Error ? error.message : String(error),
  });
}

function ensureUniqueStepKeys(steps: GenerationStepDescriptor[]): void {
  const seen = new Set<string>();

  for (const step of steps) {
    if (seen.has(step.stepKey)) {
      throw new AuthoringError("CONFLICT", "Generation step keys must be unique within a run", {
        stepKey: step.stepKey,
      });
    }

    seen.add(step.stepKey);
  }
}

function ensureStepOrder(steps: GenerationStepDescriptor[]): GenerationStepDescriptor[] {
  const ordered = [...steps].sort((left, right) => left.sortOrder - right.sortOrder || left.stepKey.localeCompare(right.stepKey));
  let previousStageIndex = -1;
  const stageBySortOrder = new Map<number, GenerationStage>();

  for (const step of ordered) {
    const stageIndex = STAGE_ORDER.indexOf(step.stage);
    if (stageIndex < 0 || stageIndex < previousStageIndex) {
      throw new AuthoringError("VALIDATION", "Generation steps must follow the canonical stage order", {
        stepKey: step.stepKey,
        stage: step.stage,
      });
    }

    const existingStage = stageBySortOrder.get(step.sortOrder);
    if (existingStage !== undefined && existingStage !== step.stage) {
      throw new AuthoringError("VALIDATION", "Steps from different stages cannot share a sort order", {
        sortOrder: step.sortOrder,
        firstStage: existingStage,
        secondStage: step.stage,
      });
    }

    stageBySortOrder.set(step.sortOrder, step.stage);
    previousStageIndex = stageIndex;
  }

  return ordered;
}

export class BetterSqliteGenerationRepository implements GenerationRepository {
  private readonly db: Database.Database;

  constructor(options: AuthoringDatabaseOptions = {}) {
    this.db = initializeAuthoringDatabase(options);
  }

  public async createRun(
    projectId: string,
    versionId: string,
    options: CreateGenerationRunOptions = {},
  ): Promise<GenerationRun> {
    try {
      const create = this.db.transaction(() => {
        const steps = (options.steps ?? DEFAULT_GENERATION_STEP_DESCRIPTORS).map((step) =>
          GenerationStepDescriptorSchema.parse(step),
        );
        ensureUniqueStepKeys(steps);
        const orderedSteps = ensureStepOrder(steps);
        this.requireProjectVersion(projectId, versionId);

        const active = this.db
          .prepare(
            `
              SELECT id FROM generation_runs
              WHERE project_id = ?
                AND status IN ('queued', 'running', 'paused')
              LIMIT 1
            `,
          )
          .get(projectId) as { id: string } | undefined;
        if (active) {
          throw new AuthoringError("CONFLICT", "Project already has an active generation run", {
            projectId,
            runId: active.id,
          });
        }

        const timestamp = nowIso(options.now);
        const runId = randomUUID();
        const firstStage = orderedSteps[0]?.stage ?? "ready";

        this.db
          .prepare(
            `
              INSERT INTO generation_runs (
                id, project_id, version_id, stage, status, progress_current, progress_total,
                model, input_tokens, output_tokens, retry_count, last_error_code,
                last_error_message, lease_expires_at, started_at, created_at, updated_at, completed_at
              )
              VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, 0, 0, NULL, NULL, NULL, NULL, ?, ?, ?)
            `,
          )
          .run(
            runId,
            projectId,
            versionId,
            firstStage,
            orderedSteps.length === 0 ? "completed" : "queued",
            orderedSteps.length,
            options.model ?? null,
            timestamp,
            timestamp,
            orderedSteps.length === 0 ? timestamp : null,
          );

        const insertStep = this.db.prepare(
          `
            INSERT INTO generation_steps (
              id, run_id, step_key, stage, subject_id, status, attempt, sort_order,
              lease_expires_at, next_attempt_at, model, request_json, raw_response,
              parsed_response_json, input_tokens, output_tokens, error_code,
              error_message, created_at, updated_at, completed_at
            )
            VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, NULL, ?, NULL, NULL, 0, 0, NULL, NULL, ?, ?, NULL)
          `,
        );

        for (const step of orderedSteps) {
          insertStep.run(
            randomUUID(),
            runId,
            step.stepKey,
            step.stage,
            step.subjectId ?? null,
            step.sortOrder,
            JSON.stringify(step.request ?? {}),
            timestamp,
            timestamp,
          );
        }

        return this.requireRun(runId);
      });

      return create();
    } catch (error) {
      throw storageError(error, "Failed to create generation run");
    }
  }

  public async getRun(runId: string): Promise<GenerationRun> {
    try {
      return this.requireRun(runId);
    } catch (error) {
      throw storageError(error, "Failed to read generation run");
    }
  }

  public async listRuns(projectId: string): Promise<GenerationRun[]> {
    try {
      const rows = this.db
        .prepare("SELECT * FROM generation_runs WHERE project_id = ? ORDER BY created_at ASC, id ASC")
        .all(projectId) as GenerationRunRow[];

      return rows.map(toRun);
    } catch (error) {
      throw storageError(error, "Failed to list generation runs");
    }
  }

  public async listActiveRuns(): Promise<GenerationRun[]> {
    try {
      const rows = this.db
        .prepare("SELECT * FROM generation_runs WHERE status IN ('queued', 'running') ORDER BY created_at ASC, id ASC")
        .all() as GenerationRunRow[];

      return rows.map(toRun);
    } catch (error) {
      throw storageError(error, "Failed to list active generation runs");
    }
  }

  public async listSteps(runId: string): Promise<GenerationStep[]> {
    try {
      this.requireRun(runId);
      const rows = this.db
        .prepare("SELECT * FROM generation_steps WHERE run_id = ? ORDER BY sort_order ASC, created_at ASC, id ASC")
        .all(runId) as GenerationStepRow[];

      return rows.map(toStep);
    } catch (error) {
      throw storageError(error, "Failed to list generation steps");
    }
  }

  public async getStep(stepId: string): Promise<GenerationStep> {
    try {
      return this.requireStep(stepId);
    } catch (error) {
      throw storageError(error, "Failed to read generation step");
    }
  }

  public async leaseNextSteps(runId: string, now: Date, limit: number): Promise<GenerationStep[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new AuthoringError("VALIDATION", "Lease limit must be a positive integer", { limit });
    }

    try {
      const lease = this.db.transaction(() => {
        const run = this.requireRunRow(runId);
        if (!["queued", "running"].includes(run.status)) {
          return [];
        }

        const timestamp = nowIso(now);
        const leaseExpiresAt = addMinutes(now, LEASE_MINUTES);
        const rows = this.db
          .prepare(
            `
              SELECT * FROM generation_steps
              WHERE run_id = ?
                AND (
                  status = 'queued'
                  OR (status = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?)
                  OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
                )
                AND NOT EXISTS (
                  SELECT 1 FROM generation_steps prior
                  WHERE prior.run_id = generation_steps.run_id
                    AND prior.status != 'completed'
                    AND prior.sort_order < generation_steps.sort_order
                )
              ORDER BY sort_order ASC, created_at ASC, id ASC
              LIMIT ?
            `,
          )
          .all(runId, timestamp, timestamp, limit) as GenerationStepRow[];

        if (rows.length === 0) {
          return [];
        }

        const updateStep = this.db.prepare(
          `
            UPDATE generation_steps
            SET status = 'running',
                attempt = attempt + 1,
                lease_expires_at = ?,
                next_attempt_at = NULL,
                error_code = NULL,
                error_message = NULL,
                updated_at = ?
            WHERE id = ?
              AND (
                (status = 'queued' AND ? = 'queued')
                OR (status = 'failed' AND ? = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?)
                OR (status = 'running' AND ? = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
              )
          `,
        );

        const claimedRows: GenerationStepRow[] = [];
        for (const row of rows) {
          const result = updateStep.run(
            leaseExpiresAt,
            timestamp,
            row.id,
            row.status,
            row.status,
            timestamp,
            row.status,
            timestamp,
          );
          if (result.changes === 1) {
            claimedRows.push(row);
          }
        }

        if (claimedRows.length === 0) {
          return [];
        }

        const reclaimed = claimedRows.filter((row) => row.status === "running").length;
        this.db
          .prepare(
            `
              UPDATE generation_runs
              SET status = 'running',
                  stage = ?,
                  started_at = COALESCE(started_at, ?),
                  lease_expires_at = ?,
                  retry_count = retry_count + ?,
                  last_error_code = NULL,
                  last_error_message = NULL,
                  updated_at = ?
              WHERE id = ? AND status NOT IN ('failed', 'canceled')
            `,
          )
          .run(claimedRows[0]!.stage, timestamp, leaseExpiresAt, reclaimed, timestamp, runId);

        return claimedRows.map((row) => this.requireStep(row.id));
      });

      return lease();
    } catch (error) {
      throw storageError(error, "Failed to lease generation steps");
    }
  }

  public async recoverExpiredSteps(runId: string, now: Date): Promise<number> {
    try {
      const recover = this.db.transaction(() => {
        const timestamp = nowIso(now);
        const result = this.db
          .prepare(
            `
              UPDATE generation_steps
              SET status = 'queued',
                  lease_expires_at = NULL,
                  updated_at = ?
              WHERE run_id = ?
                AND status = 'running'
                AND lease_expires_at IS NOT NULL
                AND lease_expires_at <= ?
            `,
          )
          .run(timestamp, runId, timestamp);

        if (result.changes > 0) {
          this.db
            .prepare(
              `
                UPDATE generation_runs
                SET status = CASE WHEN status = 'running' THEN 'queued' ELSE status END,
                    lease_expires_at = CASE WHEN status = 'running' THEN NULL ELSE lease_expires_at END,
                    updated_at = ?
                WHERE id = ?
              `,
            )
            .run(timestamp, runId);
        }

        return result.changes;
      });

      return recover();
    } catch (error) {
      throw storageError(error, "Failed to recover expired generation steps");
    }
  }

  public async completeStep(
    stepId: string,
    input: CompleteGenerationStepInput,
  ): Promise<GenerationStep> {
    try {
      const complete = this.db.transaction(() => {
        const current = this.requireStepRow(stepId);
        if (current.status === "completed") {
          return toStep(current);
        }

        const completedAt = nowIso(input.completedAt);
        this.assertLeaseOwner(current, input.attempt, input.leaseExpiresAt, completedAt);
        const model = input.model ?? current.model;
        const inputTokens = input.inputTokens ?? 0;
        const outputTokens = input.outputTokens ?? 0;

        this.db
          .prepare(
            `
              UPDATE generation_steps
              SET status = 'completed',
                  lease_expires_at = NULL,
                  next_attempt_at = NULL,
                  model = ?,
                  raw_response = ?,
                  parsed_response_json = ?,
                  input_tokens = ?,
                  output_tokens = ?,
                  error_code = NULL,
                  error_message = NULL,
                  updated_at = ?,
                  completed_at = ?
              WHERE id = ?
            `,
          )
          .run(
            model,
            stringifyJson(input.rawResponse),
            stringifyJson(input.parsedResponse),
            inputTokens,
            outputTokens,
            completedAt,
            completedAt,
            stepId,
          );

        this.refreshRunAfterStepChange(current.run_id, completedAt, {
          addInputTokens: inputTokens,
          addOutputTokens: outputTokens,
          completedStepStage: current.stage,
        });

        return this.requireStep(stepId);
      });

      return complete();
    } catch (error) {
      throw storageError(error, "Failed to complete generation step");
    }
  }

  public async failStep(stepId: string, input: FailGenerationStepInput): Promise<GenerationStep> {
    try {
      const fail = this.db.transaction(() => {
        const current = this.requireStepRow(stepId);
        if (current.status === "failed") {
          return toStep(current);
        }

        const failedAt = nowIso(input.failedAt);
        this.assertLeaseOwner(current, input.attempt, input.leaseExpiresAt, failedAt);
        this.db
          .prepare(
            `
              UPDATE generation_steps
              SET status = 'failed',
                  lease_expires_at = NULL,
                  next_attempt_at = ?,
                  error_code = ?,
                  error_message = ?,
                  updated_at = ?
              WHERE id = ? AND status NOT IN ('failed', 'canceled')
            `,
          )
          .run(input.retryable ? nowIso(input.nextAttemptAt ?? input.failedAt) : null, input.code, input.message, failedAt, stepId);

        this.db
          .prepare(
            `
              UPDATE generation_runs
              SET status = ?,
                  stage = ?,
                  retry_count = retry_count + 1,
                  last_error_code = ?,
                  last_error_message = ?,
                  lease_expires_at = NULL,
                   updated_at = ?,
                   completed_at = CASE WHEN ? = 'failed' THEN ? ELSE completed_at END
              WHERE id = ? AND status NOT IN ('failed', 'canceled')
            `,
          )
          .run(
            input.retryable ? "queued" : "failed",
            current.stage,
            input.code,
            input.message,
            failedAt,
            input.retryable ? "queued" : "failed",
            failedAt,
            current.run_id,
          );

        return this.requireStep(stepId);
      });

      return fail();
    } catch (error) {
      throw storageError(error, "Failed to fail generation step");
    }
  }

  public async pauseRun(runId: string, now: Date, error?: PauseGenerationRunError): Promise<GenerationRun> {
    try {
      const pause = this.db.transaction(() => {
        const current = this.requireRunRow(runId);
        if (["completed", "failed", "canceled"].includes(current.status)) {
          return toRun(current);
        }

        const timestamp = nowIso(now);
        this.db
          .prepare(
            `
              UPDATE generation_steps
              SET status = 'queued',
                  lease_expires_at = NULL,
                  next_attempt_at = NULL,
                  updated_at = ?
              WHERE run_id = ? AND status = 'running'
            `,
          )
          .run(timestamp, runId);

        this.db
          .prepare(
            `
              UPDATE generation_runs
              SET status = 'paused',
                  last_error_code = ?,
                  last_error_message = ?,
                  lease_expires_at = NULL,
                  updated_at = ?
              WHERE id = ?
            `,
          )
          .run(error?.code ?? null, error?.message ?? null, timestamp, runId);

        return this.requireRun(runId);
      });

      return pause();
    } catch (error) {
      throw storageError(error, "Failed to pause generation run");
    }
  }

  public async resumeRun(runId: string, now: Date): Promise<GenerationRun> {
    try {
      const resume = this.db.transaction(() => {
        const current = this.requireRunRow(runId);
        if (current.status !== "paused") {
          return toRun(current);
        }

        const timestamp = nowIso(now);
        this.db
          .prepare(
            `
              UPDATE generation_runs
              SET status = 'queued',
                  last_error_code = NULL,
                  last_error_message = NULL,
                  updated_at = ?
              WHERE id = ?
            `,
          )
          .run(timestamp, runId);

        return this.requireRun(runId);
      });

      return resume();
    } catch (error) {
      throw storageError(error, "Failed to resume generation run");
    }
  }

  public async cancelRun(runId: string, now: Date): Promise<GenerationRun> {
    try {
      const cancel = this.db.transaction(() => {
        const current = this.requireRunRow(runId);
        if (["completed", "failed", "canceled"].includes(current.status)) {
          return toRun(current);
        }

        const timestamp = nowIso(now);
        this.db
          .prepare(
            `
              UPDATE generation_steps
              SET status = 'canceled',
                  lease_expires_at = NULL,
                  next_attempt_at = NULL,
                  error_code = 'CANCELED',
                  error_message = 'Generation run was canceled.',
                  updated_at = ?
              WHERE run_id = ? AND status IN ('queued', 'running', 'failed')
            `,
          )
          .run(timestamp, runId);

        this.db
          .prepare(
            `
              UPDATE generation_runs
              SET status = 'canceled',
                  last_error_code = 'CANCELED',
                  last_error_message = 'Generation run was canceled.',
                  lease_expires_at = NULL,
                  updated_at = ?,
                  completed_at = COALESCE(completed_at, ?)
              WHERE id = ?
            `,
          )
          .run(timestamp, timestamp, runId);

        return this.requireRun(runId);
      });

      return cancel();
    } catch (error) {
      throw storageError(error, "Failed to cancel generation run");
    }
  }

  public close(): void {
    this.db.close();
  }

  private refreshRunAfterStepChange(
    runId: string,
    timestamp: string,
    tokens: { addInputTokens: number; addOutputTokens: number; completedStepStage: GenerationStage },
  ): void {
    const progress = this.db
      .prepare(
        `
          SELECT
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
            COUNT(*) AS total_count
          FROM generation_steps
          WHERE run_id = ?
        `,
      )
      .get(runId) as { completed_count: number | null; total_count: number };
    const progressCurrent = progress.completed_count ?? 0;
    const nextStep = this.db
      .prepare(
        `
          SELECT stage FROM generation_steps
          WHERE run_id = ? AND status != 'completed'
          ORDER BY sort_order ASC, created_at ASC, id ASC
          LIMIT 1
        `,
      )
      .get(runId) as { stage: GenerationStage } | undefined;
    const nextStatus = progress.total_count > 0 && progressCurrent === progress.total_count ? "completed" : "queued";
    const nextStage = nextStatus === "completed" ? "ready" : (nextStep?.stage ?? tokens.completedStepStage);

    this.db
      .prepare(
        `
          UPDATE generation_runs
          SET status = CASE WHEN status IN ('failed', 'canceled') THEN status ELSE ? END,
              stage = CASE WHEN status IN ('failed', 'canceled') THEN stage ELSE ? END,
              progress_current = ?,
              progress_total = ?,
              input_tokens = input_tokens + ?,
              output_tokens = output_tokens + ?,
              lease_expires_at = CASE WHEN status IN ('failed', 'canceled') THEN lease_expires_at ELSE NULL END,
              last_error_code = CASE WHEN status IN ('failed', 'canceled') THEN last_error_code ELSE NULL END,
              last_error_message = CASE WHEN status IN ('failed', 'canceled') THEN last_error_message ELSE NULL END,
              updated_at = ?,
              completed_at = CASE
                WHEN status IN ('failed', 'canceled') THEN completed_at
                WHEN ? = 'completed' THEN ?
                ELSE completed_at
              END
          WHERE id = ?
        `,
      )
      .run(
        nextStatus,
        nextStage,
        progressCurrent,
        progress.total_count,
        tokens.addInputTokens,
        tokens.addOutputTokens,
        timestamp,
        nextStatus,
        timestamp,
        runId,
      );
  }

  private requireProjectVersion(projectId: string, versionId: string): void {
    const row = this.db
      .prepare("SELECT 1 AS found FROM story_versions WHERE project_id = ? AND id = ?")
      .get(projectId, versionId) as { found: number } | undefined;
    if (!row) {
      throw new AuthoringError("NOT_FOUND", "Story version not found", { projectId, versionId });
    }
  }

  private requireRun(runId: string): GenerationRun {
    return toRun(this.requireRunRow(runId));
  }

  private requireRunRow(runId: string): GenerationRunRow {
    const row = this.db.prepare("SELECT * FROM generation_runs WHERE id = ?").get(runId) as
      | GenerationRunRow
      | undefined;
    if (!row) {
      throw new AuthoringError("NOT_FOUND", "Generation run not found", { runId });
    }

    return row;
  }

  private requireStep(stepId: string): GenerationStep {
    return toStep(this.requireStepRow(stepId));
  }

  private requireStepRow(stepId: string): GenerationStepRow {
    const row = this.db.prepare("SELECT * FROM generation_steps WHERE id = ?").get(stepId) as
      | GenerationStepRow
      | undefined;
    if (!row) {
      throw new AuthoringError("NOT_FOUND", "Generation step not found", { stepId });
    }

    return row;
  }

  private assertLeaseOwner(
    current: GenerationStepRow,
    attempt: number,
    leaseExpiresAt: string,
    operationTimestamp: string,
  ): void {
    if (current.status !== "running") {
      throw new AuthoringError("CONFLICT", "Generation step is not running", {
        stepId: current.id,
        status: current.status,
      });
    }

    if (
      current.attempt !== attempt ||
      current.lease_expires_at !== leaseExpiresAt ||
      new Date(current.lease_expires_at).getTime() <= new Date(operationTimestamp).getTime()
    ) {
      throw new AuthoringError("CONFLICT", "Generation step lease is stale", {
        stepId: current.id,
        attempt,
      });
    }
  }
}

export function createGenerationRepository(options: AuthoringDatabaseOptions = {}): GenerationRepository {
  return new BetterSqliteGenerationRepository(options);
}
