import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createAuthoringDatabaseScope } from "@/lib/authoring/database";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { AuthoringError } from "@/lib/authoring/errors";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { materializeInteractivePath } from "@/lib/interactive/materialize";
import { InteractiveMaterializeResponseSchema } from "@/lib/interactive/api-contracts";

type MaterializeRouteContext = { params: Promise<{ projectId: string; sessionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: MaterializeRouteContext): Promise<Response> {
  const databaseScope = createAuthoringDatabaseScope();
  const authoring = createAuthoringRepository(databaseScope.options);
  const interactive = createInteractiveRepository(databaseScope.options);
  try {
    const { projectId, sessionId } = await params;
    const project = await authoring.getProject(projectId);
    const session = await interactive.getSession(projectId, sessionId);
    if (session.status !== "ended") {
      throw new AuthoringError("CONFLICT", "故事尚未收束，完成结局后才能保存正式草稿。", { sessionId, status: session.status });
    }

    const turns = await interactive.listTurns(projectId, sessionId);
    const graph = materializeInteractivePath({ versionId: "pending", projectTitle: project.title, turns });
    const materialized = await authoring.materializeInteractiveDraft(projectId, sessionId, graph);
    return json(InteractiveMaterializeResponseSchema, materialized, { status: materialized.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
    authoring.close();
    databaseScope.close();
  }
}
