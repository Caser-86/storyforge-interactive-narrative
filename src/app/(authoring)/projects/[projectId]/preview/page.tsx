import Link from "next/link";
import { PreviewPlayer } from "@/features/authoring/preview-player";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { listSnapshots } from "@/lib/authoring/snapshots";

type PreviewPageProps = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { projectId } = await params;
  const repository = createAuthoringRepository();
  try {
    const project = await repository.getProject(projectId);
    const snapshots = await listSnapshots(projectId);
    const latestValidSnapshot = snapshots.filter((snapshot) => snapshot.status === "valid" && snapshot.sealedAt !== null).at(-1);
    return <><PreviewPlayer projectId={project.id} projectTitle={project.title} initialSnapshotId={latestValidSnapshot?.id ?? null} /><Link className="preview-back-link" href={`/projects/${project.id}/edit`}>编辑器</Link></>;
  } finally {
    repository.close();
  }
}
