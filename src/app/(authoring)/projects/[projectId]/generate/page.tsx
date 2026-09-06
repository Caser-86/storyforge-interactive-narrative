import { InteractivePlayer } from "@/features/authoring/interactive-player";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type GeneratePageProps = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";

export default async function GeneratePage({ params }: GeneratePageProps) {
  const { projectId } = await params;
  const repository = createAuthoringRepository();
  try {
    const project = await repository.getProject(projectId);
    return <InteractivePlayer projectId={project.id} projectTitle={project.title} />;
  } finally {
    repository.close();
  }
}
