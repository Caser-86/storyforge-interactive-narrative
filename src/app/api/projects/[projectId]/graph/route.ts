import {
  GraphWriteInputSchema,
  GraphWriteResponseSchema,
  StoryGraphResponseSchema,
  errorResponse,
  json,
  parseVersionIdFromRequest,
  readJsonBody,
} from "@/lib/authoring/api-contracts";
import type { GraphWriteInputPayload } from "@/lib/authoring/api-contracts";
import { validateStoryGraph } from "@/lib/authoring/graph";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const repo = createAuthoringRepository();

  try {
    const { projectId } = await params;
    const versionId = parseVersionIdFromRequest(request);
    const graph = await repo.getProjectGraph(projectId, versionId);

    return json(StoryGraphResponseSchema, { graph });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}

export async function PUT(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  let projectId: string;
  let input: GraphWriteInputPayload;

  try {
    ({ projectId } = await params);
    input = await readJsonBody(request, GraphWriteInputSchema);
  } catch (error) {
    return errorResponse(error);
  }

  const repo = createAuthoringRepository();

  try {
    const project = await repo.getProject(projectId);
    const issues = validateStoryGraph(input.graph, {
      maxNodes: project.targetNodeCount,
      maxEndings: project.targetEndingCount,
    });
    const graph = await repo.replaceDraftGraph(projectId, input.graph, input.expectedRevision);

    return json(GraphWriteResponseSchema, { graph, issues });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}
