import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { createInteractiveState, generateInteractiveScene } from "@/lib/interactive/generator";
import { InteractiveSessionResponseSchema } from "@/lib/interactive/api-contracts";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function generateOpeningInBackground(projectId: string, sessionId: string): Promise<void> {
  const authoring = createAuthoringRepository();
  const interactive = createInteractiveRepository();

  try {
    const project = await authoring.getProject(projectId);
    const session = await interactive.getSession(projectId, sessionId);
    if (session.status !== "generating" || session.turn !== 0) return;

    const generated = await generateInteractiveScene({ project, state: session.state });
    await interactive.saveInitialScene(sessionId, generated.scene, generated.state);
  } catch (error) {
    try {
      await interactive.failInitialGeneration(sessionId, error instanceof Error ? error.message : "generation failed");
    } catch (failureError) {
      console.error("[interactive] opening generation state update failed", failureError instanceof Error ? failureError.message : String(failureError));
    }
  } finally {
    interactive.close();
    authoring.close();
  }
}

export async function POST(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const authoring = createAuthoringRepository();
  const interactive = createInteractiveRepository();
  try {
    const { projectId } = await params;
    const project = await authoring.getProject(projectId);
    const state = createInteractiveState(project, "");
    const created = await interactive.createSession(projectId, state);
    void generateOpeningInBackground(projectId, created.id);
    return json(InteractiveSessionResponseSchema, { session: created }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
    authoring.close();
  }
}
