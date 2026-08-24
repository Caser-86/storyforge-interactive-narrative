import { errorResponse } from "@/lib/authoring/api-contracts";
import { AuthoringError } from "@/lib/authoring/errors";
import { renderStandaloneHtml } from "@/lib/authoring/export-html";
import { readPreview } from "@/lib/authoring/snapshots";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { assertReleaseReady } from "@/lib/authoring/release-gate";

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseSnapshotId(request: Request): string {
  const snapshotId = new URL(request.url).searchParams.get("snapshotId")?.trim();
  if (!snapshotId) {
    throw new AuthoringError("VALIDATION", "snapshotId query parameter is required");
  }

  return snapshotId;
}

function attachmentFilename(projectId: string, versionNumber: number): string {
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, "-");

  return `storyforge-${safeProjectId}-v${versionNumber}.html`;
}

export async function GET(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  try {
    const { projectId } = await params;
    const snapshotId = parseSnapshotId(request);
    const authoringRepository = createAuthoringRepository();
    let expectedRevision: number;
    try {
      expectedRevision = await authoringRepository.getDraftRevision(projectId);
    } finally {
      authoringRepository.close();
    }
    await assertReleaseReady(projectId, expectedRevision);
    const preview = await readPreview(projectId, snapshotId);
    const html = renderStandaloneHtml({
      snapshot: preview.snapshot,
      graph: preview.graph,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${attachmentFilename(projectId, preview.snapshot.versionNumber)}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
