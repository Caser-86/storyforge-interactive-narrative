import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { AuthoringError } from "@/lib/authoring/errors";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { generateInteractiveScene } from "@/lib/interactive/generator";
import { InteractiveChoiceInputSchema, InteractiveSessionResponseSchema } from "@/lib/interactive/api-contracts";

type SessionRouteContext = { params: Promise<{ projectId: string; sessionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: SessionRouteContext): Promise<Response> {
  const interactive = createInteractiveRepository();
  try {
    const { projectId, sessionId } = await params;
    await interactive.recoverStaleGeneration(sessionId);
    return json(InteractiveSessionResponseSchema, { session: await interactive.getSession(projectId, sessionId) });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
  }
}

export async function POST(request: Request, { params }: SessionRouteContext): Promise<Response> {
  const authoring = createAuthoringRepository();
  const interactive = createInteractiveRepository();
  let claimed = false;
  try {
    const { projectId, sessionId } = await params;
    const input = await readJsonBody(request, InteractiveChoiceInputSchema);
    const project = await authoring.getProject(projectId);
    const claim = await interactive.claimChoice(projectId, sessionId, input.choiceId);
    claimed = true;
    const generated = await generateInteractiveScene({
      project,
      state: claim.session.state,
      previousScene: claim.scene,
      selectedChoice: claim.choice,
    });
    const session = await interactive.saveNextScene(sessionId, generated.scene, generated.state);
    return json(InteractiveSessionResponseSchema, { session });
  } catch (error) {
    if (!(error instanceof AuthoringError)) {
      console.error("[interactive] next scene generation failed", error instanceof Error ? error.message : String(error));
    }
    if (claimed) {
      try {
        const { sessionId } = await params;
        await interactive.releaseChoice(sessionId);
      } catch {
        // Preserve the original generation error; recovery is attempted on the next request.
      }
    }
    if (error instanceof AuthoringError) return errorResponse(error);
    return errorResponse(new AuthoringError("CONFLICT", "下一段生成失败，请重试。"));
  } finally {
    interactive.close();
    authoring.close();
  }
}
