import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAuthoringRepository, type AuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository, type InteractiveRepository } from "@/lib/interactive/repository";
import { createInteractiveJobRepository, type InteractiveJobRepository } from "@/lib/interactive/jobs";
import { createInteractiveUsageRepository, InteractiveUsageProvider, type InteractiveUsageRepository } from "@/lib/interactive/usage";
import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import type { GenerationProvider } from "@/lib/authoring/generation/provider";
import type { InteractiveState } from "@/lib/interactive/schemas";

let tempDir: string;
let databaseOptions: { dbPath: string; backupDir: string };
let authoring: AuthoringRepository;
let interactive: InteractiveRepository;
let usage: InteractiveUsageRepository;
let jobs: InteractiveJobRepository;
let originalBudget: string | undefined;

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
  originalBudget = process.env.STORYFORGE_MAX_OUTPUT_TOKENS;
  process.env.STORYFORGE_MAX_OUTPUT_TOKENS = "5000";
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-interactive-usage-"));
  databaseOptions = { dbPath: path.join(tempDir, "authoring.sqlite"), backupDir: path.join(tempDir, "backups") };
  authoring = createAuthoringRepository(databaseOptions);
  interactive = createInteractiveRepository(databaseOptions);
  usage = createInteractiveUsageRepository(databaseOptions);
  jobs = createInteractiveJobRepository(databaseOptions);
});

