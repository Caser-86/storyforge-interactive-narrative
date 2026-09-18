import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { acquireAuthoringDatabase } from "./database";
import type { AuthoringDatabaseOptions } from "./database";
import { AuthoringError } from "./errors";
import { redactSensitiveText } from "../errors";

export type AuthorEndingUsageStatus = "reserved" | "succeeded" | "failed" | "unknown";

export interface AuthorEndingUsageRecord {
  id: string;
  projectId: string;
  versionId: string;
  sourceNodeId: string;
  model: string;
  status: AuthorEndingUsageStatus;
  reservedOutputTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  requestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type AuthorEndingUsageReservation = AuthorEndingUsageRecord & { status: "reserved" };

export const AUTHOR_ENDING_USAGE_STALE_MS = 30 * 60 * 1000;

type AuthorEndingUsageRow = {
  id: string;
  project_id: string;
  version_id: string;
  source_node_id: string;
  model: string;
  status: AuthorEndingUsageStatus;
  reserved_output_tokens: number;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  request_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export interface ReserveAuthorEndingUsageInput {
  projectId: string;
  versionId: string;
  sourceNodeId: string;
  model: string;
  reservedOutputTokens: number;
  now?: Date;
}

export interface CompleteAuthorEndingUsageInput {
  requestId?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  usageConfirmed?: boolean;
  completedAt?: Date;
}

export interface FailAuthorEndingUsageInput {
  code: string;
  message: string;
  unknown?: boolean;
  completedAt?: Date;
}

function timestamp(value: Date): string {
  return value.toISOString();
}

function safeErrorMessage(value: string): string {
  return redactSensitiveText(value).slice(0, 500);
}

function toRecord(row: AuthorEndingUsageRow): AuthorEndingUsageRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id,
    sourceNodeId: row.source_node_id,
    model: row.model,
    status: row.status,
    reservedOutputTokens: row.reserved_output_tokens,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    latencyMs: row.latency_ms,
    requestId: row.request_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function requireUsage(db: Database.Database, id: string): AuthorEndingUsageRow {
  const row = db.prepare("SELECT * FROM author_ending_generation_usage WHERE id = ?").get(id) as AuthorEndingUsageRow | undefined;
  if (!row) throw new AuthoringError("NOT_FOUND", "Author ending usage record not found", { id });
  return row;
}

export function reconcileStaleAuthorEndingUsage(db: Database.Database, now = new Date()): number {
  const completedAt = timestamp(now);
  const staleBefore = timestamp(new Date(now.getTime() - AUTHOR_ENDING_USAGE_STALE_MS));
  const result = db.prepare(
    `UPDATE author_ending_generation_usage
     SET status = 'unknown', error_code = 'LEASE_EXPIRED',
         error_message = 'Author ending generation reservation expired before settlement.',
         updated_at = ?, completed_at = ?
     WHERE status = 'reserved' AND created_at < ?`,
  ).run(completedAt, completedAt, staleBefore);
  return result.changes;
}

function validateNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new AuthoringError("VALIDATION", `${label} must be a non-negative integer.`);
  }
}

export interface AuthorEndingUsageRepository {
  reserve(input: ReserveAuthorEndingUsageInput): Promise<AuthorEndingUsageReservation>;
  complete(reservation: AuthorEndingUsageReservation, input: CompleteAuthorEndingUsageInput): Promise<boolean>;
  fail(reservation: AuthorEndingUsageReservation, input: FailAuthorEndingUsageInput): Promise<boolean>;
  listForProject(projectId: string): Promise<AuthorEndingUsageRecord[]>;
  close(): void;
}

export class BetterSqliteAuthorEndingUsageRepository implements AuthorEndingUsageRepository {
  private readonly db: Database.Database;
  private readonly databaseLease: ReturnType<typeof acquireAuthoringDatabase>;

  constructor(options: AuthoringDatabaseOptions = {}) {
    this.databaseLease = acquireAuthoringDatabase(options);
    this.db = this.databaseLease.database;
  }

  public async reserve(input: ReserveAuthorEndingUsageInput): Promise<AuthorEndingUsageReservation> {
    validateNonNegativeInteger(input.reservedOutputTokens, "Reserved output tokens");
    if (!input.model.trim()) throw new AuthoringError("VALIDATION", "Model is required for author ending usage.");
    const nowValue = timestamp(input.now ?? new Date());
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO author_ending_generation_usage (
        id, project_id, version_id, source_node_id, model, status,
        reserved_output_tokens, input_tokens, output_tokens, latency_ms, request_id,
        error_code, error_message, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'reserved', ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
    ).run(id, input.projectId, input.versionId, input.sourceNodeId, input.model, input.reservedOutputTokens, nowValue, nowValue);
    return toRecord(requireUsage(this.db, id)) as AuthorEndingUsageReservation;
  }

  public async complete(reservation: AuthorEndingUsageReservation, input: CompleteAuthorEndingUsageInput): Promise<boolean> {
    validateNonNegativeInteger(input.inputTokens, "Input tokens");
    validateNonNegativeInteger(input.outputTokens, "Output tokens");
    validateNonNegativeInteger(input.latencyMs, "Latency");
    const complete = this.db.transaction(() => {
      const current = requireUsage(this.db, reservation.id);
      if (current.status !== "reserved") return false;
      const completedAt = input.completedAt ?? new Date();
      const value = timestamp(completedAt);
      const usageConfirmed = input.usageConfirmed !== false;
      const result = this.db.prepare(
        `UPDATE author_ending_generation_usage
         SET status = ?, request_id = ?, input_tokens = ?, output_tokens = ?, latency_ms = ?,
             error_code = ?, error_message = ?, updated_at = ?, completed_at = ?
         WHERE id = ? AND status = 'reserved'`,
      ).run(
        usageConfirmed ? "succeeded" : "unknown",
        input.requestId ?? null,
        usageConfirmed ? input.inputTokens : null,
        usageConfirmed ? input.outputTokens : null,
        input.latencyMs,
        usageConfirmed ? null : "USAGE_UNKNOWN",
        usageConfirmed ? null : "Provider did not report confirmed token usage.",
        value,
        value,
        reservation.id,
      );
      return result.changes === 1;
    });
    return complete();
  }

  public async fail(reservation: AuthorEndingUsageReservation, input: FailAuthorEndingUsageInput): Promise<boolean> {
    const fail = this.db.transaction(() => {
      const current = requireUsage(this.db, reservation.id);
      if (current.status !== "reserved") return false;
      const completedAt = input.completedAt ?? new Date();
      const value = timestamp(completedAt);
      const result = this.db.prepare(
        `UPDATE author_ending_generation_usage
         SET status = ?, error_code = ?, error_message = ?, updated_at = ?, completed_at = ?
         WHERE id = ? AND status = 'reserved'`,
      ).run(input.unknown ? "unknown" : "failed", input.code, safeErrorMessage(input.message), value, value, reservation.id);
      return result.changes === 1;
    });
    return fail();
  }

  public async listForProject(projectId: string): Promise<AuthorEndingUsageRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM author_ending_generation_usage WHERE project_id = ? ORDER BY created_at ASC, id ASC",
    ).all(projectId) as AuthorEndingUsageRow[];
    return rows.map(toRecord);
  }

  public close(): void {
    this.databaseLease.release();
  }
}

export function createAuthorEndingUsageRepository(options: AuthoringDatabaseOptions = {}): AuthorEndingUsageRepository {
  return new BetterSqliteAuthorEndingUsageRepository(options);
}
