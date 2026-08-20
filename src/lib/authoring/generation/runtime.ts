import type { GenerationProvider, ProviderResult } from "./provider";
import { FakeGenerationProvider } from "./fake-provider";
import { OpenAICompatibleGenerationProvider } from "./openai-provider";
import { ProviderError } from "./provider-errors";
import { GenerationExecutor, type GenerationStepExecutionResult } from "./executor";
import type { GenerationRepository } from "./repository";
import type { AuthoringRepository } from "../repository";
import type { GenerationRun, GenerationStep } from "./schemas";
import type { GenerationProjectContext } from "./prompts";
import { executeBibleStage, executeBriefStage, executeContinuityReview, executeGraphStage, executeNodeBatch, executeOutlineStage, executeStructuralCheck } from "./stages";
import { BibleOutputSchema, BriefOutputSchema, GraphOutputSchema, OutlineOutputSchema } from "./stages/types";
import { NodeContentOutputSchema } from "./stages/nodes";

function contextFor(project: Awaited<ReturnType<AuthoringRepository["getProject"]>>, versionId: string): GenerationProjectContext {
  return {
    projectId: project.id,
    versionId,
    title: project.title,
    premise: project.premise,
    genre: project.genre,
    tone: project.tone,
    pointOfView: project.pointOfView,
    rating: project.rating,
    language: typeof project.settingsJson === "object" && project.settingsJson !== null && !Array.isArray(project.settingsJson) && typeof project.settingsJson.language === "string"
      ? project.settingsJson.language
      : "English",
    size: {
      preset: project.sizePreset,
      targetNodes: project.targetNodeCount,
      targetEndings: project.targetEndingCount,
    },
    model: process.env.OPENAI_MODEL,
  };
}

function resultFrom<T>(result: { output: T; providerResult: ProviderResult<T>; nextSteps?: GenerationStepExecutionResult["nextSteps"] }): GenerationStepExecutionResult {
  return {
    parsedResponse: result.output as GenerationStepExecutionResult["parsedResponse"],
    rawResponse: result.providerResult.rawResponse,
    inputTokens: result.providerResult.inputTokens,
    outputTokens: result.providerResult.outputTokens,
    model: result.providerResult.model,
    nextSteps: result.nextSteps,
  };
}

function readCompleted<T>(steps: GenerationStep[], stepKey: string, schema: { parse(value: unknown): T }): T {
  const step = steps.find((candidate) => candidate.stepKey === stepKey && candidate.status === "completed");
  if (!step || step.parsedResponseJson === null) {
    throw new ProviderError("SCHEMA", `Required generation output is missing: ${stepKey}`, false);
  }
  return schema.parse(step.parsedResponseJson);
}

function fixedProvider(project: Awaited<ReturnType<AuthoringRepository["getProject"]>>): GenerationProvider {
  const provider = new FakeGenerationProvider();
  const chapter = { id: "chapter-1", title: "Below the Tramline", goal: "Find the orchard entrance.", summary: "Mara follows a service map below the city." };
  const nodes = [
    ["node-start", "start", "The Service Door"],
    ["node-left", "scene", "The Seed Vault"],
    ["node-left-detail", "scene", "The Root Gallery"],
    ["node-right", "scene", "The Flooded Tunnel"],
    ["node-right-detail", "scene", "The Pump Station"],
    ["node-merge", "scene", "The Orchard Heart"],
    ["node-left-end", "ending", "Keep the Seed"],
    ["node-right-end", "ending", "Expose the Orchard"],
  ].map(([id, kind, title], index) => ({
    id,
    chapterId: chapter.id,
    kind,
    title,
    objective: `${title} objective`,
    summary: `${title} summary`,
    topologicalRank: index,
  }));
  const edges = [
    ["edge-start-left", "node-start", "node-left", "Open the vault"],
    ["edge-start-right", "node-start", "node-right", "Take the tunnel"],
    ["edge-left-detail", "node-left", "node-left-detail", "Search the gallery"],
    ["edge-left-merge", "node-left-detail", "node-merge", "Return to the heart"],
    ["edge-right-detail", "node-right", "node-right-detail", "Find the pump"],
    ["edge-right-merge", "node-right-detail", "node-merge", "Reach the heart"],
    ["edge-merge-left", "node-merge", "node-left-end", "Keep the seed"],
    ["edge-merge-right", "node-merge", "node-right-end", "Tell the city"],
  ].map(([id, sourceNodeId, targetNodeId, label], sortOrder) => ({
    id,
    sourceNodeId,
    targetNodeId,
    label,
    intent: `intent-${sortOrder}`,
    consequenceSummary: `consequence-${sortOrder}`,
    sortOrder,
  }));

  provider.reply("brief", "brief:main", {
    title: project.title,
    premise: project.premise,
    promise: "Every choice trades safety for truth.",
    genre: project.genre,
    tone: project.tone,
    audience: "private test reader",
  });
  provider.reply("bible", "bible:main", {
    worldRules: ["Machines can grow living tissue."],
    themes: ["truth and stewardship"],
    characters: [{ id: "char-courier", name: "Mara", role: "protagonist", traits: ["observant"], goal: "Find the orchard.", secret: "She has seen the map before." }],
    canonFacts: ["The orchard predates the city grid."],
    forbiddenChanges: ["Do not make the orchard supernatural."],
  });
  provider.reply("outline", "outline:main", { chapters: [chapter], nodes: nodes.map(({ summary: _summary, topologicalRank: _rank, ...node }) => node) });
  provider.reply("graph", "graph:main", { chapters: [chapter], nodes, edges });
  for (const node of nodes) {
    provider.reply("nodes", `nodes:${node.id}`, {
      nodeId: node.id,
      body: `${node.title} unfolds with a concrete choice and consequence.`,
      summary: node.summary,
      objective: node.objective,
    });
  }
  provider.reply("continuity_review", "continuity_review:main", { passed: true, issues: [] });
  return provider;
}

