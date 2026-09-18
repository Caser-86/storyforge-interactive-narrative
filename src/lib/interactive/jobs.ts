import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { acquireAuthoringDatabase } from "@/lib/authoring/database";
import { AuthoringError } from "@/lib/authoring/errors";
import type { AuthoringDatabaseOptions } from "@/lib/authoring/database";

export const INTERACTIVE_JOB_LEASE_MS = 5 * 60 * 1_000;
export const INTERACTIVE_JOB_MAX_ATTEMPTS = 3;
export const INTERACTIVE_JOB_DEADLINE_MS = 30 * 60 * 1_000;

export type InteractiveGenerationJobKind = "opening" | "next";
export type InteractiveGenerationJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface InteractiveGenerationJob {
  id: string;
  projectId: string;
  sessionId: string;
  kind: InteractiveGenerationJobKind;
  expectedTurn: number;
  turnId: string | null;
  choiceId: string | null;
  generationToken: string | null;
  status: InteractiveGenerationJobStatus;
  attempt: number;
  maxAttempts: number;
  deadlineAt: string;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type InteractiveGenerationJobClaim = InteractiveGenerationJob & { leaseToken: string };
export type InteractiveGenerationJobFailure = InteractiveGenerationJob & { accepted: boolean };

type InteractiveGenerationJobRow = {
  id: string;
  project_id: string;
  session_id: string;
  kind: InteractiveGenerationJobKind;
  expected_turn: number;
  turn_id: string | null;
  choice_id: string | null;
  generation_token: string | null;
  status: InteractiveGenerationJobStatus;
  attempt: number;
  max_attempts: number;
  deadline_at: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export interface InsertInteractiveGenerationJobInput {
  id?: string;
  projectId: string;
  sessionId: string;
  kind: InteractiveGenerationJobKind;
  expectedTurn: number;
  turnId?: string | null;
  choiceId?: string | null;
  generationToken?: string | null;
  maxAttempts?: number;
  deadlineAt?: Date;
  now?: Date;
}

function toJob(row: InteractiveGenerationJobRow): InteractiveGenerationJob {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    kind: row.kind,
    expectedTurn: row.expected_turn,
    turnId: row.turn_id,
    choiceId: row.choice_id,
    generationToken: row.generation_token,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    deadlineAt: row.deadline_at,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function timestamp(value: Date): string {
  return value.toISOString();
}

function requireJobRow(db: Database.Database, jobId: string): InteractiveGenerationJobRow {
  const row = db.prepare("SELECT * FROM interactive_generation_jobs WHERE id = ?").get(jobId) as InteractiveGenerationJobRow | undefined;
  if (!row) throw new AuthoringError("NOT_FOUND", "Interactive generation job not found", { jobId });
  return row;
}

export function insertInteractiveGenerationJob(db: Database.Database, input: InsertInteractiveGenerationJobInput): string {
  if (!Number.isInteger(input.expectedTurn) || input.expectedTurn < 0) {
    throw new AuthoringError("VALIDATION", "Interactive job turn must be a non-negative integer", { expectedTurn: input.expectedTurn });
  }

  const now = input.now ?? new Date();
  const id = input.id ?? randomUUID();
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? INTERACTIVE_JOB_MAX_ATTEMPTS));
  const deadlineAt = input.deadlineAt ?? new Date(now.getTime() + INTERACTIVE_JOB_DEADLINE_MS);
  db.prepare(
    `INSERT INTO interactive_generation_jobs (
      id, project_id, session_id, kind, expected_turn, turn_id, choice_id, generation_token,
      status, attempt, max_attempts, deadline_at, lease_token, lease_expires_at, next_attempt_at,
      last_error, created_at, updated_at, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL)`,
  ).run(
    id,
    input.projectId,
    input.sessionId,
    input.kind,
    input.expectedTurn,
    input.turnId ?? null,
    input.choiceId ?? null,
    input.generationToken ?? null,
    maxAttempts,
    timestamp(deadlineAt),
    timestamp(now),
    timestamp(now),
  );
  return id;
}

export function completeInteractiveGenerationJob(
  db: Database.Database,
  jobId: string,
  leaseToken?: string,
  completedAt = new Date(),
): boolean {
  const result = leaseToken
    ? db.prepare(
      `UPDATE interactive_generation_jobs
       SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL,
           next_attempt_at = NULL, last_error = NULL, updated_at = ?, completed_at = ?
       WHERE id = ? AND status = 'running' AND lease_token = ?`,
    ).run(timestamp(completedAt), timestamp(completedAt), jobId, leaseToken)
    : db.prepare(
      `UPDATE interactive_generation_jobs
       SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL,
           next_attempt_at = NULL, last_error = NULL, updated_at = ?, completed_at = ?
       WHERE id = ? AND status = 'queued'`,
    ).run(timestamp(completedAt), timestamp(completedAt), jobId);
  return result.changes === 1;
}

export function assertInteractiveGenerationJobLease(db: Database.Database, jobId: string, leaseToken: string): InteractiveGenerationJob {
  const row = requireJobRow(db, jobId);
  if (row.status !== "running" || row.lease_token !== leaseToken) {
    throw new AuthoringError("CONFLICT", "Interactive generation job lease is stale", { jobId });
  }
  if (row.lease_expires_at && Date.parse(row.lease_expires_at) <= Date.now()) {
    throw new AuthoringError("CONFLICT", "Interactive generation job lease has expired", { jobId });
  }
  return toJob(row);
}

export function cancelInteractiveGenerationJobs(
  db: Database.Database,
  projectId: string,
  sessionId: string,
  errorMessage: string,
  canceledAt = new Date(),
): number {
  const result = db.prepare(
    `UPDATE interactive_generation_jobs
     SET status = 'canceled', lease_token = NULL, lease_expires_at = NULL,
         next_attempt_at = NULL, last_error = ?, updated_at = ?, completed_at = ?
     WHERE project_id = ? AND session_id = ? AND status IN ('queued', 'running')`,
  ).run(errorMessage, timestamp(canceledAt), timestamp(canceledAt), projectId, sessionId);
  return result.changes;
}

export function failInteractiveGenerationJob(
  db: Database.Database,
  jobId: string,
  errorMessage: string,
  failedAt = new Date(),
): boolean {
  const value = timestamp(failedAt);
  const result = db.prepare(
    `UPDATE interactive_generation_jobs
     SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
         next_attempt_at = NULL, last_error = ?, updated_at = ?, completed_at = ?
     WHERE id = ? AND status IN ('queued', 'running')`,
  ).run(errorMessage, value, value, jobId);
  return result.changes === 1;
}

function recoverExpiredJobs(db: Database.Database, now: Date): number {
  const nowValue = timestamp(now);
  const result = db.prepare(
    `UPDATE interactive_generation_jobs
     SET status = CASE WHEN attempt < max_attempts AND deadline_at > ? THEN 'queued' ELSE 'failed' END,
         lease_token = NULL, lease_expires_at = NULL,
         next_attempt_at = CASE WHEN attempt < max_attempts AND deadline_at > ? THEN ? ELSE NULL END,
         last_error = CASE WHEN attempt < max_attempts AND deadline_at > ? THEN 'Generation worker lease expired; queued for recovery.' ELSE 'Generation job exceeded its retry deadline.' END,
         updated_at = ?, completed_at = CASE WHEN attempt < max_attempts AND deadline_at > ? THEN completed_at ELSE ? END
    WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`,
  ).run(nowValue, nowValue, nowValue, nowValue, nowValue, nowValue, nowValue, nowValue);
  const expiredQueued = db.prepare(
    `UPDATE interactive_generation_jobs
     SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
         next_attempt_at = NULL, last_error = 'Generation job exceeded its retry deadline.',
         updated_at = ?, completed_at = ?
     WHERE status = 'queued' AND deadline_at <= ?`,
  ).run(nowValue, nowValue, nowValue);
  return result.changes + expiredQueued.changes;
}

function claimRow(db: Database.Database, row: InteractiveGenerationJobRow, now: Date): InteractiveGenerationJobClaim | null {
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + INTERACTIVE_JOB_LEASE_MS);
  const nowValue = timestamp(now);
  const result = db.prepare(
    `UPDATE interactive_generation_jobs
     SET status = 'running', attempt = attempt + 1, lease_token = ?, lease_expires_at = ?,
         next_attempt_at = NULL, last_error = NULL, updated_at = ?, started_at = COALESCE(started_at, ?)
     WHERE id = ? AND status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       AND deadline_at > ?`,
  ).run(leaseToken, timestamp(leaseExpiresAt), nowValue, nowValue, row.id, nowValue, nowValue);
  if (result.changes !== 1) return null;
  return { ...toJob(requireJobRow(db, row.id)), leaseToken };
}

