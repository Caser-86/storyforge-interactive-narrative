import { initializeAuthoringDatabase } from "./database";
export { ProjectGenerationMetricsSchema } from "./metrics-contracts";
import { ProjectGenerationMetricsSchema } from "./metrics-contracts";

type StageMetrics = { calls: number; p50: number; p95: number };

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
    const failuresByCode: Record<string, number> = {};
    for (const run of runs) if (run.status === "failed" && run.last_error_code) failuresByCode[run.last_error_code] = (failuresByCode[run.last_error_code] ?? 0) + 1;
    for (const step of steps) if (step.status === "failed" && step.error_code) failuresByCode[step.error_code] = (failuresByCode[step.error_code] ?? 0) + 1;
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
    const totalInputTokens = runs.reduce((sum, run) => sum + run.input_tokens, 0);
    const totalOutputTokens = runs.reduce((sum, run) => sum + run.output_tokens, 0);
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
      totalCalls: steps.length,
      failuresByCode,
      stageLatencyMs,
      estimatedCost,
    };
  } finally {
    db.close();
  }
}
