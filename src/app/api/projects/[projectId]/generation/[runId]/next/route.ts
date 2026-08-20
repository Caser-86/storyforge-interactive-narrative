import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";
import { GenerationNextResponseSchema } from "@/lib/authoring/generation/api-contracts";
import { assertRunProject, summarizeStep } from "@/lib/authoring/generation/api-helpers";

type NextRouteContext = { params: Promise<{ projectId: string; runId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: NextRouteContext): Promise<Response> {
  const repository = createGenerationRepository();
  try {
    const { projectId, runId } = await params;
    const run = await repository.getRun(runId);
    assertRunProject(run, projectId);
    const leasedSteps = run.status === "queued" || run.status === "running"
      ? await repository.leaseNextSteps(runId, new Date(), 2)
      : [];
    const steps = await repository.listSteps(runId);
    const completed = steps.filter((step) => step.status === "completed");

    return json(GenerationNextResponseSchema, {
      run: await repository.getRun(runId),
      leasedSteps: leasedSteps.map(summarizeStep),
      lastCompletedStep: completed.length === 0 ? null : summarizeStep(completed[completed.length - 1]!),
    });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repository.close();
  }
}
