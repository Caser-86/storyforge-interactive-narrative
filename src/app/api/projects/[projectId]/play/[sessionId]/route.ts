import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { AuthoringError } from "@/lib/authoring/errors";
import { createInteractiveRepository, type InteractiveGenerationClaim } from "@/lib/interactive/repository";
import { generateInteractiveScene } from "@/lib/interactive/generator";
import { interactiveGenerationFailureMessage } from "@/lib/interactive/failure";
import { generateWithInteractiveRetry } from "@/lib/interactive/retry";
import { InteractiveChoiceInputSchema, InteractiveSessionResponseSchema } from "@/lib/interactive/api-contracts";
import type { InteractiveChoice, InteractiveScene, InteractiveState } from "@/lib/interactive/schemas";

type SessionRouteContext = { params: Promise<{ projectId: string; sessionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function generateNextSceneInBackground(
  projectId: string,
  sessionId: string,
  claim: InteractiveGenerationClaim & { session: { state: InteractiveState }; scene: InteractiveScene; choice: InteractiveChoice },
): Promise<void> {
  const authoring = createAuthoringRepository();
  const interactive = createInteractiveRepository();

  try {
    const project = await authoring.getProject(projectId);
    const generated = await generateWithInteractiveRetry(() => generateInteractiveScene({ project, state: claim.session.state, previousScene: claim.scene, selectedChoice: claim.choice }));
    await interactive.saveNextScene(sessionId, claim, generated.scene, generated.state);
  } catch (error) {
    if (!(error instanceof AuthoringError)) {
      console.error("[interactive] next scene generation failed", error instanceof Error ? error.message : String(error));
    }
    try {
      await interactive.releaseChoice(claim, interactiveGenerationFailureMessage(error, "next"));
    } catch (releaseError) {
      console.error("[interactive] next scene recovery failed", releaseError instanceof Error ? releaseError.message : String(releaseError));
    }
  } finally {
    interactive.close();
    authoring.close();
  }
}

export async function GET(_request: Request, { params }: SessionRouteContext): Promise<Response> {
  const interactive = createInteractiveRepository();
  try {
    const { projectId, sessionId } = await params;
    await interactive.getSession(projectId, sessionId);
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
  try {
    const { projectId, sessionId } = await params;
    const input = await readJsonBody(request, InteractiveChoiceInputSchema);
    await authoring.getProject(projectId);
    const claim = await interactive.claimChoice(projectId, sessionId, input.choiceId);
    const generating = await interactive.getSession(projectId, sessionId);
    void generateNextSceneInBackground(projectId, sessionId, claim);
    return json(InteractiveSessionResponseSchema, { session: generating }, { status: 202 });
  } catch (error) {
    if (error instanceof AuthoringError) return errorResponse(error);
    return errorResponse(new AuthoringError("CONFLICT", "下一段生成失败，请重试。"));
  } finally {
    interactive.close();
    authoring.close();
  }
}
