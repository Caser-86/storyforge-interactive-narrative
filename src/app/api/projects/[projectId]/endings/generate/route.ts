import { errorResponse, json, readJsonBody } from "@/lib/authoring/api-contracts";
import { AuthoringError } from "@/lib/authoring/errors";
import {
  AuthorEndingGenerationInputSchema,
  AuthorEndingGenerationResponseSchema,
  type AuthorEndingGenerationInput,
} from "@/lib/authoring/generation/api-contracts";
import { FakeGenerationProvider } from "@/lib/authoring/generation/fake-provider";
import { OpenAICompatibleGenerationProvider } from "@/lib/authoring/generation/openai-provider";
import { generateAuthorEnding } from "@/lib/authoring/generation/stages/author-ending";
import type { GenerationProjectContext } from "@/lib/authoring/generation/prompts";
import { createAuthoringDatabaseScope } from "@/lib/authoring/database";
import { createAuthoringRepository } from "@/lib/authoring/repository";

type RouteContext = { params: Promise<{ projectId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function projectLanguage(settingsJson: unknown): string {
  if (typeof settingsJson === "object" && settingsJson !== null && !Array.isArray(settingsJson)) {
    const language = (settingsJson as Record<string, unknown>).language;
    if (typeof language === "string" && language.trim().length > 0) return language;
  }
  return "Chinese";
}

function fakeEnding(sourceTitle: string) {
  return {
    choiceLabel: "沿着潮声寻找最后的答案",
    intent: "让主角在真相与安全之间作出最后选择。",
    consequenceSummary: "这个选择将揭开真相，并推动故事完成收束。",
    title: `${sourceTitle}：最后的回声`,
    body: `${sourceTitle}的线索在最后一刻汇合，主角作出了决定，承担了随之而来的代价。`,
    summary: "主角完成最后选择，主要冲突得到收束。",
    objective: "完成主角的最终选择并收束主要冲突。",
  };
}

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  let input: AuthorEndingGenerationInput;
  try {
    input = await readJsonBody(request, AuthorEndingGenerationInputSchema, 128_000);
  } catch (error) {
    return errorResponse(error);
  }

  const databaseScope = createAuthoringDatabaseScope();
  const authoring = createAuthoringRepository(databaseScope.options);
  try {
    const { projectId } = await params;
    const project = await authoring.getProject(projectId);
    const graph = await authoring.getProjectGraph(projectId);
    const actualRevision = await authoring.getDraftRevision(projectId);
    if (input.expectedRevision !== actualRevision) {
      throw new AuthoringError("CONFLICT", "Draft revision is stale. Refresh the editor and try again.", {
        expectedRevision: input.expectedRevision,
        actualRevision,
      });
    }

    const sourceNode = graph.nodes.find((node) => node.id === input.sourceNodeId);
    if (!sourceNode) {
      throw new AuthoringError("NOT_FOUND", "Source node not found.", { sourceNodeId: input.sourceNodeId });
    }
    if (sourceNode.kind === "ending") {
      throw new AuthoringError("VALIDATION", "An ending node cannot create another ending.", { sourceNodeId: input.sourceNodeId });
    }
    if (graph.nodes.length >= project.targetNodeCount) {
      throw new AuthoringError("BLOCKING_ISSUES", `The project has reached its node limit of ${project.targetNodeCount}.`);
    }
    if (graph.nodes.filter((node) => node.kind === "ending").length >= project.targetEndingCount) {
      throw new AuthoringError("BLOCKING_ISSUES", `The project has reached its ending limit of ${project.targetEndingCount}.`);
    }

    const context: GenerationProjectContext = {
      projectId: project.id,
      versionId: graph.versionId,
      title: project.title,
      premise: project.premise,
      genre: project.genre,
      tone: project.tone,
      pointOfView: project.pointOfView,
      rating: project.rating,
      language: projectLanguage(project.settingsJson),
      size: { preset: project.sizePreset, targetNodes: project.targetNodeCount, targetEndings: project.targetEndingCount },
      model: process.env.OPENAI_MODEL,
    };
    const provider = process.env.GENERATION_PROVIDER === "fake"
      ? new FakeGenerationProvider()
      : new OpenAICompatibleGenerationProvider();
    if (provider instanceof FakeGenerationProvider) {
      provider.reply("author_ending", `author-ending:${sourceNode.id}`, fakeEnding(sourceNode.title));
    }

    const result = await generateAuthorEnding({
      provider,
      context,
      graph,
      sourceNodeId: sourceNode.id,
      direction: input.direction,
    });

    return json(AuthorEndingGenerationResponseSchema, {
      sourceNodeId: sourceNode.id,
      basedOnRevision: actualRevision,
      model: result.providerResult.model,
      ending: result.output,
      inputTokens: result.providerResult.inputTokens,
      outputTokens: result.providerResult.outputTokens,
      ...(result.providerResult.usageConfirmed === undefined ? {} : { usageConfirmed: result.providerResult.usageConfirmed }),
    });
  } catch (error) {
    return errorResponse(error);
  } finally {
    authoring.close();
    databaseScope.close();
  }
}
