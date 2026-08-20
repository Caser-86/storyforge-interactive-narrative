import { CreateProjectResponseSchema } from "@/lib/authoring/api-contracts";
import type { CreateProjectInputPayload } from "@/lib/authoring/api-contracts";
import type { Project } from "@/lib/authoring/schemas";

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return new Error(body.error?.message ?? `请求失败（${response.status}）`);
  } catch {
    return new Error(`请求失败（${response.status}）`);
  }
}

export async function createProject(input: CreateProjectInputPayload): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw await responseError(response);

  return CreateProjectResponseSchema.parse(await response.json()).project;
}
