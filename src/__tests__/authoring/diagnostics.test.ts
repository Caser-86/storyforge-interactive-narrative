import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createDatabaseCheckpoint } from "@/lib/authoring/database-backup";
import { collectAuthoringDiagnostics, DiagnosticReportSchema } from "@/lib/authoring/diagnostics";

let tempDir: string;
let dbPath: string;
let backupDir: string;
let originalApiKey: string | undefined;
let originalBaseUrl: string | undefined;
let originalAllowLan: string | undefined;

describe("authoring diagnostics", () => {
  beforeEach(async () => {
    originalApiKey = process.env.OPENAI_API_KEY;
    originalBaseUrl = process.env.OPENAI_BASE_URL;
    originalAllowLan = process.env.STORYFORGE_ALLOW_LAN;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-diagnostics-"));
    dbPath = path.join(tempDir, "private-authoring.sqlite");
    backupDir = path.join(tempDir, "backups");
    const repository = createAuthoringRepository({ dbPath, backupDir });
    await repository.createProject({
      title: "诊断隐私测试",
      premise: "不应进入诊断输出的故事内容。",
      genre: "测试",
      tone: "安静",
      pointOfView: "第三人称",
      rating: "PG",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    repository.close();
    process.env.OPENAI_API_KEY = "sk-private-diagnostic-secret";
    process.env.OPENAI_BASE_URL = "https://user:password@example.invalid/private";
    process.env.STORYFORGE_ALLOW_LAN = "true";
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
    if (originalAllowLan === undefined) delete process.env.STORYFORGE_ALLOW_LAN;
    else process.env.STORYFORGE_ALLOW_LAN = originalAllowLan;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns only a redacted local readiness report", async () => {
    const report = await collectAuthoringDiagnostics({
      now: new Date("2026-08-24T12:00:00.000Z"),
      dbPath,
      backupDir,
    });

    expect(DiagnosticReportSchema.parse(report)).toEqual(report);
    expect(report.database.migrationVersion).toBe(10);
    expect(report.database.integrity).toBe("ok");
    expect(report.database.writable).toBe(true);
    expect(report.backup.freshness).toBe("missing");
    expect(report.network.binding).toBe("lan-override");
    expect(report.provider.status).toBe("configured");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("sk-private-diagnostic-secret");
    expect(serialized).not.toContain("user:password");
    expect(serialized).not.toContain(dbPath);
    expect(serialized).not.toContain("诊断隐私测试");
  });

  it("reports a fresh checkpoint without exposing its path", async () => {
    await createDatabaseCheckpoint(dbPath, 8, { backupDir, now: new Date("2026-08-24T11:30:00.000Z") });
    const report = await collectAuthoringDiagnostics({
      now: new Date("2026-08-24T12:00:00.000Z"),
      dbPath,
      backupDir,
    });

    expect(report.backup.freshness).toBe("fresh");
    expect(report.backup.status).toBe("ok");
    expect(report.backup.latestCreatedAt).toBe("2026-08-24T11:30:00.000Z");
    expect(JSON.stringify(report)).not.toContain(backupDir);
  });
});