export async function createProjectGenerationExecutor(
  projectId: string,
  repository: GenerationRepository,
  authoringRepository: AuthoringRepository,
): Promise<GenerationExecutor> {
  const project = await authoringRepository.getProject(projectId);
  const provider = process.env.GENERATION_PROVIDER === "fake" ? fixedProvider(project) : new OpenAICompatibleGenerationProvider();

  const stepsFor = async (run: GenerationRun) => repository.listSteps(run.id);
  const handlers = {
    brief: async (_step: GenerationStep, run: GenerationRun) => {
      const context = contextFor(project, run.versionId);
      return resultFrom(await executeBriefStage(context, provider));
    },
    bible: async (_step: GenerationStep, run: GenerationRun) => {
      const context = contextFor(project, run.versionId);
      const steps = await stepsFor(run);
      return resultFrom(await executeBibleStage(context, provider, readCompleted(steps, "brief:main", BriefOutputSchema)));
    },
    outline: async (_step: GenerationStep, run: GenerationRun) => {
      const context = contextFor(project, run.versionId);
      const steps = await stepsFor(run);
      return resultFrom(await executeOutlineStage(context, provider, readCompleted(steps, "brief:main", BriefOutputSchema), readCompleted(steps, "bible:main", BibleOutputSchema)));
    },
    graph: async (_step: GenerationStep, run: GenerationRun) => {
      const context = contextFor(project, run.versionId);
      const steps = await stepsFor(run);
      return resultFrom(await executeGraphStage(context, provider, readCompleted(steps, "brief:main", BriefOutputSchema), readCompleted(steps, "bible:main", BibleOutputSchema), readCompleted(steps, "outline:main", OutlineOutputSchema)));
    },
    structural_check: async (_step: GenerationStep, run: GenerationRun) => {
      const context = contextFor(project, run.versionId);
      const graph = readCompleted(await stepsFor(run), "graph:main", GraphOutputSchema);
      const result = executeStructuralCheck(context, graph);
      if (!result.passed) {
        throw new ProviderError("SCHEMA", "Generated graph failed structural validation", false, { details: result.blockingIssues });
      }
      return { parsedResponse: { passed: true, warnings: result.warnings }, rawResponse: null, model: "local-structural-check" };
    },
    nodes: async (step: GenerationStep, run: GenerationRun) => {
      if (!step.subjectId) throw new ProviderError("SCHEMA", "Node step has no subject", false);
      const graph = readCompleted(await stepsFor(run), "graph:main", GraphOutputSchema);
      const result = await executeNodeBatch({ provider, graph, nodeIds: [step.subjectId], context: contextFor(project, run.versionId) }, 1);
      return resultFrom({ output: result.outputs[0]!, providerResult: result.providerResults[0]! });
    },
    continuity_review: async (_step: GenerationStep, run: GenerationRun) => {
      const context = contextFor(project, run.versionId);
      const steps = await stepsFor(run);
      const graph = readCompleted(steps, "graph:main", GraphOutputSchema);
      const nodeContents = steps.filter((candidate) => candidate.stage === "nodes" && candidate.status === "completed" && candidate.parsedResponseJson !== null).map((candidate) => NodeContentOutputSchema.parse(candidate.parsedResponseJson));
      const result = await executeContinuityReview({
        provider,
        context,
        graph,
        bible: readCompleted(steps, "bible:main", BibleOutputSchema),
        outline: readCompleted(steps, "outline:main", OutlineOutputSchema),
        nodeContents,
      });
      return { parsedResponse: result.output, rawResponse: result.providerResult.rawResponse, inputTokens: result.providerResult.inputTokens, outputTokens: result.providerResult.outputTokens, model: result.providerResult.model };
    },
  };

  return new GenerationExecutor(repository, { handlers });
}
