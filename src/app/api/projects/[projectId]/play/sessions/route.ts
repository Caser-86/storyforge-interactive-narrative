import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { InteractiveSessionListResponseSchema } from "@/lib/interactive/api-contracts";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const interactive = createInteractiveRepository();
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");
    const page = await interactive.listSessionSummaries(projectId, {
      limit: limit === null ? undefined : Number(limit),
      cursor,
    });
    return json(InteractiveSessionListResponseSchema, page);
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
  }
}
