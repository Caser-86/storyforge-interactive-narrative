import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { cancelInteractiveGenerationForSession } from "@/lib/interactive/worker";
import { InteractiveSessionResponseSchema } from "@/lib/interactive/api-contracts";

type SessionRouteContext = { params: Promise<{ projectId: string; sessionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: SessionRouteContext): Promise<Response> {
  const interactive = createInteractiveRepository();
  try {
    const { projectId, sessionId } = await params;
    await interactive.cancelGeneration(projectId, sessionId);
    cancelInteractiveGenerationForSession(sessionId);
    return json(InteractiveSessionResponseSchema, { session: await interactive.getSession(projectId, sessionId) });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
  }
}
