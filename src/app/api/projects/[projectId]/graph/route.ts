import {
  GraphWriteInputSchema,
  GraphWriteResponseSchema,
  EdgePatchInputSchema,
  EdgePatchResponseSchema,
  NodePatchInputSchema,
  NodePatchResponseSchema,
  StoryGraphResponseSchema,
  MAX_GRAPH_WRITE_BYTES,
  errorResponse,
  json,
  parseVersionIdFromRequest,
  readJsonBody,
} from "@/lib/authoring/api-contracts";
import { z } from "zod";
import type { GraphWriteInputPayload } from "@/lib/authoring/api-contracts";
import type { NodePatchInputPayload } from "@/lib/authoring/api-contracts";
import { RELEASE_GRAPH_LIMITS, validateStoryGraph } from "@/lib/authoring/graph";
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
    input = await readJsonBody(request, GraphWriteInputSchema, MAX_GRAPH_WRITE_BYTES);
  } catch (error) {
    return errorResponse(error);
  }

  const repo = createAuthoringRepository();

  try {
    const project = await repo.getProject(projectId);
    const issues = validateStoryGraph(input.graph, {
      ...RELEASE_GRAPH_LIMITS,
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

export async function PATCH(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  let projectId: string;
  let input: NodePatchInputPayload | z.infer<typeof EdgePatchInputSchema>;

  try {
    ({ projectId } = await params);
    input = await readJsonBody(request, NodePatchInputSchema.or(EdgePatchInputSchema));
  } catch (error) {
    return errorResponse(error);
  }

  const repo = createAuthoringRepository();
  try {
    if ("nodeId" in input) {
      const result = await repo.patchDraftNode(projectId, input.nodeId, input.patch, input.expectedRevision);
      return json(NodePatchResponseSchema, result);
    }
    const result = await repo.patchDraftEdge(projectId, input.edgeId, input.patch, input.expectedRevision);
    return json(EdgePatchResponseSchema, result);
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}
