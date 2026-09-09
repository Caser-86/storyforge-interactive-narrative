import { initializeAuthoringDatabase } from "./database";
export { ProjectGenerationMetricsSchema } from "./metrics-contracts";

type StageMetrics = { calls: number; p50: number; p95: number };

export interface InteractiveUsageMetrics {
  totalCalls: number;
  succeededCalls: number;
  unknownCalls: number;
  reservedCalls: number;
  canceledCalls: number;
  inputTokens: number;
  outputTokens: number;
  unknownOutputTokens: number;
  reservedOutputTokens: number;
  retries: number;
}

export interface ProjectGenerationMetrics {
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  failedRuns: number;
  canceledRuns: number;
  pausedRuns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRetries: number;
  totalCalls: number;
  failuresByCode: Record<string, number>;
  stageLatencyMs: Record<string, StageMetrics>;
  estimatedCost: number | null;
  interactiveUsage: InteractiveUsageMetrics;
}

export async function getProjectGenerationMetrics(projectId: string): Promise<ProjectGenerationMetrics> {
  const db = initializeAuthoringDatabase();
  try {
    const runs = db.prepare("SELECT status, input_tokens, output_tokens, retry_count, last_error_code FROM generation_runs WHERE project_id = ? ORDER BY created_at, id").all(projectId) as Array<{
      status: string;
      input_tokens: number;
      output_tokens: number;
      retry_count: number;
      last_error_code: string | null;
    }>;
    const steps = db.prepare("SELECT s.stage, s.status, s.error_code, s.created_at, s.completed_at FROM generation_steps s JOIN generation_runs r ON r.id = s.run_id WHERE r.project_id = ? ORDER BY s.created_at, s.id").all(projectId) as Array<{
      stage: string;
      status: string;
      error_code: string | null;
      created_at: string;
      completed_at: string | null;
    }>;
    const interactiveUsage = db.prepare(
      `SELECT task_id, task_attempt, status, input_tokens, output_tokens, reserved_output_tokens,
              error_code, created_at, completed_at
       FROM interactive_generation_usage
       WHERE project_id = ? ORDER BY created_at, id`,
    ).all(projectId) as Array<{
      task_id: string;
      task_attempt: number;
      status: string;
      input_tokens: number | null;
      output_tokens: number | null;
      reserved_output_tokens: number;
      error_code: string | null;
      created_at: string;
      completed_at: string | null;
    }>;
    const failuresByCode: Record<string, number> = {};
    for (const run of runs) if (run.status === "failed" && run.last_error_code) failuresByCode[run.last_error_code] = (failuresByCode[run.last_error_code] ?? 0) + 1;
    for (const step of steps) if (step.status === "failed" && step.error_code) failuresByCode[step.error_code] = (failuresByCode[step.error_code] ?? 0) + 1;
    for (const call of interactiveUsage) if (call.status === "unknown" && call.error_code) failuresByCode[call.error_code] = (failuresByCode[call.error_code] ?? 0) + 1;
    const stageLatencies = new Map<string, number[]>();
    for (const step of steps) {
      if (!step.completed_at) continue;
      const duration = new Date(step.completed_at).getTime() - new Date(step.created_at).getTime();
      if (!Number.isFinite(duration) || duration < 0) continue;
      const durations = stageLatencies.get(step.stage) ?? [];
      durations.push(duration);
      stageLatencies.set(step.stage, durations);
    }
    const percentile = (durations: number[], fraction: number): number => {
      const sorted = [...durations].sort((left, right) => left - right);
      return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
    };
    const stageLatencyMs: Record<string, StageMetrics> = {};
    for (const [stage, durations] of stageLatencies) stageLatencyMs[stage] = { calls: durations.length, p50: percentile(durations, 0.5), p95: percentile(durations, 0.95) };
    const interactiveLatencies = interactiveUsage
      .filter((call) => call.completed_at)
      .map((call) => new Date(call.completed_at!).getTime() - new Date(call.created_at).getTime())
      .filter((duration) => Number.isFinite(duration) && duration >= 0);
    if (interactiveLatencies.length > 0) {
      stageLatencyMs.interactive = {
        calls: interactiveLatencies.length,
        p50: percentile(interactiveLatencies, 0.5),
        p95: percentile(interactiveLatencies, 0.95),
      };
    }
    const interactiveMetrics: InteractiveUsageMetrics = {
      totalCalls: interactiveUsage.length,
      succeededCalls: interactiveUsage.filter((call) => call.status === "succeeded").length,
      unknownCalls: interactiveUsage.filter((call) => call.status === "unknown").length,
      reservedCalls: interactiveUsage.filter((call) => call.status === "reserved").length,
      canceledCalls: interactiveUsage.filter((call) => call.status === "canceled").length,
      inputTokens: interactiveUsage.reduce((sum, call) => sum + (call.input_tokens ?? 0), 0),
      outputTokens: interactiveUsage.reduce((sum, call) => sum + (call.output_tokens ?? 0), 0),
      unknownOutputTokens: interactiveUsage.filter((call) => call.status === "unknown").reduce((sum, call) => sum + call.reserved_output_tokens, 0),
      reservedOutputTokens: interactiveUsage.filter((call) => call.status === "reserved").reduce((sum, call) => sum + call.reserved_output_tokens, 0),
      retries: new Set(interactiveUsage.filter((call) => call.task_attempt > 1).map((call) => `${call.task_id}:${call.task_attempt}`)).size,
    };
    const totalInputTokens = runs.reduce((sum, run) => sum + run.input_tokens, 0) + interactiveMetrics.inputTokens;
    const totalOutputTokens = runs.reduce((sum, run) => sum + run.output_tokens, 0) + interactiveMetrics.outputTokens;
    const inputPrice = Number(process.env.STORYFORGE_INPUT_PRICE_PER_MILLION);
    const outputPrice = Number(process.env.STORYFORGE_OUTPUT_PRICE_PER_MILLION);
    const estimatedCost = Number.isFinite(inputPrice) && Number.isFinite(outputPrice)
      ? (totalInputTokens / 1_000_000) * inputPrice + (totalOutputTokens / 1_000_000) * outputPrice
      : null;
    return {
      totalRuns: runs.length,
      activeRuns: runs.filter((run) => ["queued", "running"].includes(run.status)).length,
      completedRuns: runs.filter((run) => run.status === "completed").length,
      failedRuns: runs.filter((run) => run.status === "failed").length,
      canceledRuns: runs.filter((run) => run.status === "canceled").length,
      pausedRuns: runs.filter((run) => run.status === "paused").length,
      totalInputTokens,
      totalOutputTokens,
      totalRetries: runs.reduce((sum, run) => sum + run.retry_count, 0),
      totalCalls: steps.length + interactiveMetrics.totalCalls,
      failuresByCode,
      stageLatencyMs,
      estimatedCost,
      interactiveUsage: interactiveMetrics,
    };
  } finally {
    db.close();
  }
}
