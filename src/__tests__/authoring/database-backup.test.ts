import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthoringError } from "@/lib/authoring/errors";
import { backupBeforeMigration } from "@/lib/authoring/database-backup";

let tempDir: string;
let dbPath: string;
let backupDir: string;

describe("authoring database backups", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-database-backup-"));
    dbPath = path.join(tempDir, "authoring.sqlite");
    backupDir = path.join(tempDir, "backups");
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE authoring_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO authoring_migrations VALUES (3, 'test', '2026-08-21T00:00:00.000Z'); CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES ('keep');`);
    db.close();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates an integrity-checked backup with a checksum and migration provenance", async () => {
    const result = await backupBeforeMigration(dbPath, 5, { backupDir });
    const bytes = fs.readFileSync(result.path);

    expect(result.sourceMigrationVersion).toBe(3);
    expect(result.targetVersion).toBe(5);
    expect(result.integrityCheck).toBe("ok");
    expect(result.sha256).toBe(crypto.createHash("sha256").update(bytes).digest("hex"));
    const backup = new Database(result.path, { readonly: true });
    expect(backup.prepare("SELECT value FROM preserved").get()).toEqual({ value: "keep" });
    backup.close();
  });

  it("retains only the newest ten automatic migration backups", async () => {
    fs.mkdirSync(backupDir, { recursive: true });
    for (let index = 0; index < 12; index += 1) {
      const file = path.join(backupDir, `authoring-before-migration-old-${String(index).padStart(2, "0")}.sqlite`);
      fs.writeFileSync(file, "old");
      fs.utimesSync(file, new Date(2020, 0, index + 1), new Date(2020, 0, index + 1));
    }

    await backupBeforeMigration(dbPath, 5, { backupDir });

    expect(fs.readdirSync(backupDir).filter((name) => name.startsWith("authoring-before-migration-") && name.endsWith(".sqlite"))).toHaveLength(10);
  });

  it("fails without changing the source database when the backup destination is unavailable", async () => {
    const backupFile = path.join(tempDir, "backup-dir-file");
    fs.writeFileSync(backupFile, "not a directory");

    await expect(backupBeforeMigration(dbPath, 5, { backupDir: backupFile })).rejects.toMatchObject({
      code: "STORAGE",
    } satisfies Partial<AuthoringError>);
    const source = new Database(dbPath, { readonly: true });
    expect(source.prepare("SELECT value FROM preserved").get()).toEqual({ value: "keep" });
    source.close();
  });
});
