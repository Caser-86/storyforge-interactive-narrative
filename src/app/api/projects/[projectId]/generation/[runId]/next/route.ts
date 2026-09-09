import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createAuthoringDatabaseScope } from "@/lib/authoring/database";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";
import { GenerationNextResponseSchema } from "@/lib/authoring/generation/api-contracts";
import { assertRunProject, summarizeStep } from "@/lib/authoring/generation/api-helpers";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createProjectGenerationExecutor } from "@/lib/authoring/generation/runtime";

type NextRouteContext = { params: Promise<{ projectId: string; runId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: NextRouteContext): Promise<Response> {
  const databaseScope = createAuthoringDatabaseScope();
  const authoring = createAuthoringRepository(databaseScope.options);
  const repository = createGenerationRepository(databaseScope.options);
  try {
    const { projectId, runId } = await params;
    const run = await repository.getRun(runId);
    assertRunProject(run, projectId);
    const before = await repository.listSteps(runId);
    const beforeAttempts = new Map(before.map((step) => [step.id, step.attempt]));
    if (run.status === "queued" || run.status === "running") {
      const executor = await createProjectGenerationExecutor(projectId, repository, authoring);
      await executor.executeNext(runId, new Date());
    }
    const steps = await repository.listSteps(runId);
    const completed = steps.filter((step) => step.status === "completed");
    const leasedSteps = steps.filter((step) => step.attempt > (beforeAttempts.get(step.id) ?? 0)).slice(0, 2);

    return json(GenerationNextResponseSchema, {
      run: await repository.getRun(runId),
      leasedSteps: leasedSteps.map(summarizeStep),
      lastCompletedStep: completed.length === 0 ? null : summarizeStep(completed[completed.length - 1]!),
    });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repository.close();
    authoring.close();
    databaseScope.close();
  }
}
