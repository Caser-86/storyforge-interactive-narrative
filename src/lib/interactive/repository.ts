import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { initializeAuthoringDatabase } from "@/lib/authoring/database";
import { AuthoringError } from "@/lib/authoring/errors";
import type { AuthoringDatabaseOptions } from "@/lib/authoring/database";
import {
  InteractiveSceneSchema,
  InteractiveSessionSchema,
  InteractiveStateSchema,
  type InteractiveChoice,
  type InteractiveScene,
  type InteractiveSession,
  type InteractiveState,
  InteractiveTurnRecordSchema,
  type InteractiveTurnRecord,
} from "./schemas";

type SessionRow = {
  id: string;
  project_id: string;
  status: InteractiveSession["status"];
  turn: number;
  target_turns: number;
  state_json: string;
  current_turn_id: string | null;
  last_error: string | null;
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
  deleteSession(projectId: string, sessionId: string): Promise<void>;
  listTurns(projectId: string, sessionId: string): Promise<InteractiveTurnRecord[]>;
  saveInitialScene(sessionId: string, scene: InteractiveScene, state: InteractiveState): Promise<InteractiveSession>;
  claimChoice(projectId: string, sessionId: string, choiceId: string): Promise<{ session: InteractiveSession; choice: InteractiveChoice; scene: InteractiveScene }>;
  saveNextScene(sessionId: string, scene: InteractiveScene, state: InteractiveState): Promise<InteractiveSession>;
  releaseChoice(sessionId: string): Promise<void>;
  recoverStaleGeneration(sessionId: string, staleAfterMs?: number): Promise<void>;
  failInitialGeneration(sessionId: string, message: string): Promise<void>;
  close(): void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseState(value: string): InteractiveState {
  return InteractiveStateSchema.parse(JSON.parse(value));
}

function parseScene(value: string): InteractiveScene {
  return InteractiveSceneSchema.parse(JSON.parse(value));
}

function toSession(row: SessionRow, scene: InteractiveScene | null): InteractiveSession {
  return InteractiveSessionSchema.parse({
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    turn: row.turn,
    targetTurns: row.target_turns,
    state: parseState(row.state_json),
    scene,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class BetterSqliteInteractiveRepository implements InteractiveRepository {
  private readonly db: Database.Database;

  constructor(options: AuthoringDatabaseOptions = {}) {
    this.db = initializeAuthoringDatabase(options);
  }

  public async createSession(projectId: string, state: InteractiveState): Promise<InteractiveSession> {
    const timestamp = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO interactive_sessions (id, project_id, status, turn, target_turns, state_json, current_turn_id, last_error, created_at, updated_at)
         VALUES (?, ?, 'generating', 0, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(id, projectId, state.targetTurns, JSON.stringify(state), timestamp, timestamp);
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
    return toSession(row, turn ? parseScene(turn.scene_json) : null);
  }

  public async listSessions(projectId: string): Promise<InteractiveSession[]> {
    const rows = this.db
      .prepare("SELECT * FROM interactive_sessions WHERE project_id = ? ORDER BY updated_at DESC, id DESC")
      .all(projectId) as SessionRow[];
    return rows.map((row) => this.readSession(row));
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

  public async saveInitialScene(sessionId: string, scene: InteractiveScene, state: InteractiveState): Promise<InteractiveSession> {
    const save = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.status !== "generating" || session.turn !== 0) {
        throw new AuthoringError("CONFLICT", "Interactive session is not ready for its opening scene", { sessionId });
      }
      const timestamp = nowIso();
      const turnId = randomUUID();
      this.db
        .prepare("INSERT INTO interactive_turns (id, session_id, turn, scene_json, selected_choice_id, selected_at, created_at) VALUES (?, ?, 1, ?, NULL, NULL, ?)")
        .run(turnId, sessionId, JSON.stringify(scene), timestamp);
      this.db
        .prepare("UPDATE interactive_sessions SET status = ?, turn = 1, state_json = ?, current_turn_id = ?, last_error = NULL, updated_at = ? WHERE id = ?")
        .run(scene.isEnding ? "ended" : "active", JSON.stringify(state), turnId, timestamp, sessionId);
    });
    save();
    const row = this.requireSession(sessionId);
    return this.readSession(row);
  }

  public async claimChoice(projectId: string, sessionId: string, choiceId: string): Promise<{ session: InteractiveSession; choice: InteractiveChoice; scene: InteractiveScene }> {
    const claim = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.project_id !== projectId) throw new AuthoringError("NOT_FOUND", "Interactive session not found", { sessionId });
      if (session.status !== "active") throw new AuthoringError("CONFLICT", "Interactive session is not accepting choices", { status: session.status });
      if (!session.current_turn_id) throw new AuthoringError("CONFLICT", "Interactive session has no current scene", { sessionId });

      const turn = this.db.prepare("SELECT * FROM interactive_turns WHERE id = ?").get(session.current_turn_id) as TurnRow | undefined;
      if (!turn) throw new AuthoringError("STORAGE", "Interactive current scene is missing", { sessionId });
      if (turn.selected_choice_id) throw new AuthoringError("CONFLICT", "This scene is already being advanced", { sessionId });

      const scene = parseScene(turn.scene_json);
      const choice = scene.choices.find((candidate) => candidate.id === choiceId);
      if (!choice) throw new AuthoringError("VALIDATION", "Choice is not available in the current scene", { choiceId });

      const timestamp = nowIso();
      this.db.prepare("UPDATE interactive_turns SET selected_choice_id = ?, selected_at = ? WHERE id = ? AND selected_choice_id IS NULL").run(choiceId, timestamp, turn.id);
      this.db.prepare("UPDATE interactive_sessions SET status = 'generating', last_error = NULL, updated_at = ? WHERE id = ? AND status = 'active'").run(timestamp, sessionId);
      return { session: toSession(session, scene), choice, scene };
    });
    return claim();
  }

  public async saveNextScene(sessionId: string, scene: InteractiveScene, state: InteractiveState): Promise<InteractiveSession> {
    const save = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.status !== "generating" || !session.current_turn_id) {
        throw new AuthoringError("CONFLICT", "Interactive session is not generating a next scene", { sessionId });
      }
      const timestamp = nowIso();
      const turnId = randomUUID();
      const nextTurn = session.turn + 1;
      this.db
        .prepare("INSERT INTO interactive_turns (id, session_id, turn, scene_json, selected_choice_id, selected_at, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)")
        .run(turnId, sessionId, nextTurn, JSON.stringify(scene), timestamp);
      this.db
        .prepare("UPDATE interactive_sessions SET status = ?, turn = ?, state_json = ?, current_turn_id = ?, last_error = NULL, updated_at = ? WHERE id = ?")
        .run(scene.isEnding ? "ended" : "active", nextTurn, JSON.stringify(state), turnId, timestamp, sessionId);
    });
    save();
    return this.readSession(this.requireSession(sessionId));
  }

  public async releaseChoice(sessionId: string): Promise<void> {
    const timestamp = nowIso();
    this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (!session.current_turn_id) return;
      this.db.prepare("UPDATE interactive_turns SET selected_choice_id = NULL, selected_at = NULL WHERE id = ?").run(session.current_turn_id);
      this.db.prepare("UPDATE interactive_sessions SET status = 'active', last_error = NULL, updated_at = ? WHERE id = ? AND status = 'generating'").run(timestamp, sessionId);
    })();
  }

  public async recoverStaleGeneration(sessionId: string, staleAfterMs = 120_000): Promise<void> {
    const recover = this.db.transaction(() => {
      const session = this.requireSession(sessionId);
      if (session.status !== "generating") return;

      const updatedAt = Date.parse(session.updated_at);
      if (Number.isFinite(updatedAt) && Date.now() - updatedAt < staleAfterMs) return;

      const timestamp = nowIso();
      if (!session.current_turn_id) {
        this.db
          .prepare("UPDATE interactive_sessions SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?")
          .run("Opening generation was interrupted.", timestamp, sessionId);
        return;
      }

      const turn = this.db
        .prepare("SELECT * FROM interactive_turns WHERE id = ?")
        .get(session.current_turn_id) as TurnRow | undefined;
      if (!turn) {
        this.db
          .prepare("UPDATE interactive_sessions SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?")
          .run("Current interactive scene is missing.", timestamp, sessionId);
        return;
      }

      this.db
        .prepare("UPDATE interactive_turns SET selected_choice_id = NULL, selected_at = NULL WHERE id = ?")
        .run(turn.id);
      this.db
        .prepare("UPDATE interactive_sessions SET status = 'active', last_error = NULL, updated_at = ? WHERE id = ?")
        .run(timestamp, sessionId);
    });
    recover();
  }

  public async failInitialGeneration(sessionId: string, message: string): Promise<void> {
    this.db.prepare("UPDATE interactive_sessions SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?").run(message, nowIso(), sessionId);
  }

  public close(): void {
    this.db.close();
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
    return toSession(row, turn ? parseScene(turn.scene_json) : null);
  }
}

export function createInteractiveRepository(options: AuthoringDatabaseOptions = {}): InteractiveRepository {
  return new BetterSqliteInteractiveRepository(options);
}
