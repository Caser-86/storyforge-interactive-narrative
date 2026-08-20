import { ProjectLibrary } from "@/features/authoring/project-library";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { ProjectSummary } from "@/lib/authoring/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const repository = createAuthoringRepository();
  let projects: ProjectSummary[] = [];
  let initialError: string | undefined;

  try {
    projects = await repository.listProjects();
  } catch (error) {
    initialError = error instanceof Error ? error.message : "请检查本地数据库状态。";
  } finally {
    repository.close();
  }

  return <ProjectLibrary projects={projects} initialError={initialError} />;
}
