import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { CreateProjectInput } from "@/lib/authoring/repository";
import { ProjectBackupV2Schema } from "@/lib/authoring/backup";

let tempDir: string;
let originalDbPath: string | undefined;
let originalBackupDir: string | undefined;

function input(): CreateProjectInput {
  return {
    title: "API 备份项目",
    premise: "验证备份下载和导入接口。",
    genre: "测试",
    tone: "清晰",
    pointOfView: "第一人称",
    rating: "PG",
    size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
  };
}

describe("authoring backup routes", () => {
  beforeEach(() => {
    originalDbPath = process.env.SQLITE_DB_PATH;
    originalBackupDir = process.env.SQLITE_BACKUP_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-backup-api-"));
    process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
    process.env.SQLITE_BACKUP_DIR = path.join(tempDir, "backups");
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = originalDbPath;
    if (originalBackupDir === undefined) delete process.env.SQLITE_BACKUP_DIR;
    else process.env.SQLITE_BACKUP_DIR = originalBackupDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("downloads a validated backup and imports it through the collection route", async () => {
    const repo = createAuthoringRepository();
    const project = await repo.createProject(input());
    repo.close();

    const route = await import("@/app/api/projects/[projectId]/backup/route");
    const importRoute = await import("@/app/api/projects/import/route");
    const context = { params: Promise.resolve({ projectId: project.id }) };
    const downloaded = await route.GET(new Request(`http://local/api/projects/${project.id}/backup`), context);
    const backup = ProjectBackupV2Schema.parse(await downloaded.json());
    const imported = await importRoute.POST(
      new Request("http://local/api/projects/import", {
        method: "POST",
        body: JSON.stringify({ backup, mode: "new-id" }),
      }),
    );

    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-disposition")).toContain("storyforge-project");
    expect(imported.status).toBe(201);
    expect((await imported.json()).project.id).not.toBe(project.id);
  });
});
