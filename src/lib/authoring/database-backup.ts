import Database from "better-sqlite3";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
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

function digest(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyAndPrune(filePath: string, backupDir: string, sourceMigrationVersion: number, targetVersion: number): BackupResult {
  if (!fs.existsSync(filePath)) throw new Error(`SQLite backup was not created at: ${filePath}`);
  const readonly = new Database(filePath, { readonly: true });
  try {
    const integrityCheck = readonly.pragma("integrity_check", { simple: true });
    if (integrityCheck !== "ok") throw new Error(`SQLite integrity check failed: ${String(integrityCheck)}`);
  } finally {
    readonly.close();
  }

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
