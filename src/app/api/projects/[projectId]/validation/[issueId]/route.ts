import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createValidationRepository } from "@/lib/authoring/validation/repository";
import { ValidationIssueActionSchema } from "@/lib/authoring/validation/service";
import { ValidationIssueRecordSchema } from "@/lib/authoring/validation/schemas";
import { AuthoringError } from "@/lib/authoring/errors";
import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { z } from "zod";

type IssueRouteContext = { params: Promise<{ projectId: string; issueId: string }> };
const ValidationIssueResponseSchema = z.object({ issue: ValidationIssueRecordSchema }).strict();

export async function PATCH(request: Request, { params }: IssueRouteContext): Promise<Response> {
  let projectId: string;
  let issueId: string;
  let input: { action: "resolve" | "dismiss" };
  try {
    ({ projectId, issueId } = await params);
    input = await readJsonBody(request, ValidationIssueActionSchema);
  } catch (error) {
    return errorResponse(error);
  }

  const authoringRepository = createAuthoringRepository();
  const validationRepository = createValidationRepository();
  try {
    const issue = (await validationRepository.listIssues(projectId)).find((candidate) => candidate.id === issueId);
    if (!issue) {
      throw new AuthoringError("NOT_FOUND", "Validation issue not found", { projectId, issueId });
    }
    const updated = input.action === "dismiss"
      ? await validationRepository.dismissWarning(issueId)
      : await validationRepository.resolveIssue(issueId);
    return json(ValidationIssueResponseSchema, { issue: updated });
  } catch (error) {
    return errorResponse(error);
  } finally {
    authoringRepository.close();
    validationRepository.close();
  }
}
