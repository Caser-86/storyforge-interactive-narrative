import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { InteractiveTurnsResponseSchema } from "@/lib/interactive/api-contracts";

type SessionRouteContext = { params: Promise<{ projectId: string; sessionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: SessionRouteContext): Promise<Response> {
  const interactive = createInteractiveRepository();
  try {
    const { projectId, sessionId } = await params;
    return json(InteractiveTurnsResponseSchema, { turns: await interactive.listTurns(projectId, sessionId) });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
  }
}
