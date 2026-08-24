import { describe, expect, it, vi } from "vitest";
import { createGenerationExecutor } from "@/lib/authoring/generation/executor";
import { ProviderError } from "@/lib/authoring/generation/provider-errors";
import { createGenerationRepository, DEFAULT_GENERATION_STEP_DESCRIPTORS } from "@/lib/authoring/generation/repository";
import type { GenerationStep } from "@/lib/authoring/generation/schemas";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { CreateProjectInput } from "@/lib/authoring/repository";
import fs from "fs";
import os from "os";
import path from "path";

const NOW = new Date(Date.UTC(2026, 7, 19, 12, 0, 0));

function projectInput(): CreateProjectInput {
  return {
    title: "Clockwork Orchard",
    premise: "A courier discovers a machine-grown forest beneath the city.",
    genre: "solarpunk mystery",
    tone: "hopeful suspense",
    pointOfView: "second person",
    rating: "PG-13",
    size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
  };
}

async function setup() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-executor-"));
  const dbPath = path.join(tempDir, "authoring.sqlite");
  const backupDir = path.join(tempDir, "backups");
  const authoring = createAuthoringRepository({ dbPath, backupDir });
  const project = await authoring.createProject(projectInput());
  const repository = createGenerationRepository({ dbPath, backupDir });

  return {
    tempDir,
    authoring,
    repository,
    project,
    close() {
      repository.close();
      authoring.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function handlerResult(step: GenerationStep) {
  return {
    parsedResponse: { stepKey: step.stepKey, ok: true },
    rawResponse: { fake: true, stepKey: step.stepKey },
    inputTokens: 3,
    outputTokens: 5,
    model: "fake-model",
  };
}

describe("generation executor", () => {
  it("does not call a completed step twice", async () => {
    const setupState = await setup();
    try {
      const run = await setupState.repository.createRun(setupState.project.id, setupState.project.activeDraftVersionId!, {
        now: NOW,
        steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
      });
      const handler = vi.fn(async (step: GenerationStep) => handlerResult(step));
      const executor = createGenerationExecutor(setupState.repository, { handlers: { brief: handler } });

      await executor.executeNext(run.id, NOW);
      await executor.executeNext(run.id, new Date(NOW.getTime() + 60_000));

      expect(handler).toHaveBeenCalledTimes(1);
      expect((await setupState.repository.getRun(run.id)).status).toBe("completed");
    } finally {
      setupState.close();
    }
  });

  it("retries transient failures with stored backoff", async () => {
    const setupState = await setup();
    try {
      const run = await setupState.repository.createRun(setupState.project.id, setupState.project.activeDraftVersionId!, {
        now: NOW,
        steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
      });
      const handler = vi
        .fn()
        .mockRejectedValueOnce(new ProviderError("RATE_LIMIT", "slow down", true))
        .mockImplementation(async (step: GenerationStep) => handlerResult(step));
      const executor = createGenerationExecutor(setupState.repository, { handlers: { brief: handler } });

      expect((await executor.executeNext(run.id, NOW)).runStatus).toBe("queued");
      expect((await executor.executeNext(run.id, new Date(NOW.getTime() + 16_000))).runStatus).toBe("completed");
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      setupState.close();
    }
  });

  it("pauses non-retryable authentication errors", async () => {
    const setupState = await setup();
    try {
      const run = await setupState.repository.createRun(setupState.project.id, setupState.project.activeDraftVersionId!, {
        now: NOW,
        steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
      });
      const handler = vi.fn().mockRejectedValue(new ProviderError("AUTH", "invalid key", false));
      const executor = createGenerationExecutor(setupState.repository, { handlers: { brief: handler } });

      expect((await executor.executeNext(run.id, NOW)).runStatus).toBe("paused");
      expect((await setupState.repository.getRun(run.id)).lastErrorCode).toBe("AUTH");
    } finally {
      setupState.close();
    }
  });

  it("does not surface a provider result that arrives after cancellation", async () => {
    const setupState = await setup();
    try {
      const run = await setupState.repository.createRun(setupState.project.id, setupState.project.activeDraftVersionId!, {
        now: NOW,
        steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
      });
      const handler = vi.fn(async (step: GenerationStep) => {
        await setupState.repository.cancelRun(run.id, new Date(NOW.getTime() + 1_000));
        return handlerResult(step);
      });
      const executor = createGenerationExecutor(setupState.repository, { handlers: { brief: handler } });

      await expect(executor.executeNext(run.id, NOW)).resolves.toMatchObject({
        runStatus: "canceled",
        processedSteps: 1,
      });
      expect((await setupState.repository.listSteps(run.id))[0]!.status).toBe("canceled");
      expect((await setupState.repository.getRun(run.id)).inputTokens).toBe(0);
    } finally {
      setupState.close();
    }
  });

  it("pauses before persisting a provider result that exceeds the hard output cap", async () => {
    const setupState = await setup();
    try {
      const run = await setupState.repository.createRun(setupState.project.id, setupState.project.activeDraftVersionId!, {
        now: NOW,
        budget: {
          policyVersion: "generation-budget@1",
          providerCallCount: 1,
          maxOutputTokens: 10,
          hardCapOutputTokens: 4,
          estimatedOutputCost: null,
          requiresConfirmation: false,
        },
        steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
      });
      const handler = vi.fn(async (step: GenerationStep) => ({ ...handlerResult(step), outputTokens: 5 }));
      const executor = createGenerationExecutor(setupState.repository, { handlers: { brief: handler } });

      await expect(executor.executeNext(run.id, NOW)).resolves.toMatchObject({ runStatus: "paused" });
      expect((await setupState.repository.getRun(run.id)).lastErrorCode).toBe("VALIDATION");
      expect((await setupState.repository.getRun(run.id)).outputTokens).toBe(0);
      expect((await setupState.repository.listSteps(run.id))[0]!.status).toBe("queued");
    } finally {
      setupState.close();
    }
  });

  it("caps transient retries at three attempts", async () => {
    const setupState = await setup();
    try {
      const run = await setupState.repository.createRun(setupState.project.id, setupState.project.activeDraftVersionId!, {
        now: NOW,
        steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
      });
      const handler = vi.fn().mockRejectedValue(new ProviderError("NETWORK", "upstream unavailable", true));
      const executor = createGenerationExecutor(setupState.repository, { handlers: { brief: handler } });

      await executor.executeNext(run.id, NOW);
      await executor.executeNext(run.id, new Date(NOW.getTime() + 16_000));
      await executor.executeNext(run.id, new Date(NOW.getTime() + 76_000));
      expect((await executor.executeNext(run.id, new Date(NOW.getTime() + 376_000))).runStatus).toBe("failed");

      expect(handler).toHaveBeenCalledTimes(3);
    } finally {
      setupState.close();
    }
  });

  it("reclaims expired leases without needing a process-memory queue", async () => {
    const setupState = await setup();
    try {
      const run = await setupState.repository.createRun(setupState.project.id, setupState.project.activeDraftVersionId!, { now: NOW });
      await setupState.repository.leaseNextSteps(run.id, NOW, 1);
      const executor = createGenerationExecutor(setupState.repository, { handlers: {} });

      expect(await executor.recoverExpiredRuns(new Date(NOW.getTime() + 6 * 60_000))).toBe(1);
    } finally {
      setupState.close();
    }
  });

  it("runs leased node content steps concurrently", async () => {
    const setupState = await setup();
    try {
      const run = await setupState.repository.createRun(setupState.project.id, setupState.project.activeDraftVersionId!, {
        now: NOW,
        steps: [
          { stepKey: "nodes:a", stage: "nodes", subjectId: "node-a", sortOrder: 0 },
          { stepKey: "nodes:b", stage: "nodes", subjectId: "node-b", sortOrder: 1 },
        ],
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let resolveSecond!: () => void;
      const secondStarted = new Promise<string>((resolve) => { resolveSecond = () => resolve("started"); });
      const handler = vi.fn(async (step: GenerationStep) => {
        if (step.stepKey === "nodes:b") resolveSecond();
        await gate;
        return handlerResult(step);
      });
      const executor = createGenerationExecutor(setupState.repository, { handlers: { nodes: handler } });

      const execution = executor.executeNext(run.id, NOW);
      const result = await Promise.race([
        secondStarted,
        new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 100)),
      ]);
      release();
      await execution;

      expect(result).toBe("started");
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      setupState.close();
    }
  });
});
