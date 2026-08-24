import { AuthoringError } from "../errors";
import type { GenerationRepository } from "./repository";
import type { GenerationRun, GenerationStep } from "./schemas";

export function assertRunProject(run: GenerationRun, projectId: string): void {
  if (run.projectId !== projectId) {
    throw new AuthoringError("NOT_FOUND", "Generation run not found", { runId: run.id });
  }
}

export function summarizeStep(step: GenerationStep) {
  const { requestJson: _requestJson, rawResponse: _rawResponse, parsedResponseJson: _parsedResponseJson, ...summary } = step;
  return summary;
}

export async function readRunStatus(repository: GenerationRepository, projectId: string, runId: string) {
  const run = await repository.getRun(runId);
  assertRunProject(run, projectId);
  const steps = await repository.listSteps(runId);
  const completed = steps.filter((step) => step.status === "completed");

  return {
    run,
    steps: steps.map(summarizeStep),
    lastCompletedStep: completed.length === 0 ? null : summarizeStep(completed[completed.length - 1]!),
  };
}
