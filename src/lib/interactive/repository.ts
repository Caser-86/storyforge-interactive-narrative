import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { acquireAuthoringDatabase } from "@/lib/authoring/database";
import { AuthoringError } from "@/lib/authoring/errors";
import { readIntEnv } from "@/lib/env";
import type { AuthoringDatabaseOptions } from "@/lib/authoring/database";
import {
  assertInteractiveGenerationJobLease,
  cancelInteractiveGenerationJobs,
  completeInteractiveGenerationJob,
  failInteractiveGenerationJob,
  insertInteractiveGenerationJob,
  type InteractiveGenerationJobClaim,
  type InteractiveGenerationJob,
} from "./jobs";
import { configuredInteractiveOutputBudget } from "./usage";
import {
  InteractiveSceneSchema,
  InteractiveSessionSchema,
  InteractiveSessionSummarySchema,
  InteractiveStateSchema,
  type InteractiveChoice,
  type InteractiveScene,
  type InteractiveSession,
  type InteractiveSessionSummary,
  type InteractiveState,
  InteractiveTurnRecordSchema,
  type InteractiveTurnRecord,
} from "./schemas";
import { INTERACTIVE_GENERATION_MAX_ATTEMPTS } from "./retry";

type SessionRow = {
  id: string;
  project_id: string;
  status: InteractiveSession["status"];
  turn: number;
  target_turns: number;
  state_json: string;
  current_turn_id: string | null;
  last_error: string | null;
  materialized_version_id: string | null;
  generation_token: string | null;
  output_budget_limit: number | null;
  output_budget_reserved: number;
  output_budget_consumed: number;
  output_budget_unknown: number;
  created_at: string;
  updated_at: string;
};

type TurnRow = {
  id: string;
  session_id: string;
  turn: number;
  scene_json: string;
  selected_choice_id: string | null;
  selected_at: string | null;
  created_at: string;
};

export interface InteractiveRepository {
  createSession(projectId: string, state: InteractiveState): Promise<InteractiveSession>;
  getSession(projectId: string, sessionId: string): Promise<InteractiveSession>;
  listSessions(projectId: string): Promise<InteractiveSession[]>;
  listSessionSummaries(projectId: string, options?: { limit?: number; cursor?: string | null }): Promise<{ sessions: InteractiveSessionSummary[]; nextCursor: string | null }>;
  deleteSession(projectId: string, sessionId: string): Promise<void>;
  listTurns(projectId: string, sessionId: string): Promise<InteractiveTurnRecord[]>;
  saveInitialScene(sessionId: string, scene: InteractiveScene, state: InteractiveState, jobClaim?: InteractiveGenerationJobClaim): Promise<InteractiveSession>;
  claimChoice(projectId: string, sessionId: string, choiceId: string, expectedTurn: number): Promise<InteractiveGenerationClaim & { session: InteractiveSession; choice: InteractiveChoice; scene: InteractiveScene }>;
  saveNextScene(sessionId: string, claim: InteractiveGenerationClaim, scene: InteractiveScene, state: InteractiveState, jobClaim?: InteractiveGenerationJobClaim): Promise<InteractiveSession>;
  releaseChoice(claim: InteractiveGenerationClaim, errorMessage?: string): Promise<void>;
  recoverStaleGeneration(sessionId: string, staleAfterMs?: number): Promise<void>;
  failInitialGeneration(sessionId: string, message: string, jobClaim?: InteractiveGenerationJobClaim): Promise<void>;
  cancelGeneration(projectId: string, sessionId: string, message?: string): Promise<void>;
  close(): void;
}

