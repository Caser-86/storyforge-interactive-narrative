import type { JsonValue } from "../schemas";
import { AuthoringError } from "../errors";
import { redactSensitiveText } from "@/lib/errors";
import type { GenerationRepository } from "./repository";
import type { GenerationRun, GenerationStage, GenerationStep } from "./schemas";
import type { GenerationStepDescriptor } from "./schemas";
import { ProviderError } from "./provider-errors";
import { retryDecision } from "./retry";

function storedGenerationErrorMessage(error: ProviderError): string {
  let message: string;
  if (error.code === "SCHEMA" && error.details !== undefined && typeof error.details === "object") {
    message = `${error.message}: ${JSON.stringify(error.details)}`;
  } else {
    message = error.message;
  }

  return redactSensitiveText(message).slice(0, 500);
}

function exceedsHardOutputCap(run: GenerationRun, additionalOutputTokens = 0): boolean {
  const cap = run.budget?.hardCapOutputTokens;
  return cap !== null && cap !== undefined && run.outputTokens + Math.max(0, additionalOutputTokens) > cap;
}

export interface GenerationStepExecutionResult {
  parsedResponse?: JsonValue | null;
  rawResponse?: JsonValue | string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  nextSteps?: GenerationStepDescriptor[];
}

export type GenerationStepHandler = (
  step: GenerationStep,
  run: GenerationRun,
) => Promise<GenerationStepExecutionResult>;

export interface GenerationExecutorOptions {
  handlers: Partial<Record<Exclude<GenerationStage, "ready">, GenerationStepHandler>>;
}

export interface ExecutionResult {
  runStatus: GenerationRun["status"];
  processedSteps: number;
}

export class GenerationExecutor {
  constructor(
    private readonly repository: GenerationRepository,
    private readonly options: GenerationExecutorOptions,
  ) {}

  public async executeNext(runId: string, now: Date = new Date()): Promise<ExecutionResult> {
    const initialRun = await this.repository.getRun(runId);
    if (["paused", "failed", "completed", "canceled"].includes(initialRun.status)) {
      return { runStatus: initialRun.status, processedSteps: 0 };
    }

    const steps = await this.repository.leaseNextSteps(runId, now, 2);
    if (steps.length === 0) {
      const run = await this.repository.getRun(runId);
      return { runStatus: run.status, processedSteps: 0 };
    }

    const processStep = async (step: GenerationStep): Promise<{ shouldStop: boolean }> => {
      const run = await this.repository.getRun(runId);
      if (!["queued", "running"].includes(run.status)) {
        return { shouldStop: true };
      }
      const handler = this.options.handlers[step.stage];

      try {
        if (!handler) {
          throw new ProviderError("UNKNOWN", `No generation handler registered for ${step.stage}`, false);
        }

        if (exceedsHardOutputCap(run)) {
          await this.repository.pauseRun(runId, now, {
            code: "VALIDATION",
            message: "Generation output budget reached.",
          });
          return { shouldStop: true };
        }

        const result = await handler(step, run);
        const latestRun = await this.repository.getRun(runId);
        if (["paused", "failed", "completed", "canceled"].includes(latestRun.status)) {
          return { shouldStop: true };
        }
        if (exceedsHardOutputCap(latestRun, result.outputTokens ?? 0)) {
          await this.repository.pauseRun(runId, now, {
            code: "VALIDATION",
            message: "Generation output budget reached.",
          });
          return { shouldStop: true };
        }
        if (result.nextSteps && result.nextSteps.length > 0) {
          await this.repository.appendSteps(runId, result.nextSteps, now);
        }
        await this.repository.completeStep(step.id, {
          attempt: step.attempt,
          leaseExpiresAt: step.leaseExpiresAt!,
          completedAt: now,
          model: result.model,
          rawResponse: result.rawResponse,
          parsedResponse: result.parsedResponse,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
        return { shouldStop: false };
      } catch (error) {
        const decision = retryDecision(error, step.attempt, now);
        if (decision.error.code === "AUTH") {
          await this.repository.pauseRun(runId, now, {
            code: decision.error.code,
            message: storedGenerationErrorMessage(decision.error),
          });
          return { shouldStop: true };
        }

        try {
          await this.repository.failStep(step.id, {
            attempt: step.attempt,
            leaseExpiresAt: step.leaseExpiresAt!,
            failedAt: now,
            code: decision.error.code,
            message: storedGenerationErrorMessage(decision.error),
            retryable: decision.retryable,
            nextAttemptAt: decision.nextAttemptAt,
          });
        } catch (failureError) {
          if (failureError instanceof AuthoringError && failureError.code === "CONFLICT") {
            return { shouldStop: true };
          }
          throw failureError;
        }
        return { shouldStop: !decision.retryable };
      }
    };

    let processedSteps = 0;
    if (steps.length > 1 && steps.every((step) => step.stage === "nodes")) {
      await Promise.all(steps.map((step) => processStep(step)));
      processedSteps = steps.length;
    } else {
      for (const step of steps) {
        const outcome = await processStep(step);
        processedSteps += 1;
        if (outcome.shouldStop) break;
      }
    }

    const finalRun = await this.repository.getRun(runId);
    return { runStatus: finalRun.status, processedSteps };
  }

  public async recoverExpiredRuns(now: Date = new Date()): Promise<number> {
    const activeRuns = await this.repository.listActiveRuns();
    let recoveredSteps = 0;
    for (const run of activeRuns) {
      recoveredSteps += await this.repository.recoverExpiredSteps(run.id, now);
    }

    return recoveredSteps;
  }
}

export function createGenerationExecutor(
  repository: GenerationRepository,
  options: GenerationExecutorOptions,
): GenerationExecutor {
  return new GenerationExecutor(repository, options);
}
