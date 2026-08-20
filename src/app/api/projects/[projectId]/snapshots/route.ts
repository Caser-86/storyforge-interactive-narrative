import {
  ListSnapshotsResponseSchema,
  SnapshotResponseSchema,
  listSnapshots,
  sealSnapshot,
} from "@/lib/authoring/snapshots";
import { errorResponse, json } from "@/lib/authoring/api-contracts";

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  try {
    const { projectId } = await params;
    const snapshots = await listSnapshots(projectId);

    return json(ListSnapshotsResponseSchema, { snapshots });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: Request, { params }: ProjectRouteContext): Promise<Response> {
  try {
    const { projectId } = await params;
    const snapshot = await sealSnapshot(projectId);

    return json(SnapshotResponseSchema, { snapshot }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
