import { z } from "zod";
import { AuthoringError } from "@/lib/authoring/errors";
import { ProjectBackupSchema, createProjectBackupCheckpoint, importProjectBackup } from "@/lib/authoring/backup";
import { ProjectImportResponseSchema, errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";

const NewProjectImportSchema = z.object({ backup: ProjectBackupSchema, mode: z.literal("new-id") }).strict();
const ReplaceProjectImportSchema = z
  .object({
    backup: ProjectBackupSchema,
    mode: z.literal("replace"),
    targetProjectId: z.string().trim().min(1).max(100),
    confirmation: z.string().trim().min(1).max(160),
  })
  .strict();
const ImportProjectBackupRequestSchema = z.discriminatedUnion("mode", [NewProjectImportSchema, ReplaceProjectImportSchema]);

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readJsonBody(request, ImportProjectBackupRequestSchema, 8_000_000);
    if (input.mode === "new-id") {
      const project = await importProjectBackup(input.backup, "new-id");
      return json(ProjectImportResponseSchema, { project, recovery: null }, { status: 201 });
    }

    const authoring = createAuthoringRepository();
    let target;
    try {
      target = await authoring.getProject(input.targetProjectId);
    } finally {
      authoring.close();
    }
    if (input.backup.project.id !== target.id) {
      throw new AuthoringError("VALIDATION", "Replacement backup does not match the target project.", { targetProjectId: target.id });
    }
    const expectedConfirmation = `替换项目：${target.title}`;
    if (input.confirmation !== expectedConfirmation) {
      throw new AuthoringError("VALIDATION", `请输入“${expectedConfirmation}”以确认替换。`);
    }

    const recovery = await createProjectBackupCheckpoint(target.id);
    const project = await importProjectBackup(input.backup, "replace");
    return json(ProjectImportResponseSchema, { project, recovery }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
