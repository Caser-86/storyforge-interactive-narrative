import {
  CreateProjectInputSchema,
  CreateProjectResponseSchema,
  ListProjectsResponseSchema,
  errorResponse,
  json,
  readJsonBody,
} from "@/lib/authoring/api-contracts";
import type { CreateProjectInputPayload } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";

export async function GET(): Promise<Response> {
  const repo = createAuthoringRepository();

  try {
    const projects = await repo.listProjects();

    return json(ListProjectsResponseSchema, { projects });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}

export async function POST(request: Request): Promise<Response> {
  let input: CreateProjectInputPayload;

  try {
    input = await readJsonBody(request, CreateProjectInputSchema);
  } catch (error) {
    return errorResponse(error);
  }

  const repo = createAuthoringRepository();

  try {
    const project = await repo.createProject(input);

    return json(CreateProjectResponseSchema, { project }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  } finally {
    repo.close();
  }
}