export type InteractiveGenerationClaim = {
  sessionId: string;
  generationToken: string;
  turnId: string;
  choiceId: string;
  jobId: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

type InteractiveSessionCursor = { updatedAt: string; id: string };

function encodeSessionCursor(value: InteractiveSessionCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeSessionCursor(value: string): InteractiveSessionCursor {
  if (value.length > 256) throw new AuthoringError("VALIDATION", "Interactive session cursor is too long.");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<InteractiveSessionCursor>;
    if (typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string" || parsed.updatedAt.length === 0 || parsed.id.length === 0) throw new Error("invalid cursor");
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw new AuthoringError("VALIDATION", "Interactive session cursor is invalid.");
  }
}

function defaultStaleGenerationMs(): number {
  const timeoutMs = readIntEnv("OPENAI_TIMEOUT_MS", 180_000, { min: 1 });
  return timeoutMs * INTERACTIVE_GENERATION_MAX_ATTEMPTS + 60_000;
}

function parseState(value: string): InteractiveState {
  return InteractiveStateSchema.parse(JSON.parse(value));
}

function parseScene(value: string): InteractiveScene {
  return InteractiveSceneSchema.parse(JSON.parse(value));
}

function generationProgress(job: InteractiveGenerationJob | null | undefined): InteractiveSession["generation"] {
  if (!job) return undefined;
  return {
    kind: job.kind,
    status: job.status,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    deadlineAt: job.deadlineAt,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    lastError: job.lastError,
  };
}

function toSession(row: SessionRow, scene: InteractiveScene | null, job?: InteractiveGenerationJob | null): InteractiveSession {
  return InteractiveSessionSchema.parse({
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    turn: row.turn,
    targetTurns: row.target_turns,
    state: parseState(row.state_json),
    scene,
    lastError: row.last_error,
    materializedVersionId: row.materialized_version_id,
    budget: {
      limit: row.output_budget_limit,
      reserved: row.output_budget_reserved,
      consumed: row.output_budget_consumed,
      unknown: row.output_budget_unknown,
    },
    generation: generationProgress(job),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class BetterSqliteInteractiveRepository implements InteractiveRepository {
  private readonly db: Database.Database;
  private readonly databaseLease: ReturnType<typeof acquireAuthoringDatabase>;

  constructor(options: AuthoringDatabaseOptions = {}) {
    this.databaseLease = acquireAuthoringDatabase(options);
    this.db = this.databaseLease.database;
  }

  public async createSession(projectId: string, state: InteractiveState): Promise<InteractiveSession> {
    const timestamp = nowIso();
    const id = randomUUID();
    const create = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO interactive_sessions (id, project_id, status, turn, target_turns, state_json, current_turn_id, last_error, generation_token, created_at, updated_at)
           VALUES (?, ?, 'generating', 0, ?, ?, NULL, NULL, NULL, ?, ?)`,
        )
        .run(id, projectId, state.targetTurns, JSON.stringify(state), timestamp, timestamp);
      this.db.prepare("UPDATE interactive_sessions SET output_budget_limit = ? WHERE id = ?").run(configuredInteractiveOutputBudget(), id);
      insertInteractiveGenerationJob(this.db, {
        projectId,
        sessionId: id,
        kind: "opening",
        expectedTurn: 0,
        now: new Date(timestamp),
      });
    });
    create();
    return this.getSession(projectId, id);
  }

  public async getSession(projectId: string, sessionId: string): Promise<InteractiveSession> {
    const row = this.db
      .prepare("SELECT * FROM interactive_sessions WHERE id = ? AND project_id = ?")
      .get(sessionId, projectId) as SessionRow | undefined;
    if (!row) throw new AuthoringError("NOT_FOUND", "Interactive session not found", { sessionId });

    const turn = row.current_turn_id
      ? this.db.prepare("SELECT * FROM interactive_turns WHERE id = ?").get(row.current_turn_id) as TurnRow | undefined
      : undefined;
    const job = this.db.prepare("SELECT * FROM interactive_generation_jobs WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(sessionId) as Record<string, unknown> | undefined;
    return toSession(row, turn ? parseScene(turn.scene_json) : null, job ? this.readGenerationJob(job) : null);
  }

  public async listSessions(projectId: string): Promise<InteractiveSession[]> {
    const rows = this.db
      .prepare("SELECT * FROM interactive_sessions WHERE project_id = ? ORDER BY updated_at DESC, rowid DESC")
      .all(projectId) as SessionRow[];
    return rows.map((row) => this.readSession(row));
  }

  public async listSessionSummaries(
    projectId: string,
    options: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ sessions: InteractiveSessionSummary[]; nextCursor: string | null }> {
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AuthoringError("VALIDATION", "Interactive session page size must be between 1 and 100.");
    }
    const cursor = options.cursor === undefined || options.cursor === null ? null : decodeSessionCursor(options.cursor);
    const rows = (cursor
      ? this.db.prepare(
        `SELECT id, project_id, status, turn, target_turns, last_error, materialized_version_id, created_at, updated_at
         FROM interactive_sessions
         WHERE project_id = ? AND (updated_at < ? OR (updated_at = ? AND id < ?))
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
      ).all(projectId, cursor.updatedAt, cursor.updatedAt, cursor.id, limit + 1)
      : this.db.prepare(
        `SELECT id, project_id, status, turn, target_turns, last_error, materialized_version_id, created_at, updated_at
         FROM interactive_sessions
         WHERE project_id = ?
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
      ).all(projectId, limit + 1)) as Array<Pick<SessionRow, "id" | "project_id" | "status" | "turn" | "target_turns" | "last_error" | "materialized_version_id" | "created_at" | "updated_at">>;
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map((row) => InteractiveSessionSummarySchema.parse({
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      turn: row.turn,
      targetTurns: row.target_turns,
      lastError: row.last_error,
      materializedVersionId: row.materialized_version_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    return {
      sessions: page,
      nextCursor: hasMore && page.length > 0
        ? encodeSessionCursor({ updatedAt: page[page.length - 1]!.updatedAt, id: page[page.length - 1]!.id })
        : null,
    };
  }

  public async deleteSession(projectId: string, sessionId: string): Promise<void> {
    const result = this.db
      .prepare("DELETE FROM interactive_sessions WHERE id = ? AND project_id = ?")
      .run(sessionId, projectId);
    if (result.changes === 0) throw new AuthoringError("NOT_FOUND", "Interactive session not found", { sessionId });
  }

  public async listTurns(projectId: string, sessionId: string): Promise<InteractiveTurnRecord[]> {
    const session = this.db
      .prepare("SELECT id FROM interactive_sessions WHERE id = ? AND project_id = ?")
      .get(sessionId, projectId) as { id: string } | undefined;
    if (!session) throw new AuthoringError("NOT_FOUND", "Interactive session not found", { sessionId });

    const rows = this.db
      .prepare("SELECT * FROM interactive_turns WHERE session_id = ? ORDER BY turn ASC")
      .all(sessionId) as TurnRow[];
    return rows.map((row) => {
      const scene = parseScene(row.scene_json);
      const selectedChoice = row.selected_choice_id
        ? scene.choices.find((choice) => choice.id === row.selected_choice_id)
        : undefined;
      return InteractiveTurnRecordSchema.parse({
        turn: row.turn,
        scene,
        selectedChoiceId: row.selected_choice_id,
        selectedChoiceLabel: selectedChoice?.label ?? null,
        createdAt: row.created_at,
      });
    });
  }

  public async saveInitialScene(sessionId: string, scene: InteractiveScene, state: InteractiveState, jobClaim?: InteractiveGenerationJobClaim): Promise<InteractiveSession> {
    const save = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.status !== "generating" || session.turn !== 0) {
        throw new AuthoringError("CONFLICT", "Interactive session is not ready for its opening scene", { sessionId });
      }
      if (jobClaim) {
        const job = assertInteractiveGenerationJobLease(this.db, jobClaim.id, jobClaim.leaseToken);
        if (job.sessionId !== sessionId || job.kind !== "opening" || job.expectedTurn !== 0) {
          throw new AuthoringError("CONFLICT", "Interactive opening generation job does not match the session", { sessionId, jobId: jobClaim.id });
        }
      }
      const timestamp = nowIso();
      const turnId = randomUUID();
      this.db
        .prepare("INSERT INTO interactive_turns (id, session_id, turn, scene_json, selected_choice_id, selected_at, created_at) VALUES (?, ?, 1, ?, NULL, NULL, ?)")
        .run(turnId, sessionId, JSON.stringify(scene), timestamp);
      this.db
        .prepare("UPDATE interactive_sessions SET status = ?, turn = 1, state_json = ?, current_turn_id = ?, last_error = NULL, updated_at = ? WHERE id = ?")
        .run(scene.isEnding ? "ended" : "active", JSON.stringify(state), turnId, timestamp, sessionId);
      if (jobClaim) {
        if (!completeInteractiveGenerationJob(this.db, jobClaim.id, jobClaim.leaseToken, new Date(timestamp))) {
          throw new AuthoringError("CONFLICT", "Interactive opening generation job is stale", { sessionId, jobId: jobClaim.id });
        }
      } else {
        const queuedOpening = this.db
          .prepare("SELECT id FROM interactive_generation_jobs WHERE session_id = ? AND kind = 'opening' AND status = 'queued' ORDER BY created_at DESC LIMIT 1")
          .get(sessionId) as { id: string } | undefined;
        if (queuedOpening) completeInteractiveGenerationJob(this.db, queuedOpening.id, undefined, new Date(timestamp));
      }
    });
    save();
    const row = this.requireSession(sessionId);
    return this.readSession(row);
  }

  public async claimChoice(projectId: string, sessionId: string, choiceId: string, expectedTurn: number): Promise<InteractiveGenerationClaim & { session: InteractiveSession; choice: InteractiveChoice; scene: InteractiveScene }> {
    const claim = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.project_id !== projectId) throw new AuthoringError("NOT_FOUND", "Interactive session not found", { sessionId });
      if (session.status !== "active") throw new AuthoringError("CONFLICT", "Interactive session is not accepting choices", { status: session.status });
      if (session.turn !== expectedTurn) throw new AuthoringError("CONFLICT", "当前场景已更新，请刷新后重新选择。", { expectedTurn, actualTurn: session.turn });
      if (!session.current_turn_id) throw new AuthoringError("CONFLICT", "Interactive session has no current scene", { sessionId });

      const turn = this.db.prepare("SELECT * FROM interactive_turns WHERE id = ?").get(session.current_turn_id) as TurnRow | undefined;
      if (!turn) throw new AuthoringError("STORAGE", "Interactive current scene is missing", { sessionId });
      if (turn.selected_choice_id) throw new AuthoringError("CONFLICT", "This scene is already being advanced", { sessionId });

      const scene = parseScene(turn.scene_json);
      const choice = scene.choices.find((candidate) => candidate.id === choiceId);
      if (!choice) throw new AuthoringError("VALIDATION", "Choice is not available in the current scene", { choiceId });

      const timestamp = nowIso();
      const generationToken = randomUUID();
      const turnUpdate = this.db
        .prepare("UPDATE interactive_turns SET selected_choice_id = ?, selected_at = ? WHERE id = ? AND selected_choice_id IS NULL")
        .run(choiceId, timestamp, turn.id);
      if (turnUpdate.changes !== 1) {
        throw new AuthoringError("CONFLICT", "This scene is already being advanced", { sessionId });
      }
      const sessionUpdate = this.db
        .prepare("UPDATE interactive_sessions SET status = 'generating', generation_token = ?, last_error = NULL, updated_at = ? WHERE id = ? AND status = 'active' AND current_turn_id = ?")
        .run(generationToken, timestamp, sessionId, turn.id);
      if (sessionUpdate.changes !== 1) {
        throw new AuthoringError("CONFLICT", "Interactive session is no longer accepting choices", { sessionId });
      }
      const jobId = insertInteractiveGenerationJob(this.db, {
        projectId,
        sessionId,
        kind: "next",
        expectedTurn,
        turnId: turn.id,
        choiceId,
        generationToken,
        now: new Date(timestamp),
      });
      return { session: toSession(session, scene), choice, scene, sessionId, generationToken, turnId: turn.id, choiceId, jobId };
    });
    return claim();
  }

  public async saveNextScene(sessionId: string, claim: InteractiveGenerationClaim, scene: InteractiveScene, state: InteractiveState, jobClaim?: InteractiveGenerationJobClaim): Promise<InteractiveSession> {
    const save = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.status !== "generating" || session.generation_token !== claim.generationToken || session.current_turn_id !== claim.turnId) {
        throw new AuthoringError("CONFLICT", "Interactive session is not generating a next scene", { sessionId });
      }
      if (jobClaim) {
        const job = assertInteractiveGenerationJobLease(this.db, jobClaim.id, jobClaim.leaseToken);
        if (job.sessionId !== sessionId || job.kind !== "next" || job.turnId !== claim.turnId || job.choiceId !== claim.choiceId || job.generationToken !== claim.generationToken) {
          throw new AuthoringError("CONFLICT", "Interactive next-scene generation job does not match the session", { sessionId, jobId: jobClaim.id });
        }
      }
      const currentTurn = this.db.prepare("SELECT * FROM interactive_turns WHERE id = ?").get(claim.turnId) as TurnRow | undefined;
      if (!currentTurn || currentTurn.selected_choice_id !== claim.choiceId) {
        throw new AuthoringError("CONFLICT", "Interactive generation attempt is stale", { sessionId });
      }
      const timestamp = nowIso();
      const turnId = randomUUID();
      const nextTurn = session.turn + 1;
      this.db
        .prepare("INSERT INTO interactive_turns (id, session_id, turn, scene_json, selected_choice_id, selected_at, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)")
        .run(turnId, sessionId, nextTurn, JSON.stringify(scene), timestamp);
      const sessionUpdate = this.db
        .prepare("UPDATE interactive_sessions SET status = ?, turn = ?, state_json = ?, current_turn_id = ?, generation_token = NULL, last_error = NULL, updated_at = ? WHERE id = ? AND status = 'generating' AND current_turn_id = ? AND generation_token = ?")
        .run(scene.isEnding ? "ended" : "active", nextTurn, JSON.stringify(state), turnId, timestamp, sessionId, claim.turnId, claim.generationToken);
      if (sessionUpdate.changes !== 1) {
        throw new AuthoringError("CONFLICT", "Interactive generation attempt is stale", { sessionId });
      }
      if (!completeInteractiveGenerationJob(this.db, claim.jobId, jobClaim?.leaseToken, new Date(timestamp))) {
        throw new AuthoringError("CONFLICT", "Interactive next-scene generation job is stale", { sessionId, jobId: claim.jobId });
      }
    });
    save();
    return this.readSession(this.requireSession(sessionId));
  }

  public async releaseChoice(claim: InteractiveGenerationClaim, errorMessage?: string): Promise<void> {
    const timestamp = nowIso();
    this.db.transaction(() => {
      const session = this.requireSession(claim.sessionId);
      if (session.status !== "generating" || session.generation_token !== claim.generationToken || session.current_turn_id !== claim.turnId) return;
      const turnUpdate = this.db
        .prepare("UPDATE interactive_turns SET selected_choice_id = NULL, selected_at = NULL WHERE id = ? AND selected_choice_id = ?")
        .run(claim.turnId, claim.choiceId);
      if (turnUpdate.changes !== 1) return;
      this.db
        .prepare("UPDATE interactive_sessions SET status = 'active', generation_token = NULL, last_error = ?, updated_at = ? WHERE id = ? AND status = 'generating' AND current_turn_id = ? AND generation_token = ?")
        .run(errorMessage ?? null, timestamp, claim.sessionId, claim.turnId, claim.generationToken);
      failInteractiveGenerationJob(this.db, claim.jobId, errorMessage ?? "Interactive generation failed.", new Date(timestamp));
    })();
  }

  public async recoverStaleGeneration(sessionId: string, staleAfterMs = defaultStaleGenerationMs()): Promise<void> {
    const recover = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.status !== "generating") return;

      const updatedAt = Date.parse(session.updated_at);
      if (Number.isFinite(updatedAt) && Date.now() - updatedAt < staleAfterMs) return;

      const timestamp = nowIso();
      if (!session.current_turn_id) {
        cancelInteractiveGenerationJobs(this.db, session.project_id, sessionId, "Opening generation was interrupted.", new Date(timestamp));
        this.db
          .prepare("UPDATE interactive_sessions SET status = 'failed', generation_token = NULL, last_error = ?, updated_at = ? WHERE id = ?")
          .run("Opening generation was interrupted.", timestamp, sessionId);
        return;
      }

      const turn = this.db
        .prepare("SELECT * FROM interactive_turns WHERE id = ?")
        .get(session.current_turn_id) as TurnRow | undefined;
      if (!turn) {
        cancelInteractiveGenerationJobs(this.db, session.project_id, sessionId, "Current interactive scene is missing.", new Date(timestamp));
        this.db
          .prepare("UPDATE interactive_sessions SET status = 'failed', generation_token = NULL, last_error = ?, updated_at = ? WHERE id = ?")
          .run("Current interactive scene is missing.", timestamp, sessionId);
        return;
      }

      this.db
        .prepare("UPDATE interactive_turns SET selected_choice_id = NULL, selected_at = NULL WHERE id = ?")
        .run(turn.id);
      cancelInteractiveGenerationJobs(this.db, session.project_id, sessionId, "上一幕生成已超时，当前选择已恢复，可以重新选择。", new Date(timestamp));
      this.db
        .prepare("UPDATE interactive_sessions SET status = 'active', generation_token = NULL, last_error = ?, updated_at = ? WHERE id = ?")
        .run("上一幕生成已超时，当前选择已恢复，可以重新选择。", timestamp, sessionId);
    });
    recover();
  }

  public async failInitialGeneration(sessionId: string, message: string, jobClaim?: InteractiveGenerationJobClaim): Promise<void> {
    const fail = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.status !== "generating") return;
      if (jobClaim) {
        const job = assertInteractiveGenerationJobLease(this.db, jobClaim.id, jobClaim.leaseToken);
        if (job.sessionId !== sessionId || job.kind !== "opening") {
          throw new AuthoringError("CONFLICT", "Interactive opening generation job does not match the session", { sessionId, jobId: jobClaim.id });
        }
      }
      this.db.prepare("UPDATE interactive_sessions SET status = 'failed', generation_token = NULL, last_error = ?, updated_at = ? WHERE id = ? AND status = 'generating'").run(message, nowIso(), sessionId);
    });
    fail();
  }

  public async cancelGeneration(projectId: string, sessionId: string, message = "作者取消了本次生成。"): Promise<void> {
    const cancel = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.project_id !== projectId) throw new AuthoringError("NOT_FOUND", "Interactive session not found", { sessionId });
      if (session.status !== "generating") return;
      const timestamp = nowIso();
      cancelInteractiveGenerationJobs(this.db, projectId, sessionId, message, new Date(timestamp));
      if (!session.current_turn_id) {
        this.db.prepare("UPDATE interactive_sessions SET status = 'failed', generation_token = NULL, last_error = ?, updated_at = ? WHERE id = ? AND status = 'generating'").run(message, timestamp, sessionId);
        return;
      }
      this.db.prepare("UPDATE interactive_turns SET selected_choice_id = NULL, selected_at = NULL WHERE id = ?").run(session.current_turn_id);
      this.db.prepare("UPDATE interactive_sessions SET status = 'active', generation_token = NULL, last_error = ?, updated_at = ? WHERE id = ? AND status = 'generating'").run(message, timestamp, sessionId);
    });
    cancel();
  }

  public close(): void {
    this.databaseLease.release();
  }

  private requireSession(sessionId: string): SessionRow {
    const row = this.db.prepare("SELECT * FROM interactive_sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
    if (!row) throw new AuthoringError("NOT_FOUND", "Interactive session not found", { sessionId });
    return row;
  }

  private readSession(row: SessionRow): InteractiveSession {
    const turn = row.current_turn_id
      ? this.db.prepare("SELECT * FROM interactive_turns WHERE id = ?").get(row.current_turn_id) as TurnRow | undefined
      : undefined;
    const job = this.db.prepare("SELECT * FROM interactive_generation_jobs WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(row.id) as Record<string, unknown> | undefined;
    return toSession(row, turn ? parseScene(turn.scene_json) : null, job ? this.readGenerationJob(job) : null);
  }

  private readGenerationJob(row: Record<string, unknown>): InteractiveGenerationJob {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      sessionId: String(row.session_id),
      kind: row.kind as InteractiveGenerationJob["kind"],
      expectedTurn: Number(row.expected_turn),
      turnId: row.turn_id as string | null,
      choiceId: row.choice_id as string | null,
      generationToken: row.generation_token as string | null,
      status: row.status as InteractiveGenerationJob["status"],
      attempt: Number(row.attempt),
      maxAttempts: Number(row.max_attempts),
      deadlineAt: String(row.deadline_at),
      leaseToken: row.lease_token as string | null,
      leaseExpiresAt: row.lease_expires_at as string | null,
      nextAttemptAt: row.next_attempt_at as string | null,
      lastError: row.last_error as string | null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      startedAt: row.started_at as string | null,
      completedAt: row.completed_at as string | null,
    };
  }
}

export function createInteractiveRepository(options: AuthoringDatabaseOptions = {}): InteractiveRepository {
  return new BetterSqliteInteractiveRepository(options);
}
