import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { createInteractiveState, generateInteractiveScene } from "@/lib/interactive/generator";
import { InteractiveSessionResponseSchema } from "@/lib/interactive/api-contracts";
import { AuthoringError } from "@/lib/authoring/errors";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  const authoring = createAuthoringRepository();
  const interactive = createInteractiveRepository();
  try {
    const { projectId } = await params;
    const project = await authoring.getProject(projectId);
    const state = createInteractiveState(project, "");
    const created = await interactive.createSession(projectId, state);

    try {
      const generated = await generateInteractiveScene({ project, state });
      const session = await interactive.saveInitialScene(created.id, generated.scene, generated.state);
      return json(InteractiveSessionResponseSchema, { session }, { status: 201 });
    } catch (error) {
      await interactive.failInitialGeneration(created.id, error instanceof Error ? error.message : "generation failed");
      throw new AuthoringError("CONFLICT", "开场生成失败，请重试。", { sessionId: created.id });
    }
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
    authoring.close();
  }
}
