import { InteractivePlayer } from "@/features/authoring/interactive-player";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type GeneratePageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ sessionId?: string | string[]; session?: string | string[] }>;
};

export const dynamic = "force-dynamic";

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GeneratePage({ params, searchParams }: GeneratePageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  const initialSessionId = firstQueryValue(query.sessionId) ?? firstQueryValue(query.session);
  const repository = createAuthoringRepository();
  try {
    const project = await repository.getProject(projectId);
    const providerMode = process.env.GENERATION_PROVIDER === "fake" ? "fake" : "openai";
    return <InteractivePlayer projectId={project.id} projectTitle={project.title} providerMode={providerMode} initialSessionId={initialSessionId} />;
  } finally {
    repository.close();
  }
}
