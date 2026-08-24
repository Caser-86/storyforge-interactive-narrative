import Database from "better-sqlite3";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { AuthoringError } from "./errors";

export interface DatabaseBackupOptions {
  backupDir?: string;
}

export interface BackupResult {
  path: string;
  sha256: string;
  sourceMigrationVersion: number;
  targetVersion: number;
  integrityCheck: "ok";
}

export const DatabaseCheckpointManifestSchema = z
  .object({
    schema: z.literal("storyforge-database-checkpoint@1"),
    fileName: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive(),
    sourceMigrationVersion: z.number().int().min(0),
    targetMigrationVersion: z.number().int().min(0),
    integrityCheck: z.literal("ok"),
  })
  .strict();

export type DatabaseCheckpointManifest = z.infer<typeof DatabaseCheckpointManifestSchema>;

export interface DatabaseCheckpointOptions {
  backupDir?: string;
  now?: Date;
  dailyRetention?: number;
  weeklyRetention?: number;
}

export interface DatabaseCheckpointResult {
  path: string;
  manifestPath: string;
  manifest: DatabaseCheckpointManifest;
}

export interface DatabaseCheckpointEntry {
  path: string;
  manifestPath: string;
  manifest: DatabaseCheckpointManifest;
}

function getBackupDir(options: DatabaseBackupOptions = {}): string {
  return options.backupDir ?? process.env.SQLITE_BACKUP_DIR ?? "./data/backups";
}

function migrationVersion(db: Database.Database): number {
  const exists = db
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'authoring_migrations'")
    .get() as { found: number } | undefined;
  if (!exists) return 0;
  const row = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM authoring_migrations").get() as { version: number };
  return row.version;
}

function backupFilePath(backupDir: string): string {
  return path.join(backupDir, `authoring-before-migration-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.sqlite`);
}

function checkpointFilePath(backupDir: string, now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return path.join(backupDir, `authoring-checkpoint-${timestamp}-${randomUUID()}.sqlite`);
}

function childPath(rootDir: string, fileName: string): string {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, fileName);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Backup path must remain inside the configured backup directory.");
  }
  return resolved;
}

