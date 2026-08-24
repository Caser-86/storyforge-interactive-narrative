import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { getAuthoringDbPath } from "../lib/authoring/database";
import { backupBeforeMigration } from "../lib/authoring/database-backup";
import { AUTHORING_MIGRATIONS } from "../lib/authoring/migrations";
import { loadAuthoringEnv } from "../lib/authoring/local-env";
import { getErrorMessage } from "../lib/errors";

export async function backupAuthoringDatabase(): Promise<void> {
  loadAuthoringEnv();
  const dbPath = getAuthoringDbPath();
  const backupDir = process.env.SQLITE_BACKUP_DIR ?? "./data/backups";
  if (!fs.existsSync(dbPath)) throw new Error(`Authoring database does not exist at ${dbPath}`);
  const result = await backupBeforeMigration(dbPath, AUTHORING_MIGRATIONS[AUTHORING_MIGRATIONS.length - 1].version, { backupDir });
  console.log(`Authoring database backup created: ${result.path}`);
  console.log(`Integrity: ${result.integrityCheck}; SHA-256: ${result.sha256}`);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun()) {
  backupAuthoringDatabase().catch((error) => {
    console.error(getErrorMessage(error));
    process.exit(1);
  });
}
