import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";
import { GenerationActionInputSchema, GenerationResponseSchema, GenerationStatusResponseSchema } from "@/lib/authoring/generation/api-contracts";
import { assertRunProject, readRunStatus } from "@/lib/authoring/generation/api-helpers";

type RunRouteContext = { params: Promise<{ projectId: string; runId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: RunRouteContext): Promise<Response> {
  const repository = createGenerationRepository();
  try {
    const { projectId, runId } = await params;
    return json(GenerationStatusResponseSchema, await readRunStatus(repository, projectId, runId));
  } catch (error) {
    return errorResponse(error);
  } finally {
    repository.close();
  }
}

export async function PATCH(request: Request, { params }: RunRouteContext): Promise<Response> {
  const repository = createGenerationRepository();
  try {
    const { projectId, runId } = await params;
    const run = await repository.getRun(runId);
    assertRunProject(run, projectId);
    const input = await readJsonBody(request, GenerationActionInputSchema);
    const now = new Date();
    const updated = input.action === "pause"
      ? await repository.pauseRun(runId, now)
      : input.action === "resume"
        ? await repository.resumeRun(runId, now)
        : await repository.cancelRun(runId, now);
    return json(GenerationResponseSchema, { run: updated });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repository.close();
  }
}
