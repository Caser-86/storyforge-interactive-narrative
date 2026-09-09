import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { createAuthoringDatabaseScope } from "@/lib/authoring/database";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { AuthoringError } from "@/lib/authoring/errors";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { runInteractiveGenerationForSession } from "@/lib/interactive/worker";
import { InteractiveChoiceInputSchema, InteractiveSessionResponseSchema } from "@/lib/interactive/api-contracts";

type SessionRouteContext = { params: Promise<{ projectId: string; sessionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: SessionRouteContext): Promise<Response> {
  const interactive = createInteractiveRepository();
  try {
    const { projectId, sessionId } = await params;
    const current = await interactive.getSession(projectId, sessionId);
    if (current.status === "generating") void runInteractiveGenerationForSession(projectId, sessionId);
    return json(InteractiveSessionResponseSchema, { session: current });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
  }
}

export async function POST(request: Request, { params }: SessionRouteContext): Promise<Response> {
  const databaseScope = createAuthoringDatabaseScope();
  const authoring = createAuthoringRepository(databaseScope.options);
  const interactive = createInteractiveRepository(databaseScope.options);
  try {
    const { projectId, sessionId } = await params;
    const input = await readJsonBody(request, InteractiveChoiceInputSchema);
    await authoring.getProject(projectId);
    await interactive.claimChoice(projectId, sessionId, input.choiceId, input.expectedTurn);
    const generating = await interactive.getSession(projectId, sessionId);
    void runInteractiveGenerationForSession(projectId, sessionId);
    return json(InteractiveSessionResponseSchema, { session: generating }, { status: 202 });
  } catch (error) {
    if (error instanceof AuthoringError) return errorResponse(error);
    return errorResponse(new AuthoringError("CONFLICT", "下一段生成失败，请重试。"));
  } finally {
    interactive.close();
    authoring.close();
    databaseScope.close();
  }
}
