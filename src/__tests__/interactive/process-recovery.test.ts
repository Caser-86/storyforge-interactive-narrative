import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveJobRepository, INTERACTIVE_JOB_LEASE_MS } from "@/lib/interactive/jobs";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import type { InteractiveState } from "@/lib/interactive/schemas";

const state: InteractiveState = {
  seedPrompt: "一名档案员发现一扇不该存在的门。",
  turn: 1,
  targetTurns: 6,
  knownFacts: [],
  openThreads: [],
  resolvedThreads: [],
  lastChoiceImpact: "",
  endingReadiness: 0,
};

let tempDir: string | undefined;

function runChild(action: "claim" | "complete", dbPath: string, backupDir: string, projectId: string, sessionId: string, now: Date) {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("src/__tests__/interactive/fixtures/process-recovery-worker.ts"),
      action,
      dbPath,
      backupDir,
      projectId,
      sessionId,
      now.toISOString(),
    ],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30_000, windowsHide: true },
  );

  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout) as { id?: string; attempt?: number; status?: string; leaseToken?: string; claim?: { attempt: number; status: string }; completed?: boolean };
}

async function startLockHolder(dbPath: string, backupDir: string, projectId: string, sessionId: string, now: Date, holdMs: number): Promise<{ child: ChildProcessWithoutNullStreams; stderr: string[] }> {
  const child = spawn(
    process.execPath,
    [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("src/__tests__/interactive/fixtures/process-recovery-worker.ts"),
      "hold",
      dbPath,
      backupDir,
      projectId,
      sessionId,
      now.toISOString(),
      String(holdMs),
    ],
    { cwd: process.cwd(), windowsHide: true },
  );
  const stderr: string[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  await new Promise<void>((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("locked")) resolve();
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Lock holder exited before acquiring the lock: ${code}`)));
  });
  return { child, stderr };
}

function waitForChild(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("interactive generation process recovery", () => {
  it("recovers a leased job after the claiming process exits", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-interactive-process-"));
    const dbPath = path.join(tempDir, "authoring.sqlite");
    const backupDir = path.join(tempDir, "backups");
    const authoring = createAuthoringRepository({ dbPath, backupDir });
    const interactive = createInteractiveRepository({ dbPath, backupDir });
    const project = await authoring.createProject({
      title: "跨进程恢复测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    authoring.close();
    interactive.close();

    const claimed = runChild("claim", dbPath, backupDir, project.id, session.id, new Date("2026-09-08T00:00:00.000Z"));
    expect(claimed).toMatchObject({ status: "running", attempt: 1 });
    expect(claimed.leaseToken).toBeTruthy();

    const recovered = runChild(
      "complete",
      dbPath,
      backupDir,
      project.id,
      session.id,
      new Date(new Date("2026-09-08T00:00:00.000Z").getTime() + INTERACTIVE_JOB_LEASE_MS + 1),
    );
    expect(recovered).toMatchObject({ completed: true, claim: { status: "running", attempt: 2 } });

    const jobs = createInteractiveJobRepository({ dbPath, backupDir });
    await expect(jobs.listForSession(project.id, session.id)).resolves.toMatchObject([{ status: "succeeded", attempt: 2 }]);
    jobs.close();
  });

  it("waits through a short cross-process SQLite writer lock", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-interactive-busy-"));
    const dbPath = path.join(tempDir, "authoring.sqlite");
    const backupDir = path.join(tempDir, "backups");
    const authoring = createAuthoringRepository({ dbPath, backupDir });
    const interactive = createInteractiveRepository({ dbPath, backupDir });
    const project = await authoring.createProject({
      title: "数据库忙测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    authoring.close();
    interactive.close();

    const now = new Date("2026-09-08T00:00:00.000Z");
    const holder = await startLockHolder(dbPath, backupDir, project.id, session.id, now, 250);
    const startedAt = Date.now();
    const claimed = runChild("claim", dbPath, backupDir, project.id, session.id, now);
    const elapsedMs = Date.now() - startedAt;

    expect(claimed).toMatchObject({ status: "running", attempt: 1 });
    expect(elapsedMs).toBeGreaterThanOrEqual(150);
    expect(await waitForChild(holder.child)).toBe(0);
    expect(holder.stderr).toEqual([]);
  });
});
