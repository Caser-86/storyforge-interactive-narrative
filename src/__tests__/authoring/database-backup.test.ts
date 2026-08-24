import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthoringError } from "@/lib/authoring/errors";
import {
  backupBeforeMigration,
  createDatabaseCheckpoint,
  DatabaseCheckpointManifestSchema,
  listDatabaseCheckpointManifests,
  pruneDatabaseCheckpoints,
} from "@/lib/authoring/database-backup";

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

  it("writes an atomic checkpoint manifest with integrity and provenance", async () => {
    const now = new Date(Date.UTC(2026, 7, 24, 12, 0, 0));
    const result = await createDatabaseCheckpoint(dbPath, 8, { backupDir, now });
    const manifest = DatabaseCheckpointManifestSchema.parse(JSON.parse(fs.readFileSync(result.manifestPath, "utf8")));

    expect(manifest).toMatchObject({
      fileName: path.basename(result.path),
      createdAt: now.toISOString(),
      sourceMigrationVersion: 3,
      targetMigrationVersion: 8,
      integrityCheck: "ok",
    });
    expect(manifest.sizeBytes).toBe(fs.statSync(result.path).size);
    expect(manifest.sha256).toBe(crypto.createHash("sha256").update(fs.readFileSync(result.path)).digest("hex"));
    expect(listDatabaseCheckpointManifests(backupDir)).toHaveLength(1);
    expect(fs.readdirSync(backupDir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("retains the newest configured daily and weekly checkpoints", async () => {
    const dates = [
      new Date(Date.UTC(2026, 0, 1, 12)),
      new Date(Date.UTC(2026, 0, 2, 12)),
      new Date(Date.UTC(2026, 0, 8, 12)),
      new Date(Date.UTC(2026, 0, 15, 12)),
    ];
    for (const now of dates) {
      await createDatabaseCheckpoint(dbPath, 8, { backupDir, now, dailyRetention: 2, weeklyRetention: 1 });
    }

    const manifests = listDatabaseCheckpointManifests(backupDir);
    expect(manifests.map((entry) => entry.manifest.createdAt)).toEqual([
      dates[3]!.toISOString(),
      dates[2]!.toISOString(),
    ]);
  });

  it("never prunes a path outside the configured backup directory", () => {
    fs.mkdirSync(backupDir, { recursive: true });
    const outside = path.join(tempDir, "outside.sqlite");
    fs.writeFileSync(outside, "keep");
    fs.writeFileSync(path.join(backupDir, "authoring-checkpoint-malicious.manifest.json"), JSON.stringify({
      schema: "storyforge-database-checkpoint@1",
      fileName: "../outside.sqlite",
      createdAt: "2026-08-24T12:00:00.000Z",
      sha256: "a".repeat(64),
      sizeBytes: 4,
      sourceMigrationVersion: 8,
      targetMigrationVersion: 8,
      integrityCheck: "ok",
    }));

    expect(() => pruneDatabaseCheckpoints(backupDir)).toThrow(/inside the configured backup directory/i);
    expect(fs.readFileSync(outside, "utf8")).toBe("keep");
  });
});
