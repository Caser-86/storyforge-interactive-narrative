import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { listDatabaseCheckpointManifests } from "../lib/authoring/database-backup";
import { restoreAuthoringDatabaseBackup } from "../lib/authoring/database-restore-check";
import { loadAuthoringEnv } from "../lib/authoring/local-env";
import { getErrorMessage } from "../lib/errors";

function selectedBackup(): string {
  const args = process.argv.slice(2);
  const latest = args.includes("--latest");
  const pathIndex = args.indexOf("--path");
  if (latest && pathIndex >= 0) throw new Error("Use either --latest or --path, not both.");

  if (pathIndex >= 0) {
    const candidate = args[pathIndex + 1];
    if (!candidate) throw new Error("--path requires a SQLite backup file.");
    return path.resolve(candidate);
  }

  if (!latest) throw new Error("Specify --latest or --path <sqlite-backup>.");
  const backupDir = process.env.SQLITE_BACKUP_DIR ?? "./data/backups";
  const entry = listDatabaseCheckpointManifests(backupDir)[0];
  if (!entry) throw new Error(`No checkpoint manifest found in ${backupDir}`);
  return entry.path;
}

export async function restoreCheckAuthoringDatabase(): Promise<void> {
  loadAuthoringEnv();
  const candidate = selectedBackup();
  if (!fs.existsSync(candidate)) throw new Error(`Backup file does not exist: ${candidate}`);
  const result = await restoreAuthoringDatabaseBackup(candidate);
  console.log(`Restore rehearsal passed for: ${candidate}`);
  console.log(`Migration version: ${result.migrationVersion}; projects: ${result.projectCount}; graphReadable: ${result.graphReadable}`);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun()) {
  restoreCheckAuthoringDatabase().catch((error) => {
    console.error(getErrorMessage(error));
    process.exit(1);
  });
}
