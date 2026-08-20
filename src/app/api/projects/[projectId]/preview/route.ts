import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import {
  PreviewRequestSchema,
  PreviewResponseSchema,
  readPreview,
} from "@/lib/authoring/snapshots";
import type { PreviewRequest } from "@/lib/authoring/snapshots";

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: ProjectRouteContext): Promise<Response> {
  let projectId: string;
  let input: PreviewRequest;

  try {
    ({ projectId } = await params);
    input = await readJsonBody(request, PreviewRequestSchema);
  } catch (error) {
    return errorResponse(error);
  }

  try {
    const preview = await readPreview(projectId, input.snapshotId ?? input.versionId!);

    return json(PreviewResponseSchema, preview);
  } catch (error) {
    return errorResponse(error);
  }
}
