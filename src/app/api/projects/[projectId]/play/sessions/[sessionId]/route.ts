import { errorResponse } from "@/lib/authoring/api-contracts";
import { createInteractiveRepository } from "@/lib/interactive/repository";

type SessionRouteContext = { params: Promise<{ projectId: string; sessionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: SessionRouteContext): Promise<Response> {
  const interactive = createInteractiveRepository();
  try {
    const { projectId, sessionId } = await params;
    await interactive.deleteSession(projectId, sessionId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
  }
}