export class BetterSqliteInteractiveJobRepository implements InteractiveJobRepository {
  private readonly db: Database.Database;
  private readonly databaseLease: ReturnType<typeof acquireAuthoringDatabase>;

  constructor(options: AuthoringDatabaseOptions = {}) {
    this.databaseLease = acquireAuthoringDatabase(options);
    this.db = this.databaseLease.database;
  }

  public async listForSession(projectId: string, sessionId: string): Promise<InteractiveGenerationJob[]> {
    const rows = this.db
      .prepare("SELECT * FROM interactive_generation_jobs WHERE project_id = ? AND session_id = ? ORDER BY created_at ASC, id ASC")
      .all(projectId, sessionId) as InteractiveGenerationJobRow[];
    return rows.map(toJob);
  }

  public async claimForSession(projectId: string, sessionId: string, now = new Date()): Promise<InteractiveGenerationJobClaim | null> {
    const claim = this.db.transaction(() => {
      recoverExpiredJobs(this.db, now);
      const row = this.db.prepare(
        `SELECT * FROM interactive_generation_jobs
         WHERE project_id = ? AND session_id = ? AND status = 'queued'
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY created_at ASC, id ASC LIMIT 1`,
      ).get(projectId, sessionId, timestamp(now)) as InteractiveGenerationJobRow | undefined;
      return row ? claimRow(this.db, row, now) : null;
    });
    return claim();
  }

