import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository } from "@/lib/authoring/repository";
import { createDatabaseCheckpoint } from "@/lib/authoring/database-backup";
import { restoreAuthoringDatabaseBackup } from "@/lib/authoring/database-restore-check";

let tempDir: string;
let dbPath: string;
let backupDir: string;
let repository: AuthoringRepository;

describe("authoring database restore checks", () => {
  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-restore-check-"));
    dbPath = path.join(tempDir, "authoring.sqlite");
    backupDir = path.join(tempDir, "backups");
    repository = createAuthoringRepository({ dbPath, backupDir });
    await repository.createProject({
      title: "恢复演练",
      premise: "验证数据库副本可以被安全读取。",
      genre: "测试",
      tone: "克制",
      pointOfView: "第三人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    repository.close();
  });

  afterEach(() => {
    if (repository) repository.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("rehearses a backup in a temporary copy without changing the source", async () => {
    const before = fs.readFileSync(dbPath);
    const checkpoint = await createDatabaseCheckpoint(dbPath, 8, { backupDir });

    const result = await restoreAuthoringDatabaseBackup(checkpoint.path);

    expect(result).toMatchObject({
      integrityCheck: "ok",
      migrationVersion: 8,
      projectCount: 1,
      graphReadable: true,
    });
    expect(fs.readFileSync(dbPath)).toEqual(before);
  });

  it("rejects a missing candidate without deleting anything", async () => {
    await expect(restoreAuthoringDatabaseBackup(path.join(tempDir, "missing.sqlite"))).rejects.toMatchObject({ code: "STORAGE" });
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
