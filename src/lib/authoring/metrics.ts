import { createGenerationRepository } from "./generation/repository";
import type { GenerationRepository } from "./generation/repository";

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
}

export async function getProjectGenerationMetrics(
  projectId: string,
  repository?: GenerationRepository,
): Promise<ProjectGenerationMetrics> {
  const ownedRepository = repository === undefined;
  const generation = repository ?? createGenerationRepository();

  try {
    const runs = await generation.listRuns(projectId);
    return {
      totalRuns: runs.length,
      activeRuns: runs.filter((run) => ["queued", "running"].includes(run.status)).length,
      completedRuns: runs.filter((run) => run.status === "completed").length,
      failedRuns: runs.filter((run) => run.status === "failed").length,
      canceledRuns: runs.filter((run) => run.status === "canceled").length,
      pausedRuns: runs.filter((run) => run.status === "paused").length,
      totalInputTokens: runs.reduce((sum, run) => sum + run.inputTokens, 0),
      totalOutputTokens: runs.reduce((sum, run) => sum + run.outputTokens, 0),
      totalRetries: runs.reduce((sum, run) => sum + run.retryCount, 0),
    };
  } finally {
    if (ownedRepository) {
      generation.close();
    }
  }
}