  public async claimNext(now = new Date()): Promise<InteractiveGenerationJobClaim | null> {
    const claim = this.db.transaction(() => {
      recoverExpiredJobs(this.db, now);
      const row = this.db.prepare(
        `SELECT * FROM interactive_generation_jobs
         WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY created_at ASC, id ASC LIMIT 1`,
      ).get(timestamp(now)) as InteractiveGenerationJobRow | undefined;
      return row ? claimRow(this.db, row, now) : null;
    });
    return claim();
  }

  public async get(projectId: string, jobId: string): Promise<InteractiveGenerationJob> {
    const row = this.db.prepare("SELECT * FROM interactive_generation_jobs WHERE id = ? AND project_id = ?").get(jobId, projectId) as InteractiveGenerationJobRow | undefined;
    if (!row) throw new AuthoringError("NOT_FOUND", "Interactive generation job not found", { jobId });
    return toJob(row);
  }

  public async complete(claim: InteractiveGenerationJobClaim, completedAt = new Date()): Promise<boolean> {
    return completeInteractiveGenerationJob(this.db, claim.id, claim.leaseToken, completedAt);
  }

  public async fail(
    claim: InteractiveGenerationJobClaim,
    errorMessage: string,
    retryable: boolean,
    failedAt = new Date(),
  ): Promise<InteractiveGenerationJobFailure> {
    const fail = this.db.transaction(() => {
      const current = requireJobRow(this.db, claim.id);
      if (current.status !== "running" || current.lease_token !== claim.leaseToken) return { row: current, accepted: false };
      const failedAtValue = timestamp(failedAt);
      const shouldRetry = retryable && current.attempt < current.max_attempts && current.deadline_at > failedAtValue;
      const result = this.db.prepare(
        `UPDATE interactive_generation_jobs
         SET status = ?, lease_token = NULL, lease_expires_at = NULL,
             next_attempt_at = ?, last_error = ?, updated_at = ?, completed_at = ?
         WHERE id = ? AND status = 'running' AND lease_token = ?`,
      ).run(shouldRetry ? "queued" : "failed", shouldRetry ? failedAtValue : null, errorMessage, failedAtValue, shouldRetry ? null : failedAtValue, claim.id, claim.leaseToken);
      return { row: requireJobRow(this.db, claim.id), accepted: result.changes === 1 };
    });
    const result = fail();
    return { ...toJob(result.row), accepted: result.accepted };
  }

  public async cancelForSession(projectId: string, sessionId: string, errorMessage: string, canceledAt = new Date()): Promise<number> {
    return cancelInteractiveGenerationJobs(this.db, projectId, sessionId, errorMessage, canceledAt);
  }

  public async recover(now = new Date()): Promise<number> {
    const recover = this.db.transaction(() => recoverExpiredJobs(this.db, now));
    return recover();
  }

  public close(): void {
    this.databaseLease.release();
  }
}

export interface InteractiveJobRepository {
  listForSession(projectId: string, sessionId: string): Promise<InteractiveGenerationJob[]>;
  claimForSession(projectId: string, sessionId: string, now?: Date): Promise<InteractiveGenerationJobClaim | null>;
  claimNext(now?: Date): Promise<InteractiveGenerationJobClaim | null>;
  get(projectId: string, jobId: string): Promise<InteractiveGenerationJob>;
  complete(claim: InteractiveGenerationJobClaim, completedAt?: Date): Promise<boolean>;
  fail(claim: InteractiveGenerationJobClaim, errorMessage: string, retryable: boolean, failedAt?: Date): Promise<InteractiveGenerationJobFailure>;
  cancelForSession(projectId: string, sessionId: string, errorMessage: string, canceledAt?: Date): Promise<number>;
  recover(now?: Date): Promise<number>;
  close(): void;
}

export function createInteractiveJobRepository(options: AuthoringDatabaseOptions = {}): InteractiveJobRepository {
  return new BetterSqliteInteractiveJobRepository(options);
}
