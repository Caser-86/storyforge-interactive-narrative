import { CreateProjectResponseSchema, errorResponse, json } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const repo = createAuthoringRepository();

  try {
    const { projectId } = await params;
    const project = await repo.duplicateProject(projectId);

    return json(CreateProjectResponseSchema, { project }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}
