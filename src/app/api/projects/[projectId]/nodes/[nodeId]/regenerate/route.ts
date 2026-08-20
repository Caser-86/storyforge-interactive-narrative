import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { AuthoringError } from "@/lib/authoring/errors";
import { NodeRegenerateInputSchema, CandidateResponseSchema } from "@/lib/authoring/generation/api-contracts";
import type { NodeRegenerateInput } from "@/lib/authoring/generation/api-contracts";
import { OpenAICompatibleGenerationProvider } from "@/lib/authoring/generation/openai-provider";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";
import { executeNodeBatch } from "@/lib/authoring/generation/stages/nodes";
import type { GenerationProjectContext } from "@/lib/authoring/generation/prompts";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type RouteContext = { params: Promise<{ projectId: string; nodeId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  let input: NodeRegenerateInput;
  try {
    input = await readJsonBody(request, NodeRegenerateInputSchema);
  } catch (error) {
    return errorResponse(error);
  }

  const authoring = createAuthoringRepository();
  const generation = createGenerationRepository();
  try {
    const { projectId, nodeId } = await params;
    const project = await authoring.getProject(projectId);
    const graph = await authoring.getProjectGraph(projectId);
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new AuthoringError("NOT_FOUND", "Node not found", { nodeId });
    if (input.expectedRevision !== undefined && input.expectedRevision !== node.contentRevision) {
      throw new AuthoringError("CONFLICT", "Node revision is stale", { expectedRevision: input.expectedRevision, actualRevision: node.contentRevision });
    }

    const context: GenerationProjectContext = {
      projectId: project.id,
      versionId: graph.versionId,
      title: project.title,
      premise: project.premise,
      genre: project.genre,
      tone: project.tone,
      pointOfView: project.pointOfView,
      rating: project.rating,
      language: "Chinese",
      size: { preset: project.sizePreset, targetNodes: project.targetNodeCount, targetEndings: project.targetEndingCount },
      model: process.env.OPENAI_MODEL,
    };
    const generationGraph = {
      chapters: graph.chapters.map(({ id, title, goal, summary }) => ({ id, title, goal, summary })),
      nodes: graph.nodes.map(({ id, chapterId, kind, title, summary, objective, topologicalRank }) => ({ id, chapterId, kind, title, summary, objective, topologicalRank })),
      edges: graph.edges.map(({ id, sourceNodeId, targetNodeId, label, intent, consequenceSummary, sortOrder }) => ({ id, sourceNodeId, targetNodeId, label, intent, consequenceSummary, sortOrder })),
    };
    const result = await executeNodeBatch({ provider: new OpenAICompatibleGenerationProvider(), graph: generationGraph, context, nodeIds: [nodeId] }, 1);
    const output = result.outputs[0]!;
    const providerResult = result.providerResults[0]!;
    const candidate = await generation.createCandidate({
      projectId,
      versionId: graph.versionId,
      nodeId,
      baseContentRevision: node.contentRevision,
      candidateBody: output.body,
      model: providerResult.model,
      rawResponse: providerResult.rawResponse,
    });
    return json(CandidateResponseSchema, { candidate }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    generation.close();
    authoring.close();
  }
}
