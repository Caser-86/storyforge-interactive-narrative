import { createAuthoringRepository } from "@/lib/authoring/repository";
import { acquireAuthoringDatabase } from "@/lib/authoring/database";
import { classifyProviderError } from "@/lib/authoring/generation/provider-errors";
import { AuthoringError } from "@/lib/authoring/errors";
import { redactSensitiveText } from "@/lib/errors";
import type { GenerationProvider } from "@/lib/authoring/generation/provider";
import type { AuthoringDatabaseOptions } from "@/lib/authoring/database";
import { createInteractiveJobRepository, type InteractiveGenerationJobClaim } from "./jobs";
import { interactiveGenerationFailureMessage } from "./failure";
import { createInteractiveGenerationProvider, generateInteractiveScene } from "./generator";
import { createInteractiveRepository, type InteractiveGenerationClaim } from "./repository";
import { generateWithInteractiveRetry } from "./retry";
import { InteractiveUsageProvider } from "./usage";

export type InteractiveWorkerOptions = {
  provider?: GenerationProvider;
  databaseOptions?: AuthoringDatabaseOptions;
};

const activeRuns = new Map<string, Promise<void>>();
const activeControllers = new Map<string, AbortController>();
export const INTERACTIVE_WORKER_MAX_CONCURRENCY = 2;
let activeWorkerCount = 0;
const workerSlotWaiters: Array<() => void> = [];

async function acquireWorkerSlot(): Promise<() => void> {
  if (activeWorkerCount >= INTERACTIVE_WORKER_MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => workerSlotWaiters.push(resolve));
  }
  activeWorkerCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeWorkerCount = Math.max(0, activeWorkerCount - 1);
    workerSlotWaiters.shift()?.();
  };
}

function claimForNextScene(job: InteractiveGenerationJobClaim): InteractiveGenerationClaim {
  if (!job.turnId || !job.choiceId || !job.generationToken) {
    throw new Error("Interactive next-scene job is missing its generation claim.");
  }
  return {
    sessionId: job.sessionId,
    generationToken: job.generationToken,
    turnId: job.turnId,
    choiceId: job.choiceId,
    jobId: job.id,
  };
}

async function runSessionGeneration(projectId: string, sessionId: string, options: InteractiveWorkerOptions): Promise<void> {
  const releaseWorkerSlot = await acquireWorkerSlot();
  let databaseLease: ReturnType<typeof acquireAuthoringDatabase> | undefined;
  let authoring: ReturnType<typeof createAuthoringRepository> | undefined;
  let interactive: ReturnType<typeof createInteractiveRepository> | undefined;
  let jobs: ReturnType<typeof createInteractiveJobRepository> | undefined;

  try {
    databaseLease = acquireAuthoringDatabase(options.databaseOptions);
    const sharedDatabaseOptions = {
      ...(options.databaseOptions ?? {}),
      database: databaseLease.database,
    };
    authoring = createAuthoringRepository(sharedDatabaseOptions);
    interactive = createInteractiveRepository(sharedDatabaseOptions);
    jobs = createInteractiveJobRepository(sharedDatabaseOptions);
    const provider = options.provider ?? createInteractiveGenerationProvider();

    for (;;) {
      const job = await jobs.claimForSession(projectId, sessionId);
      if (!job) {
        const current = await interactive.getSession(projectId, sessionId);
        const sessionJobs = await jobs.listForSession(projectId, sessionId);
        const hasRunnableJob = sessionJobs.some((candidate) => candidate.status === "queued" || candidate.status === "running");
        if (current.status === "generating" && !hasRunnableJob && sessionJobs.some((candidate) => candidate.status === "failed")) {
          await interactive.recoverStaleGeneration(sessionId, 0);
        }
        return;
      }

      const controller = new AbortController();
      activeControllers.set(sessionId, controller);
      let trackedProvider: InteractiveUsageProvider | undefined;
      try {
        trackedProvider = new InteractiveUsageProvider(provider, {
          databaseOptions: sharedDatabaseOptions,
          projectId,
          sessionId,
          taskId: job.id,
          taskAttempt: job.attempt,
        });
        const project = await authoring.getProject(projectId);
        const session = await interactive.getSession(projectId, sessionId);
        if (session.status !== "generating") {
          await jobs.cancelForSession(projectId, sessionId, "Interactive session is no longer generating.");
          return;
        }

        if (job.kind === "opening") {
          if (session.turn !== 0 || session.scene !== null) {
            await jobs.cancelForSession(projectId, sessionId, "Interactive opening job no longer matches the session.");
            return;
          }
          const generated = await generateWithInteractiveRetry(
            (signal) => generateInteractiveScene({ project, state: session.state, signal }, trackedProvider!),
            { signal: controller.signal, retrySchemaFailures: true },
          );
          await interactive.saveInitialScene(sessionId, generated.scene, generated.state, job);
        } else {
          if (!session.scene || session.turn !== job.expectedTurn) {
            await jobs.cancelForSession(projectId, sessionId, "Interactive next-scene job no longer matches the session.");
            return;
          }
          const choice = session.scene.choices.find((candidate) => candidate.id === job.choiceId);
          if (!choice) throw new Error("Interactive generation choice is missing from the current scene.");
          const claim = claimForNextScene(job);
          const generated = await generateWithInteractiveRetry(
            (signal) => generateInteractiveScene({ project, state: session.state, previousScene: session.scene, selectedChoice: choice, signal }, trackedProvider!),
            { signal: controller.signal, retrySchemaFailures: true },
          );
          await interactive.saveNextScene(sessionId, claim, generated.scene, generated.state, job);
        }
      } catch (error) {
        const currentJob = await jobs.get(projectId, job.id);
        if (controller.signal.aborted || currentJob.status === "canceled") return;

        const providerError = classifyProviderError(error);
        const failure = await jobs.fail(job, interactiveGenerationFailureMessage(error, job.kind), providerError.retryable);
        if (!failure.accepted) return;
        if (failure.status === "queued") continue;

        if (job.kind === "opening") {
          await interactive.failInitialGeneration(sessionId, interactiveGenerationFailureMessage(error, "opening"));
        } else {
          await interactive.releaseChoice(claimForNextScene(job), interactiveGenerationFailureMessage(error, "next"));
        }
        return;
      } finally {
        trackedProvider?.close();
        if (activeControllers.get(sessionId) === controller) activeControllers.delete(sessionId);
      }
    }
  } catch (error) {
    if (!(error instanceof AuthoringError && error.code === "NOT_FOUND")) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[interactive] persistent generation worker failed", redactSensitiveText(message).slice(0, 500));
    }
  } finally {
    jobs?.close();
    interactive?.close();
    authoring?.close();
    databaseLease?.release();
    releaseWorkerSlot();
  }
}

export function runInteractiveGenerationForSession(
  projectId: string,
  sessionId: string,
  options: InteractiveWorkerOptions = {},
): Promise<void> {
  const existing = activeRuns.get(sessionId);
  if (existing) return existing;

  const run = runSessionGeneration(projectId, sessionId, options)
    .catch(() => {
      console.error("[interactive] persistent generation worker initialization failed");
    })
    .finally(() => {
    if (activeRuns.get(sessionId) === run) activeRuns.delete(sessionId);
  });
  activeRuns.set(sessionId, run);
  return run;
}

export function cancelInteractiveGenerationForSession(sessionId: string): void {
  activeControllers.get(sessionId)?.abort();
}

export function resetInteractiveWorkerForTests(): void {
  activeRuns.clear();
  activeControllers.clear();
}
