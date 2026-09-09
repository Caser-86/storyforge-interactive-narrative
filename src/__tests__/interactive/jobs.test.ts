import fs from "node:fs";
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository, type AuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveJobRepository, INTERACTIVE_JOB_LEASE_MS, type InteractiveJobRepository } from "@/lib/interactive/jobs";
import { createInteractiveRepository, type InteractiveRepository } from "@/lib/interactive/repository";
import { FakeInteractiveGenerationProvider } from "@/lib/interactive/fake-provider";
import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import { cancelInteractiveGenerationForSession, resetInteractiveWorkerForTests, runInteractiveGenerationForSession } from "@/lib/interactive/worker";
import type { GenerationProvider } from "@/lib/authoring/generation/provider";
import type { InteractiveState } from "@/lib/interactive/schemas";

let tempDir: string;
let authoring: AuthoringRepository;
let interactive: InteractiveRepository;
let jobs: InteractiveJobRepository;
let databaseOptions: { dbPath: string; backupDir: string };

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

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-interactive-jobs-"));
  databaseOptions = { dbPath: path.join(tempDir, "authoring.sqlite"), backupDir: path.join(tempDir, "backups") };
  authoring = createAuthoringRepository(databaseOptions);
  interactive = createInteractiveRepository(databaseOptions);
  jobs = createInteractiveJobRepository(databaseOptions);
});

