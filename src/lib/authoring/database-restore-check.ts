import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { AuthoringError } from "./errors";
import { initializeAuthoringDatabase } from "./database";

const EXPECTED_AUTHORING_TABLES = [
  "authoring_migrations",
  "projects",
  "story_versions",
  "chapters",
  "story_nodes",
  "story_edges",
  "generation_runs",
  "generation_steps",
  "generation_candidates",
  "validation_runs",
  "validation_issues",
  "interactive_sessions",
  "interactive_turns",
] as const;

export interface DatabaseRestoreCheckResult {
  checkedAt: string;
  integrityCheck: "ok";
  migrationVersion: number;
  projectCount: number;
  graphReadable: boolean;
}

function storageError(error: unknown, message: string): AuthoringError {
  if (error instanceof AuthoringError) return error;
  return new AuthoringError("STORAGE", message, { cause: error instanceof Error ? error.message : String(error) });
}

function migrationVersion(db: Database.Database): number {
  const row = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM authoring_migrations").get() as { version: number };
  return row.version;
}

function assertExpectedTables(db: Database.Database): void {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>;
  const tables = new Set(rows.map((row) => row.name));
  const missing = EXPECTED_AUTHORING_TABLES.filter((table) => !tables.has(table));
  if (missing.length > 0) {
    throw new Error(`SQLite backup is missing authoring tables: ${missing.join(", ")}`);
  }
}

function verifyReadableGraph(db: Database.Database): { projectCount: number; graphReadable: boolean } {
  const projectCount = (db.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number }).count;
  db.prepare(
    `SELECT p.id, v.id AS version_id, COUNT(DISTINCT n.id) AS node_count, COUNT(DISTINCT e.id) AS edge_count
     FROM projects p
     LEFT JOIN story_versions v ON v.project_id = p.id
     LEFT JOIN story_nodes n ON n.version_id = v.id
     LEFT JOIN story_edges e ON e.version_id = v.id
     GROUP BY p.id, v.id`,
  ).all();
  return { projectCount, graphReadable: true };
}

export async function restoreAuthoringDatabaseBackup(backupPath: string): Promise<DatabaseRestoreCheckResult> {
  let workspace: string | undefined;
  let readonly: Database.Database | undefined;
  try {
    if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) {
      throw new Error("SQLite backup file does not exist.");
    }

    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-restore-rehearsal-"));
    const candidatePath = path.join(workspace, "authoring.sqlite");
    fs.copyFileSync(backupPath, candidatePath);

    const migrated = initializeAuthoringDatabase({ dbPath: candidatePath, backupBeforeMigration: false });
    migrated.close();

    readonly = new Database(candidatePath, { readonly: true });
    const integrityCheck = readonly.pragma("integrity_check", { simple: true });
    if (integrityCheck !== "ok") throw new Error(`SQLite integrity check failed: ${String(integrityCheck)}`);
    const foreignKeyIssues = readonly.pragma("foreign_key_check") as unknown[];
    if (foreignKeyIssues.length > 0) throw new Error("SQLite foreign key check failed");
    assertExpectedTables(readonly);
    const readable = verifyReadableGraph(readonly);

    return {
      checkedAt: new Date().toISOString(),
      integrityCheck: "ok",
      migrationVersion: migrationVersion(readonly),
      projectCount: readable.projectCount,
      graphReadable: readable.graphReadable,
    };
  } catch (error) {
    throw storageError(error, "Failed to rehearse the authoring database restore");
  } finally {
    readonly?.close();
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  }
}
