import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { InteractiveSessionListResponseSchema } from "@/lib/interactive/api-contracts";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const interactive = createInteractiveRepository();
  try {
    const { projectId } = await params;
    return json(InteractiveSessionListResponseSchema, { sessions: await interactive.listSessions(projectId) });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
  }
}
