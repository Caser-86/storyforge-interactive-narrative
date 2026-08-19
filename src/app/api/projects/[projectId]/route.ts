import {
  PatchProjectInputSchema,
  ProjectResponseSchema,
  empty,
  errorResponse,
  json,
  readJsonBody,
} from "@/lib/authoring/api-contracts";
import type { PatchProjectInputPayload } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const repo = createAuthoringRepository();

  try {
    const { projectId } = await params;
    const project = await repo.getProject(projectId);

    return json(ProjectResponseSchema, { project });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}

export async function PATCH(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  let projectId: string;
  let input: PatchProjectInputPayload;

  try {
    ({ projectId } = await params);
    input = await readJsonBody(request, PatchProjectInputSchema);
  } catch (error) {
    return errorResponse(error);
  }

  const repo = createAuthoringRepository();

  try {
    const project = await repo.updateProject(projectId, input);

    return json(ProjectResponseSchema, { project });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}

export async function DELETE(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const repo = createAuthoringRepository();

  try {
    const { projectId } = await params;
    await repo.deleteProject(projectId);

    return empty(204);
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}
