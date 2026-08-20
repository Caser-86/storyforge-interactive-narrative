import Link from "next/link";
import { GenerationProgress } from "@/features/authoring/generation-progress";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type GeneratePageProps = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";

export default async function GeneratePage({ params }: GeneratePageProps) {
  const { projectId } = await params;
  const repository = createAuthoringRepository();
  try {
    const project = await repository.getProject(projectId);
    return (
      <main className="authoring-shell">
        <div className="authoring-container generation-page">
          <header className="authoring-header">
            <div className="brand-lockup">
              <span className="brand-mark" aria-hidden="true">SF</span>
              <div><p className="eyebrow">AUTHORING DESK / GENERATION</p><p className="brand-name">结构化生成流程</p></div>
            </div>
            <Link className="text-link" href={`/projects/${projectId}/edit`}>查看编辑器</Link>
          </header>
          <GenerationProgress projectId={project.id} projectTitle={project.title} />
        </div>
      </main>
    );
  } finally {
    repository.close();
  }
}
