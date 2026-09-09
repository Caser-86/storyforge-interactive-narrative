import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { AUTHORING_MIGRATIONS } from "@/lib/authoring/migrations";
import { initializeAuthoringDatabase } from "@/lib/authoring/database";
import { collectAuthoringDiagnostics } from "@/lib/authoring/diagnostics";

let tempDir: string;

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function createVersionTwelveDatabase(dbPath: string, backupDir: string): Promise<void> {
  const latestMigration = AUTHORING_MIGRATIONS.pop();
  if (!latestMigration) throw new Error("Expected a latest authoring migration");
  try {
    const repository = createAuthoringRepository({ dbPath, backupDir });
    await repository.createProject({
      title: "迁移安全测试",
      premise: "保留升级前的数据。",
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第三人称",
      rating: "PG",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    repository.close();
  } finally {
    AUTHORING_MIGRATIONS.push(latestMigration);
  }
}

describe("authoring migration safety", () => {
  it("creates an automatic backup before upgrading an existing database", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-migration-safety-"));
    const dbPath = path.join(tempDir, "authoring.sqlite");
    const backupDir = path.join(tempDir, "backups");
    await createVersionTwelveDatabase(dbPath, backupDir);

    const database = initializeAuthoringDatabase({ dbPath, backupDir });
    database.close();

    const automaticBackups = fs.readdirSync(backupDir).filter((name) => name.startsWith("authoring-before-migration-") && name.endsWith(".sqlite"));
    expect(automaticBackups).toHaveLength(1);
  });

  it("does not apply a pending migration when the migration backup fails", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-migration-safety-"));
    const dbPath = path.join(tempDir, "authoring.sqlite");
    const backupDir = path.join(tempDir, "backup-file");
    await createVersionTwelveDatabase(dbPath, path.join(tempDir, "initial-backups"));
    fs.writeFileSync(backupDir, "backup destination is not a directory");

    await expect(Promise.resolve().then(() => {
      const database = initializeAuthoringDatabase({ dbPath, backupDir });
      database.close();
    })).rejects.toMatchObject({ code: "STORAGE" });

    const database = new Database(dbPath, { readonly: true });
    const migration = database.prepare("SELECT MAX(version) AS version FROM authoring_migrations").get() as { version: number };
    expect(migration.version).toBe(12);
    database.close();
  });

  it("keeps diagnostics read-only and reports pending migrations", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-migration-safety-"));
    const dbPath = path.join(tempDir, "authoring.sqlite");
    const backupDir = path.join(tempDir, "backups");
    await createVersionTwelveDatabase(dbPath, backupDir);
    const before = fs.readFileSync(dbPath);

    const report = await collectAuthoringDiagnostics({ dbPath, backupDir, now: new Date("2026-09-08T00:00:00.000Z") });

    expect(report.database.migrationVersion).toBe(12);
    expect(report.database.pendingMigrations).toBe(true);
    expect(fs.readFileSync(dbPath)).toEqual(before);
  });
});
