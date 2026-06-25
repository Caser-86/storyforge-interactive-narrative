import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { readIntEnv } from "../lib/env";
import { getErrorMessage } from "../lib/errors";

const DB_PATH = process.env.SQLITE_DB_PATH || "./data/storyforge.sqlite";
const BACKUP_DIR = process.env.SQLITE_BACKUP_DIR || "./data/backups";

export async function backupSqlite(): Promise<void> {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`SQLite database not found at: ${DB_PATH}`);
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `storyforge-${timestamp}.sqlite`);

  const db = new Database(DB_PATH, { readonly: true });
  try {
    await db.backup(backupPath);
  } finally {
    db.close();
  }

  const stats = fs.statSync(backupPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log(`Backup created: ${backupPath} (${sizeMB} MB)`);

  const maxBackups = readIntEnv("SQLITE_MAX_BACKUPS", 10, { min: 1 });
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("storyforge-") && f.endsWith(".sqlite"))
    .sort();

  if (backups.length > maxBackups) {
    const toDelete = backups.slice(0, backups.length - maxBackups);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`Removed old backup: ${f}`);
    }
  }
}

async function main(): Promise<void> {
  try {
    await backupSqlite();
  } catch (err) {
    console.error(getErrorMessage(err));
    process.exit(1);
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun()) {
  main();
}
