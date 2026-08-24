import { ProjectBackupV2Schema, exportProjectBackup } from "@/lib/authoring/backup";
import { errorResponse } from "@/lib/authoring/api-contracts";

type BackupRouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, { params }: BackupRouteContext): Promise<Response> {
  try {
    const { projectId } = await params;
    const backup = await exportProjectBackup(projectId);
    return new Response(JSON.stringify(ProjectBackupV2Schema.parse(backup), null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="storyforge-project-${projectId}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