afterEach(() => {
  usage.close();
  jobs.close();
  interactive.close();
  authoring.close();
  if (originalBudget === undefined) delete process.env.STORYFORGE_MAX_OUTPUT_TOKENS;
  else process.env.STORYFORGE_MAX_OUTPUT_TOKENS = originalBudget;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function createSessionFixture(): Promise<{ projectId: string; sessionId: string; taskId: string }> {
  const project = await authoring.createProject({
    title: "预算账本测试",
    premise: state.seedPrompt,
    genre: "悬疑",
    tone: "克制",
    pointOfView: "第二人称",
    rating: "PG-13",
    size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
  });
  const session = await interactive.createSession(project.id, state);
  const task = (await jobs.listForSession(project.id, session.id))[0];
  if (!task) throw new Error("Expected an opening task");
  return { projectId: project.id, sessionId: session.id, taskId: task.id };
}

describe("interactive usage ledger", () => {
  it("atomically reserves output budget and settles confirmed usage once", async () => {
    const fixture = await createSessionFixture();
    const first = await usage.reserve({
      projectId: fixture.projectId,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      taskAttempt: 1,
      callIndex: 1,
      kind: "scene",
      model: "deepseek-v4-flash",
      reservedOutputTokens: 3200,
    });

    await expect(usage.reserve({
      projectId: fixture.projectId,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      taskAttempt: 1,
      callIndex: 2,
      kind: "ending-repair",
      model: "deepseek-v4-flash",
      reservedOutputTokens: 3200,
    })).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(usage.complete(first, { requestId: "req-1", inputTokens: 800, outputTokens: 1200, latencyMs: 42 })).resolves.toBe(true);
    await expect(usage.complete(first, { requestId: "req-1", inputTokens: 800, outputTokens: 1200, latencyMs: 42 })).resolves.toBe(false);
    expect(await usage.getSessionBudget(fixture.projectId, fixture.sessionId)).toMatchObject({ limit: 5000, reserved: 0, consumed: 1200, unknown: 0 });
    expect((await usage.listForSession(fixture.projectId, fixture.sessionId))[0]).toMatchObject({ status: "succeeded", inputTokens: 800, outputTokens: 1200, requestId: "req-1" });
  });

  it("retains a failed request as unknown usage instead of treating it as free", async () => {
    const fixture = await createSessionFixture();
    const reservation = await usage.reserve({
      projectId: fixture.projectId,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      taskAttempt: 1,
      callIndex: 1,
      kind: "scene",
      model: "deepseek-v4-flash",
      reservedOutputTokens: 3200,
    });

    await expect(usage.fail(reservation, { code: "TIMEOUT", message: "请求超时。" })).resolves.toBe(true);
    expect(await usage.getSessionBudget(fixture.projectId, fixture.sessionId)).toMatchObject({ reserved: 0, consumed: 0, unknown: 3200 });
    await expect(usage.reserve({
      projectId: fixture.projectId,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      taskAttempt: 1,
      callIndex: 2,
      kind: "scene",
      model: "deepseek-v4-flash",
      reservedOutputTokens: 3200,
    })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("records provider calls without storing prompts", async () => {
    const fixture = await createSessionFixture();
    const outputSchema = z.object({ ok: z.boolean() });
    const base: GenerationProvider = {
      generate: async (request) => ({
        data: request.outputSchema.parse({ ok: true }),
        rawResponse: "{\"ok\":true}",
        inputTokens: 12,
        outputTokens: 4,
        latencyMs: 7,
        model: "deepseek-v4-flash",
        requestId: "req-provider",
      }),
    };
    const provider = new InteractiveUsageProvider(base, {
      databaseOptions,
      projectId: fixture.projectId,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      taskAttempt: 1,
    });

    await expect(provider.generate({
      stage: "nodes",
      stepKey: "interactive:opening",
      systemPrompt: "private system prompt that must not be persisted",
      userPrompt: "private story prompt that must not be persisted",
      outputSchema,
      model: "deepseek-v4-flash",
      maxTokens: 100,
    })).resolves.toMatchObject({ outputTokens: 4 });
    provider.close();

    const ledger = (await usage.listForSession(fixture.projectId, fixture.sessionId))[0];
    expect(ledger).toMatchObject({ status: "succeeded", requestId: "req-provider", inputTokens: 12, outputTokens: 4 });
    expect(JSON.stringify(ledger)).not.toContain("private story prompt");
    expect(JSON.stringify(ledger)).not.toContain("private system prompt");
  });

  it("retains successful responses with unconfirmed usage as unknown budget", async () => {
    const fixture = await createSessionFixture();
    const outputSchema = z.object({ ok: z.boolean() });
    const base: GenerationProvider = {
      generate: async (request) => ({
        data: request.outputSchema.parse({ ok: true }),
        rawResponse: "{\"ok\":true}",
        inputTokens: 0,
        outputTokens: 0,
        usageConfirmed: false,
        latencyMs: 7,
        model: "deepseek-v4-flash",
      }),
    };
    const provider = new InteractiveUsageProvider(base, {
      databaseOptions,
      projectId: fixture.projectId,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      taskAttempt: 1,
    });

    await expect(provider.generate({
      stage: "nodes",
      stepKey: "interactive:opening",
      systemPrompt: "system",
      userPrompt: "prompt",
      outputSchema,
      model: "deepseek-v4-flash",
      maxTokens: 100,
    })).resolves.toMatchObject({ outputTokens: 0 });
    provider.close();

    const ledger = (await usage.listForSession(fixture.projectId, fixture.sessionId))[0];
    expect(ledger).toMatchObject({ status: "unknown", outputTokens: null, reservedOutputTokens: 100 });
    expect(await usage.getSessionBudget(fixture.projectId, fixture.sessionId)).toMatchObject({ reserved: 0, consumed: 0, unknown: 100 });
  });

  it("redacts credentials from failure metadata", async () => {
    const fixture = await createSessionFixture();
    const outputSchema = z.object({ ok: z.boolean() });
    const provider = new InteractiveUsageProvider({
      generate: async () => {
        throw new ProviderError("NETWORK", "request failed apiKey=sk-secret-value", true);
      },
    }, {
      databaseOptions,
      projectId: fixture.projectId,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      taskAttempt: 1,
    });

    await expect(provider.generate({
      stage: "nodes",
      stepKey: "interactive:opening",
      systemPrompt: "system",
      userPrompt: "prompt",
      outputSchema,
      model: "deepseek-v4-flash",
      maxTokens: 100,
    })).rejects.toMatchObject({ code: "NETWORK" });
    provider.close();

    const ledger = (await usage.listForSession(fixture.projectId, fixture.sessionId))[0];
    expect(ledger?.errorMessage).not.toContain("sk-secret-value");
    expect(ledger?.errorMessage).toContain("apiKey=[redacted]");
  });

  it("redacts Volcengine credentials from failure metadata", async () => {
    const fixture = await createSessionFixture();
    const outputSchema = z.object({ ok: z.boolean() });
    const provider = new InteractiveUsageProvider({
      generate: async () => {
        throw new ProviderError("AUTH", "invalid credential ark-live-secret-value", false);
      },
    }, {
      databaseOptions,
      projectId: fixture.projectId,
      sessionId: fixture.sessionId,
      taskId: fixture.taskId,
      taskAttempt: 1,
    });

    await expect(provider.generate({
      stage: "nodes",
      stepKey: "interactive:opening",
      systemPrompt: "system",
      userPrompt: "prompt",
      outputSchema,
      model: "doubao-seed-evolving",
      maxTokens: 100,
    })).rejects.toMatchObject({ code: "AUTH" });
    provider.close();

    const ledger = (await usage.listForSession(fixture.projectId, fixture.sessionId))[0];
    expect(ledger?.errorMessage).not.toContain("ark-live-secret-value");
    expect(ledger?.errorMessage).toContain("ark-[redacted]");
  });
});
