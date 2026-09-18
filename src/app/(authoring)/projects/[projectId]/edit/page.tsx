import { EditorShell } from "@/features/authoring/editor/editor-shell";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type EditPageProps = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: EditPageProps) {
  const { projectId } = await params;
  const repository = createAuthoringRepository();
  try {
    const project = await repository.getProject(projectId);
    const graph = await repository.getProjectGraph(projectId);
    const draftRevision = await repository.getDraftRevision(projectId);
    const releaseProfile = await repository.getReleaseProfile(projectId, graph.versionId);
    return <EditorShell project={project} graph={graph} draftRevision={draftRevision} releaseProfile={releaseProfile} />;
  } finally {
    repository.close();
  }
}
