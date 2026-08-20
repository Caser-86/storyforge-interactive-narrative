import { EditorShell } from "@/features/authoring/editor/editor-shell";
import { RELEASE_GRAPH_LIMITS, validateStoryGraph } from "@/lib/authoring/graph";
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
    const issues = validateStoryGraph(graph, { ...RELEASE_GRAPH_LIMITS, maxNodes: project.targetNodeCount, maxEndings: project.targetEndingCount });
    return <EditorShell project={project} graph={graph} issues={issues} draftRevision={draftRevision} />;
  } finally {
    repository.close();
  }
}
