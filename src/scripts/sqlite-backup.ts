import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.SQLITE_DB_PATH || "./data/storyforge.sqlite";
const BACKUP_DIR = process.env.SQLITE_BACKUP_DIR || "./data/backups";

function backupSqlite() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`SQLite database not found at: ${DB_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `storyforge-${timestamp}.sqlite`);

  const db = new Database(DB_PATH, { readonly: true });
  db.backup(backupPath);
  db.close();

  const stats = fs.statSync(backupPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log(`Backup created: ${backupPath} (${sizeMB} MB)`);

  const maxBackups = parseInt(process.env.SQLITE_MAX_BACKUPS || "10", 10);
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

backupSqlite();