function digest(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyIntegrity(filePath: string): void {
  const readonly = new Database(filePath, { readonly: true });
  try {
    const integrityCheck = readonly.pragma("integrity_check", { simple: true });
    if (integrityCheck !== "ok") throw new Error(`SQLite integrity check failed: ${String(integrityCheck)}`);
    const foreignKeyIssues = readonly.pragma("foreign_key_check") as unknown[];
    if (foreignKeyIssues.length > 0) throw new Error("SQLite foreign key check failed");
  } finally {
    readonly.close();
  }
}

function verifyAndPrune(filePath: string, backupDir: string, sourceMigrationVersion: number, targetVersion: number): BackupResult {
  if (!fs.existsSync(filePath)) throw new Error(`SQLite backup was not created at: ${filePath}`);
  verifyIntegrity(filePath);

  const automaticBackups = fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith("authoring-before-migration-") && name.endsWith(".sqlite"))
    .map((name) => {
      const fullPath = path.join(backupDir, name);
      return { fullPath, modifiedAt: fs.statSync(fullPath).mtimeMs };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  for (const oldBackup of automaticBackups.slice(10)) fs.rmSync(oldBackup.fullPath, { force: true });

  return {
    path: filePath,
    sha256: digest(filePath),
    sourceMigrationVersion,
    targetVersion,
    integrityCheck: "ok",
  };
}

function isoWeekKey(value: string): string {
  const date = new Date(value);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function writeAtomicManifest(manifestPath: string, manifest: DatabaseCheckpointManifest): void {
  const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(manifest, null, 2), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporaryPath, manifestPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

export function listDatabaseCheckpointManifests(backupDir: string): DatabaseCheckpointEntry[] {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith("authoring-checkpoint-") && name.endsWith(".manifest.json"))
    .map((name) => {
      const manifestPath = childPath(backupDir, name);
      const manifest = DatabaseCheckpointManifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
      const filePath = childPath(backupDir, manifest.fileName);
      if (!fs.existsSync(filePath)) throw new Error(`Checkpoint database is missing for manifest: ${name}`);
      return { path: filePath, manifestPath, manifest };
    })
    .sort((left, right) => right.manifest.createdAt.localeCompare(left.manifest.createdAt));
}

export function pruneDatabaseCheckpoints(
  backupDir: string,
  options: Pick<DatabaseCheckpointOptions, "dailyRetention" | "weeklyRetention"> = {},
): void {
  const dailyRetention = Math.max(0, Math.floor(options.dailyRetention ?? 14));
  const weeklyRetention = Math.max(0, Math.floor(options.weeklyRetention ?? 8));
  const entries = listDatabaseCheckpointManifests(backupDir);
  const keep = new Set<string>();
  const days = new Set<string>();
  const weeks = new Set<string>();

  for (const entry of entries) {
    const day = entry.manifest.createdAt.slice(0, 10);
    if (days.size < dailyRetention && !days.has(day)) {
      days.add(day);
      keep.add(entry.manifest.fileName);
    }
    const week = isoWeekKey(entry.manifest.createdAt);
    if (weeks.size < weeklyRetention && !weeks.has(week)) {
      weeks.add(week);
      keep.add(entry.manifest.fileName);
    }
  }

  for (const entry of entries) {
    if (keep.has(entry.manifest.fileName)) continue;
    fs.rmSync(childPath(backupDir, entry.manifest.fileName), { force: true });
    fs.rmSync(childPath(backupDir, path.basename(entry.manifestPath)), { force: true });
  }
}

export async function createDatabaseCheckpoint(
  dbPath: string,
  targetVersion: number,
  options: DatabaseCheckpointOptions = {},
): Promise<DatabaseCheckpointResult> {
  const backupDir = getBackupDir(options);
  const now = options.now ?? new Date();
  let db: Database.Database | undefined;
  let temporaryPath: string | undefined;
  let targetPath: string | undefined;
  let manifestPath: string | undefined;
  try {
    if (!fs.existsSync(dbPath)) throw new Error(`SQLite database does not exist at: ${dbPath}`);
    fs.mkdirSync(backupDir, { recursive: true });
    targetPath = checkpointFilePath(backupDir, now);
    temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    manifestPath = `${targetPath}.manifest.json`;
    db = new Database(dbPath, { readonly: true });
    const sourceMigrationVersion = migrationVersion(db);
    await db.backup(temporaryPath);
    db.close();
    db = undefined;
    verifyIntegrity(temporaryPath);
    fs.renameSync(temporaryPath, targetPath);
    temporaryPath = undefined;

    const manifest = DatabaseCheckpointManifestSchema.parse({
      schema: "storyforge-database-checkpoint@1",
      fileName: path.basename(targetPath),
      createdAt: now.toISOString(),
      sha256: digest(targetPath),
      sizeBytes: fs.statSync(targetPath).size,
      sourceMigrationVersion,
      targetMigrationVersion: targetVersion,
      integrityCheck: "ok",
    });
    writeAtomicManifest(manifestPath, manifest);
    pruneDatabaseCheckpoints(backupDir, options);
    return { path: targetPath, manifestPath, manifest };
  } catch (error) {
    if (temporaryPath && fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    if (targetPath && fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
    if (manifestPath && fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true });
    throw storageError(error, "Failed to create verified authoring database checkpoint");
  } finally {
    db?.close();
  }
}

function storageError(error: unknown, message: string): AuthoringError {
  if (error instanceof AuthoringError) return error;
  return new AuthoringError("STORAGE", message, { cause: error instanceof Error ? error.message : String(error) });
}

export async function backupBeforeMigration(
  dbPath: string,
  targetVersion: number,
  options: DatabaseBackupOptions = {},
): Promise<BackupResult> {
  const backupDir = getBackupDir(options);
  let db: Database.Database | undefined;
  let targetPath: string | undefined;
  try {
    if (!fs.existsSync(dbPath)) throw new Error(`SQLite database does not exist at: ${dbPath}`);
    fs.mkdirSync(backupDir, { recursive: true });
    targetPath = backupFilePath(backupDir);
    db = new Database(dbPath, { readonly: true });
    const sourceMigrationVersion = migrationVersion(db);
    await db.backup(targetPath);
    return verifyAndPrune(targetPath, backupDir, sourceMigrationVersion, targetVersion);
  } catch (error) {
    if (targetPath && fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
    throw storageError(error, "Failed to create verified authoring database backup");
  } finally {
    db?.close();
  }
}

export function backupOpenDatabaseBeforeMigration(
  db: Database.Database,
  backupDir: string,
  targetVersion: number,
): BackupResult {
  let targetPath: string | undefined;
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    targetPath = backupFilePath(backupDir);
    const sourceMigrationVersion = migrationVersion(db);
    const escapedPath = targetPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}'`);
    return verifyAndPrune(targetPath, backupDir, sourceMigrationVersion, targetVersion);
  } catch (error) {
    if (targetPath && fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
    throw storageError(error, "Failed to create verified authoring migration backup");
  }
}
