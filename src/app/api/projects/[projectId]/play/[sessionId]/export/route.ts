import { errorResponse } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import { InteractiveExportSchema, renderInteractiveJson, renderInteractiveMarkdown } from "@/lib/interactive/export";

type ExportRouteContext = { params: Promise<{ projectId: string; sessionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readFormat(request: Request): "json" | "markdown" {
  return new URL(request.url).searchParams.get("format") === "json" ? "json" : "markdown";
}

function filename(projectId: string, format: "json" | "markdown"): string {
  return `storyforge-${projectId}-interactive.${format === "json" ? "json" : "md"}`;
}

export async function GET(request: Request, { params }: ExportRouteContext): Promise<Response> {
  const authoring = createAuthoringRepository();
  const interactive = createInteractiveRepository();
  try {
    const { projectId, sessionId } = await params;
    const format = readFormat(request);
    const project = await authoring.getProject(projectId);
    const session = await interactive.getSession(projectId, sessionId);
    const turns = await interactive.listTurns(projectId, sessionId);
    const exportData = InteractiveExportSchema.parse({
      exportVersion: "storyforge-interactive@1",
      project: { title: project.title, premise: project.premise, genre: project.genre, tone: project.tone },
      session: { id: session.id, status: session.status, targetTurns: session.targetTurns },
      turns,
    });
    const body = format === "json" ? renderInteractiveJson(exportData) : renderInteractiveMarkdown(exportData);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename(projectId, format)}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  } finally {
    interactive.close();
    authoring.close();
  }
}
