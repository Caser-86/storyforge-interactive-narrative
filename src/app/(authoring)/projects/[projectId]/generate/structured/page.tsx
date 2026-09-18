import Link from "next/link";
import { GenerationProgress } from "@/features/authoring/generation-progress";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type StructuredGeneratePageProps = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";

export default async function StructuredGeneratePage({ params }: StructuredGeneratePageProps) {
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
              <div><p className="eyebrow">AUTHORING DESK / STRUCTURED GENERATION</p><p className="brand-name">一次性结构化生成</p></div>
            </div>
            <div className="interactive-header-actions">
              <Link className="text-link" href={`/projects/${projectId}/generate`}>返回分支写作</Link>
              <Link className="text-link" href={`/projects/${projectId}/edit`}>查看编辑器</Link>
            </div>
          </header>
          <GenerationProgress projectId={project.id} projectTitle={project.title} />
        </div>
      </main>
    );
  } finally {
    repository.close();
  }
}
