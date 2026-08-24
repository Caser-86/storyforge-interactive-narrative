import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createGenerationRepository } from "@/lib/authoring/generation/repository";
import { createValidationRepository } from "@/lib/authoring/validation/repository";
import {
  DEFAULT_VALIDATION_SOURCES,
  ValidateDraftRequestSchema,
  ValidationDecisionSchema,
  ValidationRunResultSchema,
  createValidationService,
} from "@/lib/authoring/validation/service";
import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  let projectId: string;
  let input: { sources?: Array<"structural" | "rule" | "ai_review"> };
  try {
    ({ projectId } = await params);
    input = await readJsonBody(request, ValidateDraftRequestSchema);
  } catch (error) {
    return errorResponse(error);
  }

  const authoringRepository = createAuthoringRepository();
  const validationRepository = createValidationRepository();
  const generationRepository = createGenerationRepository();
  try {
    const service = createValidationService({ authoringRepository, validationRepository, generationRepository });
    const result = await service.validateDraft(projectId, input.sources ?? DEFAULT_VALIDATION_SOURCES);
    return json(ValidationRunResultSchema, result);
  } catch (error) {
    return errorResponse(error);
  } finally {
    authoringRepository.close();
    validationRepository.close();
    generationRepository.close();
  }
}

export async function GET(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const authoringRepository = createAuthoringRepository();
  const validationRepository = createValidationRepository();
  const generationRepository = createGenerationRepository();
  try {
    const { projectId } = await params;
    const service = createValidationService({ authoringRepository, validationRepository, generationRepository });
    return json(ValidationDecisionSchema, await service.getReleaseDecision(projectId));
  } catch (error) {
    return errorResponse(error);
  } finally {
    authoringRepository.close();
    validationRepository.close();
    generationRepository.close();
  }
}
