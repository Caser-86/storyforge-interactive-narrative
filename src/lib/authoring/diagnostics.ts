import fs from "fs";
import path from "path";
import { getAuthoringDbPath, openAuthoringDatabase } from "./database";
import { listDatabaseCheckpointManifests } from "./database-backup";
import { AUTHORING_MIGRATIONS } from "./migrations";
import { DiagnosticReportSchema } from "./diagnostic-contracts";
import type { DiagnosticReport } from "./diagnostic-contracts";

export { DiagnosticReportSchema } from "./diagnostic-contracts";
export type { DiagnosticReport } from "./diagnostic-contracts";

export interface AuthoringDiagnosticsOptions {
  now?: Date;
  dbPath?: string;
  backupDir?: string;
}

function isWritable(dbPath: string): boolean {
  if (dbPath === ":memory:") return true;
  try {
    fs.accessSync(path.dirname(path.resolve(dbPath)), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function readMigrationVersion(db: { prepare(sql: string): { get(): unknown } }): number {
  const table = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'authoring_migrations'").get() as { found: number } | undefined;
  if (!table) return 0;
  const row = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM authoring_migrations").get() as { version: number };
  return row.version;
}

function databaseCheck(dbPath: string): DiagnosticReport["database"] {
  const writable = isWritable(dbPath);
  let database: ReturnType<typeof openAuthoringDatabase> | undefined;
  try {
    database = openAuthoringDatabase({ dbPath, readonly: true });
    const integrity = database.pragma("integrity_check", { simple: true });
    const migrationVersion = readMigrationVersion(database);
    const pendingMigrations = AUTHORING_MIGRATIONS.some((migration) => migration.version > migrationVersion && migration.up.trim().length > 0);
    return {
      status: integrity === "ok" && writable ? "ok" : "error",
      migrationVersion,
      pendingMigrations,
      integrity: integrity === "ok" ? "ok" : "error",
      writable,
    };
  } catch {
    return {
      status: "error",
      migrationVersion: null,
      pendingMigrations: false,
      integrity: "unknown",
      writable,
    };
  } finally {
    database?.close();
  }
}

function backupCheck(now: Date, backupDir: string): DiagnosticReport["backup"] {
  try {
    const latest = listDatabaseCheckpointManifests(backupDir)[0];
    if (!latest) return { status: "warning", freshness: "missing", latestCreatedAt: null };
    const createdAt = new Date(latest.manifest.createdAt);
    const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
    const freshness = ageMs <= 24 * 60 * 60 * 1000 ? "fresh" : "stale";
    return {
      status: freshness === "fresh" ? "ok" : "warning",
      freshness,
      latestCreatedAt: latest.manifest.createdAt,
    };
  } catch {
    return { status: "error", freshness: "unknown", latestCreatedAt: null };
  }
}

export async function collectAuthoringDiagnostics(options: AuthoringDiagnosticsOptions = {}): Promise<DiagnosticReport> {
  const now = options.now ?? new Date();
  const dbPath = options.dbPath ?? getAuthoringDbPath();
  const backupDir = options.backupDir ?? process.env.SQLITE_BACKUP_DIR ?? "./data/backups";
  const database = databaseCheck(dbPath);
  const backup = backupCheck(now, backupDir);
  const network = { binding: process.env.STORYFORGE_ALLOW_LAN === "true" ? "lan-override" as const : "loopback-only" as const };
  const provider = { status: process.env.OPENAI_API_KEY ? "configured" as const : "not-configured" as const };
  const hasError = database.status === "error" || backup.status === "error";
  const hasWarning = database.pendingMigrations || backup.status === "warning" || network.binding === "lan-override" || provider.status === "not-configured";

  return DiagnosticReportSchema.parse({
    schema: "storyforge-diagnostics@1",
    status: hasError ? "error" : hasWarning ? "warning" : "ok",
    generatedAt: now.toISOString(),
    database,
    backup,
    network,
    provider,
  });
}
