import type { JsonValue } from "../schemas";
import type { GenerationRepository } from "./repository";
import type { GenerationRun, GenerationStage, GenerationStep } from "./schemas";
import type { GenerationStepDescriptor } from "./schemas";
import { ProviderError } from "./provider-errors";
import { retryDecision } from "./retry";

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

    let processedSteps = 0;
    for (const step of steps) {
      const run = await this.repository.getRun(runId);
      const handler = this.options.handlers[step.stage];

      try {
        if (!handler) {
          throw new ProviderError("UNKNOWN", `No generation handler registered for ${step.stage}`, false);
        }

        const result = await handler(step, run);
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
        processedSteps += 1;
      } catch (error) {
        const decision = retryDecision(error, step.attempt, now);
        if (decision.error.code === "AUTH") {
          const paused = await this.repository.pauseRun(runId, now, {
            code: decision.error.code,
            message: decision.error.message,
          });
          return { runStatus: paused.status, processedSteps: processedSteps + 1 };
        }

        await this.repository.failStep(step.id, {
          attempt: step.attempt,
          leaseExpiresAt: step.leaseExpiresAt!,
          failedAt: now,
          code: decision.error.code,
          message: decision.error.message,
          retryable: decision.retryable,
          nextAttemptAt: decision.nextAttemptAt,
        });
        processedSteps += 1;

        if (!decision.retryable) {
          break;
        }
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
