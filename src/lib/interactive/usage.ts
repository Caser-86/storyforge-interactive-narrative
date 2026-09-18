import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { acquireAuthoringDatabase } from "@/lib/authoring/database";
import { AuthoringError } from "@/lib/authoring/errors";
import { DEFAULT_OPENAI_MODEL } from "@/lib/authoring/generation/defaults";
import { classifyProviderError } from "@/lib/authoring/generation/provider-errors";
import { redactSensitiveText } from "@/lib/errors";
import { readIntEnv } from "@/lib/env";
import type { AuthoringDatabaseOptions } from "@/lib/authoring/database";
import type { GenerationProvider, ProviderResult, StructuredGenerationRequest } from "@/lib/authoring/generation/provider";

export type InteractiveUsageCallKind = "scene" | "ending-repair";
export type InteractiveUsageStatus = "reserved" | "succeeded" | "unknown" | "canceled";

export interface InteractiveSessionBudget {
  limit: number | null;
  reserved: number;
  consumed: number;
  unknown: number;
}

export interface InteractiveUsageRecord {
  id: string;
  projectId: string;
  sessionId: string;
  taskId: string;
  taskAttempt: number;
  callIndex: number;
  kind: InteractiveUsageCallKind;
  model: string;
  requestId: string | null;
  status: InteractiveUsageStatus;
  reservedOutputTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type InteractiveUsageReservation = InteractiveUsageRecord & { status: "reserved" };

type InteractiveUsageRow = {
  id: string;
  project_id: string;
  session_id: string;
  task_id: string;
  task_attempt: number;
  call_index: number;
  kind: InteractiveUsageCallKind;
  model: string;
  request_id: string | null;
  status: InteractiveUsageStatus;
  reserved_output_tokens: number;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export interface ReserveInteractiveUsageInput {
  projectId: string;
  sessionId: string;
  taskId: string;
  taskAttempt: number;
  callIndex: number;
  kind: InteractiveUsageCallKind;
  model: string;
  reservedOutputTokens: number;
  now?: Date;
}

export interface CompleteInteractiveUsageInput {
  requestId?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  completedAt?: Date;
}

export interface FailInteractiveUsageInput {
  code: string;
  message: string;
  completedAt?: Date;
}

function timestamp(value: Date): string {
  return value.toISOString();
}

function safeUsageErrorMessage(value: string): string {
  return redactSensitiveText(value).slice(0, 500);
}

export function configuredInteractiveOutputBudget(): number | null {
  const value = readIntEnv("STORYFORGE_MAX_OUTPUT_TOKENS", 0, { min: 1, max: 2_000_000 });
  return value > 0 ? value : null;
}

function toRecord(row: InteractiveUsageRow): InteractiveUsageRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    taskAttempt: row.task_attempt,
    callIndex: row.call_index,
    kind: row.kind,
    model: row.model,
    requestId: row.request_id,
    status: row.status,
    reservedOutputTokens: row.reserved_output_tokens,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    latencyMs: row.latency_ms,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function requireUsage(db: Database.Database, id: string): InteractiveUsageRow {
  const row = db.prepare("SELECT * FROM interactive_generation_usage WHERE id = ?").get(id) as InteractiveUsageRow | undefined;
  if (!row) throw new AuthoringError("NOT_FOUND", "Interactive usage record not found", { id });
  return row;
}

function requireSessionBudget(db: Database.Database, projectId: string, sessionId: string): InteractiveSessionBudget {
  const row = db.prepare(
    "SELECT output_budget_limit, output_budget_reserved, output_budget_consumed, output_budget_unknown FROM interactive_sessions WHERE id = ? AND project_id = ?",
  ).get(sessionId, projectId) as {
    output_budget_limit: number | null;
    output_budget_reserved: number;
    output_budget_consumed: number;
    output_budget_unknown: number;
  } | undefined;
  if (!row) throw new AuthoringError("NOT_FOUND", "Interactive session not found", { sessionId });
  return {
    limit: row.output_budget_limit,
    reserved: row.output_budget_reserved,
    consumed: row.output_budget_consumed,
    unknown: row.output_budget_unknown,
  };
}

export class BetterSqliteInteractiveUsageRepository implements InteractiveUsageRepository {
  private readonly db: Database.Database;
  private readonly databaseLease: ReturnType<typeof acquireAuthoringDatabase>;

  constructor(options: AuthoringDatabaseOptions = {}) {
    this.databaseLease = acquireAuthoringDatabase(options);
    this.db = this.databaseLease.database;
  }

  public async reserve(input: ReserveInteractiveUsageInput): Promise<InteractiveUsageReservation> {
    if (!Number.isInteger(input.taskAttempt) || input.taskAttempt < 1 || !Number.isInteger(input.callIndex) || input.callIndex < 1) {
      throw new AuthoringError("VALIDATION", "Interactive usage attempt and call index must be positive integers.");
    }
    if (!Number.isInteger(input.reservedOutputTokens) || input.reservedOutputTokens < 0) {
      throw new AuthoringError("VALIDATION", "Reserved output tokens must be a non-negative integer.");
    }
    const reserve = this.db.transaction(() => {
      const budget = requireSessionBudget(this.db, input.projectId, input.sessionId);
      const totalCommitted = budget.reserved + budget.consumed + budget.unknown;
      if (budget.limit !== null && totalCommitted + input.reservedOutputTokens > budget.limit) {
        throw new AuthoringError("VALIDATION", "本次互动写作已达到输出 token 预算上限，请提高 STORYFORGE_MAX_OUTPUT_TOKENS 后重新开始。", {
          limit: budget.limit,
          committed: totalCommitted,
          requested: input.reservedOutputTokens,
        });
      }

      const now = input.now ?? new Date();
      const nowValue = timestamp(now);
      const id = randomUUID();
      this.db.prepare(
        `INSERT INTO interactive_generation_usage (
          id, project_id, session_id, task_id, task_attempt, call_index, kind, model, request_id,
          status, reserved_output_tokens, input_tokens, output_tokens, latency_ms, error_code,
          error_message, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'reserved', ?, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
      ).run(id, input.projectId, input.sessionId, input.taskId, input.taskAttempt, input.callIndex, input.kind, input.model, input.reservedOutputTokens, nowValue, nowValue);
      this.db.prepare("UPDATE interactive_sessions SET output_budget_reserved = output_budget_reserved + ?, updated_at = ? WHERE id = ? AND project_id = ?").run(input.reservedOutputTokens, nowValue, input.sessionId, input.projectId);
      return toRecord(requireUsage(this.db, id)) as InteractiveUsageReservation;
    });
    return reserve();
  }

  public async complete(reservation: InteractiveUsageReservation, input: CompleteInteractiveUsageInput): Promise<boolean> {
    if (!Number.isInteger(input.inputTokens) || input.inputTokens < 0 || !Number.isInteger(input.outputTokens) || input.outputTokens < 0 || !Number.isInteger(input.latencyMs) || input.latencyMs < 0) {
      throw new AuthoringError("VALIDATION", "Provider usage values must be non-negative integers.");
    }
    const complete = this.db.transaction(() => {
      const current = requireUsage(this.db, reservation.id);
      if (current.status !== "reserved") return false;
      const completedAt = input.completedAt ?? new Date();
      const value = timestamp(completedAt);
      const result = this.db.prepare(
        `UPDATE interactive_generation_usage
         SET status = 'succeeded', request_id = ?, input_tokens = ?, output_tokens = ?, latency_ms = ?,
             updated_at = ?, completed_at = ?
         WHERE id = ? AND status = 'reserved'`,
      ).run(input.requestId ?? null, input.inputTokens, input.outputTokens, input.latencyMs, value, value, reservation.id);
      if (result.changes !== 1) return false;
      this.db.prepare(
        `UPDATE interactive_sessions
         SET output_budget_reserved = MAX(0, output_budget_reserved - ?),
             output_budget_consumed = output_budget_consumed + ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
      ).run(current.reserved_output_tokens, input.outputTokens, value, reservation.sessionId, reservation.projectId);
      return true;
    });
    return complete();
  }

  public async fail(reservation: InteractiveUsageReservation, input: FailInteractiveUsageInput): Promise<boolean> {
    const fail = this.db.transaction(() => {
      const current = requireUsage(this.db, reservation.id);
      if (current.status !== "reserved") return false;
      const completedAt = input.completedAt ?? new Date();
      const value = timestamp(completedAt);
      const result = this.db.prepare(
        `UPDATE interactive_generation_usage
         SET status = 'unknown', error_code = ?, error_message = ?,
             updated_at = ?, completed_at = ?
         WHERE id = ? AND status = 'reserved'`,
      ).run(input.code, input.message, value, value, reservation.id);
      if (result.changes !== 1) return false;
      this.db.prepare(
        `UPDATE interactive_sessions
         SET output_budget_reserved = MAX(0, output_budget_reserved - ?),
             output_budget_unknown = output_budget_unknown + ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
      ).run(current.reserved_output_tokens, current.reserved_output_tokens, value, reservation.sessionId, reservation.projectId);
      return true;
    });
    return fail();
  }

  public async listForSession(projectId: string, sessionId: string): Promise<InteractiveUsageRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM interactive_generation_usage WHERE project_id = ? AND session_id = ? ORDER BY created_at ASC, id ASC",
    ).all(projectId, sessionId) as InteractiveUsageRow[];
    return rows.map(toRecord);
  }

  public async getSessionBudget(projectId: string, sessionId: string): Promise<InteractiveSessionBudget> {
    return requireSessionBudget(this.db, projectId, sessionId);
  }

  public close(): void {
    this.databaseLease.release();
  }
}

export interface InteractiveUsageRepository {
  reserve(input: ReserveInteractiveUsageInput): Promise<InteractiveUsageReservation>;
  complete(reservation: InteractiveUsageReservation, input: CompleteInteractiveUsageInput): Promise<boolean>;
  fail(reservation: InteractiveUsageReservation, input: FailInteractiveUsageInput): Promise<boolean>;
  listForSession(projectId: string, sessionId: string): Promise<InteractiveUsageRecord[]>;
  getSessionBudget(projectId: string, sessionId: string): Promise<InteractiveSessionBudget>;
  close(): void;
}

export type InteractiveUsageProviderOptions = {
  databaseOptions?: AuthoringDatabaseOptions;
  projectId: string;
  sessionId: string;
  taskId: string;
  taskAttempt: number;
};

export class InteractiveUsageProvider implements GenerationProvider {
  private readonly usage: InteractiveUsageRepository;
  private readonly provider: GenerationProvider;
  private readonly options: InteractiveUsageProviderOptions;
  private callIndex = 0;

  constructor(provider: GenerationProvider, options: InteractiveUsageProviderOptions) {
    this.provider = provider;
    this.options = options;
    this.usage = createInteractiveUsageRepository(options.databaseOptions);
  }

  public async generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>> {
    if (request.signal?.aborted) throw new DOMException("Generation canceled", "AbortError");
    const reservation = await this.usage.reserve({
      projectId: this.options.projectId,
      sessionId: this.options.sessionId,
      taskId: this.options.taskId,
      taskAttempt: this.options.taskAttempt,
      callIndex: ++this.callIndex,
      kind: request.stepKey.includes("ending-repair") ? "ending-repair" : "scene",
      model: request.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      reservedOutputTokens: request.maxTokens ?? 0,
    });
    try {
      const result = await this.provider.generate(request);
      if (result.usageConfirmed === false) {
        await this.usage.fail(reservation, {
          code: "USAGE_UNKNOWN",
          message: "Provider did not report confirmed token usage.",
        });
        return result;
      }
      await this.usage.complete(reservation, {
        requestId: result.requestId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
      });
      return result;
    } catch (error) {
      const classified = classifyProviderError(error);
      await this.usage.fail(reservation, { code: classified.code, message: safeUsageErrorMessage(classified.message) });
      throw error;
    }
  }

  public close(): void {
    this.usage.close();
  }
}

export function createInteractiveUsageRepository(options: AuthoringDatabaseOptions = {}): InteractiveUsageRepository {
  return new BetterSqliteInteractiveUsageRepository(options);
}
