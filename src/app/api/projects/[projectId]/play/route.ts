import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createAuthoringDatabaseScope } from "@/lib/authoring/database";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { createInteractiveState } from "@/lib/interactive/generator";
import { runInteractiveGenerationForSession } from "@/lib/interactive/worker";
import { InteractiveSessionResponseSchema } from "@/lib/interactive/api-contracts";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const databaseScope = createAuthoringDatabaseScope();
  const authoring = createAuthoringRepository(databaseScope.options);
  const interactive = createInteractiveRepository(databaseScope.options);
  try {
    const { projectId } = await params;
    const project = await authoring.getProject(projectId);
    const state = createInteractiveState(project, "");
    const created = await interactive.createSession(projectId, state);
    void runInteractiveGenerationForSession(projectId, created.id);
    return json(InteractiveSessionResponseSchema, { session: created }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
    authoring.close();
    databaseScope.close();
  }
}
