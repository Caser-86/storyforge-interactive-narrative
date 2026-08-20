import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { AuthoringError } from "@/lib/authoring/errors";
import {
  CandidateApplyInputSchema,
  CandidateApplyResponseSchema,
  CandidateResponseSchema,
} from "@/lib/authoring/generation/api-contracts";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";

type RouteContext = { params: Promise<{ projectId: string; candidateId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const repository = createGenerationRepository();
  try {
    const { projectId, candidateId } = await params;
    const candidate = (await repository.listCandidates(projectId)).find((item) => item.id === candidateId);
    if (!candidate) throw new AuthoringError("NOT_FOUND", "Generation candidate not found", { projectId, candidateId });
    return json(CandidateResponseSchema, { candidate });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repository.close();
  }
}

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const repository = createGenerationRepository();
  try {
    const { projectId, candidateId } = await params;
    const input = await readJsonBody(request, CandidateApplyInputSchema);
    const result = await repository.applyCandidate(projectId, candidateId, input.expectedRevision);
    return json(CandidateApplyResponseSchema, result);
  } catch (error) {
    return errorResponse(error);
  } finally {
    repository.close();
  }
}

export async function DELETE(_request: Request, { params }: RouteContext): Promise<Response> {
  const repository = createGenerationRepository();
  try {
    const { projectId, candidateId } = await params;
    const candidate = await repository.rejectCandidate(projectId, candidateId);
    return json(CandidateResponseSchema, { candidate });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repository.close();
  }
}
