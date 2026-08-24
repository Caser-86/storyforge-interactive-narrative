import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { AuthoringError } from "./errors";
import { AUTHORING_MIGRATIONS } from "./migrations";
import { backupOpenDatabaseBeforeMigration } from "./database-backup";

export interface AuthoringDatabaseOptions {
  dbPath?: string;
  backupDir?: string;
  backupBeforeMigration?: boolean;
}

export function getAuthoringDbPath(options: AuthoringDatabaseOptions = {}): string {
  return options.dbPath ?? process.env.SQLITE_DB_PATH ?? "./data/storyforge.sqlite";
}

function getBackupDir(options: AuthoringDatabaseOptions): string {
  return options.backupDir ?? process.env.SQLITE_BACKUP_DIR ?? "./data/backups";
}

function isInMemoryDatabase(dbPath: string): boolean {
  return dbPath === ":memory:";
}

function ensureParentDirectory(dbPath: string): void {
  if (isInMemoryDatabase(dbPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { found: number } | undefined;

  return Boolean(row);
}

function readAppliedVersions(db: Database.Database): Set<number> {
  if (!tableExists(db, "authoring_migrations")) {
    return new Set();
  }

  const rows = db.prepare("SELECT version FROM authoring_migrations ORDER BY version").all() as { version: number }[];
  return new Set(rows.map((row) => row.version));
}

function isExistingNonEmptyDatabase(dbPath: string): boolean {
  if (isInMemoryDatabase(dbPath) || !fs.existsSync(dbPath)) {
    return false;
  }

  return fs.statSync(dbPath).size > 0;
}

export function openAuthoringDatabase(options: AuthoringDatabaseOptions = {}): Database.Database {
  const dbPath = getAuthoringDbPath(options);
  ensureParentDirectory(dbPath);

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  return db;
}

export function migrateAuthoringDatabase(
  db: Database.Database,
  options: AuthoringDatabaseOptions = {},
): void {
  const appliedVersions = readAppliedVersions(db);
  const hasPendingNonEmptyMigration = AUTHORING_MIGRATIONS.some(
    (migration) => !appliedVersions.has(migration.version) && migration.up.trim().length > 0,
  );

  if (hasPendingNonEmptyMigration && appliedVersions.size === 0 && options.backupBeforeMigration === true) {
    try {
      backupOpenDatabaseBeforeMigration(db, getBackupDir(options), AUTHORING_MIGRATIONS[AUTHORING_MIGRATIONS.length - 1].version);
    } catch (error) {
      throw new AuthoringError("STORAGE", "Failed to create SQLite backup before authoring migration", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS authoring_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const migrationTransaction = db.transaction(() => {
    for (const migration of AUTHORING_MIGRATIONS) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      if (migration.up.trim()) {
        db.exec(migration.up);
      }

      db.prepare("INSERT INTO authoring_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    }
  });

  migrationTransaction();
}

export function runAuthoringMigrations(options: AuthoringDatabaseOptions = {}): void {
  const dbPath = getAuthoringDbPath(options);
  const backupBeforeMigration = options.backupBeforeMigration ?? isExistingNonEmptyDatabase(dbPath);
  const db = openAuthoringDatabase(options);
  try {
    migrateAuthoringDatabase(db, { ...options, backupBeforeMigration });
  } finally {
    db.close();
  }
}

export function initializeAuthoringDatabase(options: AuthoringDatabaseOptions = {}): Database.Database {
  const dbPath = getAuthoringDbPath(options);
  const backupBeforeMigration = options.backupBeforeMigration ?? isExistingNonEmptyDatabase(dbPath);
  const db = openAuthoringDatabase(options);
  try {
    migrateAuthoringDatabase(db, { ...options, backupBeforeMigration });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
