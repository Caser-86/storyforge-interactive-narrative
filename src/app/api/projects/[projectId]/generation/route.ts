import { AuthoringError } from "@/lib/authoring/errors";
import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { GenerationCreateInputSchema, GenerationListResponseSchema, GenerationResponseSchema } from "@/lib/authoring/generation/api-contracts";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const authoring = createAuthoringRepository();
  const generation = createGenerationRepository();
  try {
    const { projectId } = await params;
    await authoring.getProject(projectId);
    const runs = await generation.listRuns(projectId);
    return json(GenerationListResponseSchema, { runs });
  } catch (error) {
    return errorResponse(error);
  } finally {
    generation.close();
    authoring.close();
  }
}

export async function POST(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  let projectId: string;
  try {
    ({ projectId } = await params);
    const input = await readJsonBody(request, GenerationCreateInputSchema);
    const authoring = createAuthoringRepository();
    const generation = createGenerationRepository();
    try {
      const project = await authoring.getProject(projectId);
      const versionId = input.versionId ?? project.activeDraftVersionId;
      if (!versionId) {
        throw new AuthoringError("NOT_FOUND", "Project has no active draft version", { projectId });
      }
      const run = await generation.createRun(projectId, versionId, { model: input.model });
      return json(GenerationResponseSchema, { run }, { status: 201 });
    } finally {
      generation.close();
      authoring.close();
    }
  } catch (error) {
    return errorResponse(error);
  }
}