afterEach(() => {
  jobs.close();
  interactive.close();
  authoring.close();
  resetInteractiveWorkerForTests();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("interactive generation jobs", () => {
  it("persists an opening job and reclaims an expired lease after a simulated restart", async () => {
    const project = await authoring.createProject({
      title: "任务持久化测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    const queued = await jobs.listForSession(project.id, session.id);

    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "opening", status: "queued", attempt: 0, expectedTurn: 0 });

    const now = new Date("2026-09-08T00:00:00.000Z");
    const firstClaim = await jobs.claimForSession(project.id, session.id, now);
    expect(firstClaim).toMatchObject({ status: "running", attempt: 1 });
    expect(firstClaim?.leaseToken).toBeTruthy();

    jobs.close();
    jobs = createInteractiveJobRepository({ dbPath: path.join(tempDir, "authoring.sqlite"), backupDir: path.join(tempDir, "backups") });

    const reclaimed = await jobs.claimForSession(
      project.id,
      session.id,
      new Date(now.getTime() + INTERACTIVE_JOB_LEASE_MS + 1),
    );
    expect(reclaimed).toMatchObject({ status: "running", attempt: 2 });
    expect(reclaimed?.leaseToken).not.toBe(firstClaim?.leaseToken);

    await expect(firstClaim ? jobs.complete(firstClaim, new Date(now.getTime() + INTERACTIVE_JOB_LEASE_MS + 2)) : Promise.resolve(false)).resolves.toBe(false);
    await expect(reclaimed ? jobs.complete(reclaimed, new Date(now.getTime() + INTERACTIVE_JOB_LEASE_MS + 3)) : Promise.resolve(false)).resolves.toBe(true);
    expect((await jobs.listForSession(project.id, session.id))[0]?.status).toBe("succeeded");
  });

  it("cancels queued and running work so it cannot be reclaimed", async () => {
    const project = await authoring.createProject({
      title: "任务取消测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    const claim = await jobs.claimForSession(project.id, session.id, new Date("2026-09-08T00:00:00.000Z"));

    expect(claim).not.toBeNull();
    await jobs.cancelForSession(project.id, session.id, "作者取消了本次生成。");

    expect((await jobs.listForSession(project.id, session.id))[0]).toMatchObject({ status: "canceled", lastError: "作者取消了本次生成。" });
    await expect(jobs.claimForSession(project.id, session.id, new Date("2026-09-08T01:00:00.000Z"))).resolves.toBeNull();
  });

  it("fails a queued job whose retry deadline expired before it could be reclaimed", async () => {
    const project = await authoring.createProject({
      title: "过期队列测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    const direct = new Database(databaseOptions.dbPath);
    direct.prepare(
      "UPDATE interactive_generation_jobs SET deadline_at = ?, next_attempt_at = ? WHERE project_id = ? AND session_id = ?",
    ).run("2026-09-08T00:00:00.000Z", "2026-09-08T00:00:00.000Z", project.id, session.id);
    direct.close();

    await expect(jobs.claimForSession(project.id, session.id, new Date("2026-09-08T01:00:00.000Z"))).resolves.toBeNull();
    expect((await jobs.listForSession(project.id, session.id))[0]).toMatchObject({
      status: "failed",
      lastError: "Generation job exceeded its retry deadline.",
    });

    await runInteractiveGenerationForSession(project.id, session.id, {
      provider: new FakeInteractiveGenerationProvider(),
      databaseOptions,
    });
    expect(await interactive.getSession(project.id, session.id)).toMatchObject({ status: "failed" });
  });

  it("does not let an expired worker fail a job reclaimed by a newer worker", async () => {
    const project = await authoring.createProject({
      title: "任务租约竞争测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    const now = new Date("2026-09-08T00:00:00.000Z");
    const firstClaim = await jobs.claimForSession(project.id, session.id, now);
    expect(firstClaim).not.toBeNull();
    const secondClaim = await jobs.claimForSession(project.id, session.id, new Date(now.getTime() + INTERACTIVE_JOB_LEASE_MS + 1));
    expect(secondClaim).not.toBeNull();

    const staleFailure = await jobs.fail(firstClaim!, "旧 worker 失败", false, new Date(now.getTime() + INTERACTIVE_JOB_LEASE_MS + 2));
    expect(staleFailure.accepted).toBe(false);
    expect((await jobs.get(project.id, secondClaim!.id)).status).toBe("running");
  });

  it("runs a persisted opening job through the worker and records completion", async () => {
    const project = await authoring.createProject({
      title: "任务执行测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);

    await runInteractiveGenerationForSession(project.id, session.id, {
      provider: new FakeInteractiveGenerationProvider(),
      databaseOptions,
    });

    expect((await interactive.getSession(project.id, session.id)).status).toBe("active");
    expect((await jobs.listForSession(project.id, session.id))[0]).toMatchObject({ status: "succeeded", attempt: 1 });
  });

  it("retries schema drift inside one worker job without creating a duplicate turn", async () => {
    const project = await authoring.createProject({
      title: "结构漂移重试测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    const fallback = new FakeInteractiveGenerationProvider();
    let attempts = 0;
    const provider: GenerationProvider = {
      generate: async (request) => {
        attempts += 1;
        if (attempts === 1) throw new ProviderError("SCHEMA", "model output drift", false);
        return fallback.generate(request);
      },
    };

    await runInteractiveGenerationForSession(project.id, session.id, { provider, databaseOptions });

    expect(attempts).toBe(2);
    expect(await interactive.getSession(project.id, session.id)).toMatchObject({ status: "active", turn: 1, lastError: null });
    expect((await interactive.listTurns(project.id, session.id))).toHaveLength(1);
    expect((await jobs.listForSession(project.id, session.id))[0]).toMatchObject({ status: "succeeded", attempt: 1 });
  });

  it("cancels an in-flight provider request before it can write a scene", async () => {
    const project = await authoring.createProject({
      title: "取消执行测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    const provider: GenerationProvider = {
      generate: async (request) => new Promise((_, reject) => {
        if (request.signal?.aborted) {
          reject(new DOMException("Generation canceled", "AbortError"));
          return;
        }
        request.signal?.addEventListener("abort", () => reject(new DOMException("Generation canceled", "AbortError")), { once: true });
      }),
    };

    const running = runInteractiveGenerationForSession(project.id, session.id, { provider, databaseOptions });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((await jobs.listForSession(project.id, session.id))[0]?.status === "running") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await interactive.cancelGeneration(project.id, session.id);
    cancelInteractiveGenerationForSession(session.id);
    await running;

    expect(await interactive.getSession(project.id, session.id)).toMatchObject({ status: "failed", lastError: "作者取消了本次生成。", scene: null });
    expect((await jobs.listForSession(project.id, session.id))[0]).toMatchObject({ status: "canceled", lastError: "作者取消了本次生成。" });
  });

  it("bounds concurrent generation across independent sessions", async () => {
    const projects = await Promise.all([1, 2, 3].map((index) => authoring.createProject({
      title: `并发任务测试${index}`,
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    })));
    const sessions = await Promise.all(projects.map((project) => interactive.createSession(project.id, state)));
    const base = new FakeInteractiveGenerationProvider();
    let active = 0;
    let peak = 0;
    const provider: GenerationProvider = {
      generate: async (request) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        try {
          return await base.generate(request);
        } finally {
          active -= 1;
        }
      },
    };

    await Promise.all(sessions.map((session) => runInteractiveGenerationForSession(session.projectId, session.id, { provider, databaseOptions })));

    expect(peak).toBeLessThanOrEqual(2);
    expect((await Promise.all(sessions.map((session) => interactive.getSession(session.projectId, session.id)))).every((item) => item.status === "active")).toBe(true);
  });

  it("contains a worker database initialization failure", async () => {
    const project = await authoring.createProject({
      title: "初始化失败测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const session = await interactive.createSession(project.id, state);
    const databaseDirectory = path.join(tempDir, "not-a-database");
    fs.mkdirSync(databaseDirectory);

    await expect(runInteractiveGenerationForSession(project.id, session.id, {
      provider: new FakeInteractiveGenerationProvider(),
      databaseOptions: { dbPath: databaseDirectory, backupDir: path.join(tempDir, "invalid-backups") },
    })).resolves.toBeUndefined();
    expect((await jobs.listForSession(project.id, session.id))[0]?.status).toBe("queued");
  });
});
