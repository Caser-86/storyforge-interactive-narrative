import { z } from "zod";
import { ProjectBackupSchema, importProjectBackup } from "@/lib/authoring/backup";
import { ProjectResponseSchema, errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";

const ImportProjectBackupRequestSchema = z
  .object({
    backup: ProjectBackupSchema,
    mode: z.enum(["new-id", "replace"]),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const { backup, mode } = await readJsonBody(request, ImportProjectBackupRequestSchema);
    const project = await importProjectBackup(backup, mode);
    return json(ProjectResponseSchema, { project }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
