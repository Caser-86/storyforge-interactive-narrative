import { z } from "zod";
import { RELEASE_GRAPH_LIMITS, validateStoryGraph } from "../graph";
import type { AuthoringRepository } from "../repository";
import { OpenAICompatibleGenerationProvider } from "../generation/openai-provider";
import type { GenerationProvider } from "../generation/provider";
import type { GenerationRepository } from "../generation/repository";
import { runAiContinuityReview } from "./ai-review";
import { runDeterministicRules } from "./rules";
import type { ValidationRepository } from "./repository";
import { ValidationIssueRecordSchema, ValidationRunSchema, ValidationSourceSchema } from "./schemas";
import type { ValidationIssueInput, ValidationIssueRecord, ValidationRun, ValidationSource } from "./schemas";

export const DEFAULT_VALIDATION_SOURCES: ValidationSource[] = ["structural", "rule", "ai_review"];
export const REQUIRED_RELEASE_SOURCES: ValidationSource[] = ["structural", "rule"];

export const ValidateDraftRequestSchema = z
  .object({
    sources: z.array(ValidationSourceSchema).min(1).optional(),
  })
  .strict();

export const ValidationIssueActionSchema = z
  .object({
    action: z.enum(["resolve", "dismiss"]),
  })
  .strict();

export const ValidationDecisionSchema = z
  .object({
    projectId: z.string().min(1),
    versionId: z.string().min(1),
    currentRevision: z.number().int().min(0),
    validationRevision: z.number().int().min(0).nullable(),
    allowed: z.boolean(),
    generationComplete: z.boolean(),
    blocking: z.array(ValidationIssueRecordSchema),
    warnings: z.array(ValidationIssueRecordSchema),
  })
  .strict();

export const ValidationRunResultSchema = ValidationDecisionSchema.extend({
  run: ValidationRunSchema,
  issues: z.array(ValidationIssueRecordSchema),
}).strict();

export interface ValidationServiceDependencies {
  authoringRepository: Pick<AuthoringRepository, "getProject" | "getProjectGraph" | "getDraftRevision">;
  validationRepository: ValidationRepository;
  generationProvider?: GenerationProvider;
  generationRepository?: Pick<GenerationRepository, "listRuns">;
}

export type ValidationDecision = z.infer<typeof ValidationDecisionSchema>;
export type ValidationRunResult = z.infer<typeof ValidationRunResultSchema>;

export class AuthoringValidationService {
  private readonly authoringRepository: ValidationServiceDependencies["authoringRepository"];
  private readonly validationRepository: ValidationRepository;
  private readonly generationProvider: GenerationProvider;
  private readonly generationRepository?: Pick<GenerationRepository, "listRuns">;

  constructor(dependencies: ValidationServiceDependencies) {
    this.authoringRepository = dependencies.authoringRepository;
    this.validationRepository = dependencies.validationRepository;
    this.generationProvider = dependencies.generationProvider ?? new OpenAICompatibleGenerationProvider();
    this.generationRepository = dependencies.generationRepository;
  }

  public async validateDraft(projectId: string, sources: ValidationSource[] = DEFAULT_VALIDATION_SOURCES): Promise<ValidationRunResult> {
    const selectedSources = uniqueSources(sources);
    const project = await this.authoringRepository.getProject(projectId);
    const graph = await this.authoringRepository.getProjectGraph(projectId);
    const revision = await this.authoringRepository.getDraftRevision(projectId);
    const run = await this.validationRepository.createRun(projectId, graph.versionId, revision, selectedSources);

    try {
      if (selectedSources.includes("structural")) {
        const structuralIssues = validateStoryGraph(graph, {
          ...RELEASE_GRAPH_LIMITS,
          maxNodes: project.targetNodeCount,
          maxEndings: project.targetEndingCount,
        }).map(toIssueInput);
        await this.validationRepository.replaceIssues(graph.versionId, revision, "structural", structuralIssues, run.id);
      }

      if (selectedSources.includes("rule")) {
        const ruleIssues = runDeterministicRules(graph, qualityContext(project.settingsJson));
        await this.validationRepository.replaceIssues(graph.versionId, revision, "rule", ruleIssues, run.id);
      }

      if (selectedSources.includes("ai_review")) {
        const aiReview = await runAiContinuityReview({
          provider: this.generationProvider,
          model: process.env.OPENAI_MODEL,
          canon: qualityContext(project.settingsJson).canonFacts,
          characterCards: qualityContext(project.settingsJson).characterCards,
          endingSummaries: graph.nodes
            .filter((node) => node.kind === "ending")
            .map((node) => ({ nodeId: node.id, title: node.title, summary: node.summary })),
          chapters: graph.chapters.map((chapter) => ({
            chapterId: chapter.id,
            title: chapter.title,
            summary: chapter.summary,
            nodes: graph.nodes
              .filter((node) => node.chapterId === chapter.id)
              .map((node) => ({ nodeId: node.id, title: node.title, body: node.body, summary: node.summary })),
          })),
        });
        await this.validationRepository.replaceIssues(graph.versionId, revision, "ai_review", aiReview.issues, run.id);
      }

      const completedRun = await this.validationRepository.completeRun(run.id);
      return this.resultForRevision(projectId, graph.versionId, revision, completedRun);
    } catch (error) {
      await this.validationRepository.completeRun(run.id, "failed", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  public async getReleaseDecision(projectId: string): Promise<ValidationDecision> {
    const graph = await this.authoringRepository.getProjectGraph(projectId);
    const currentRevision = await this.authoringRepository.getDraftRevision(projectId);
    return this.decisionForRevision(projectId, graph.versionId, currentRevision);
  }

  private async resultForRevision(projectId: string, versionId: string, revision: number, run: ValidationRun): Promise<ValidationRunResult> {
    const decision = await this.decisionForRevision(projectId, versionId, revision);
    const issues = await this.validationRepository.listIssues(projectId, versionId, revision);
    return ValidationRunResultSchema.parse({ ...decision, run, issues });
  }

  private async decisionForRevision(projectId: string, versionId: string, currentRevision: number): Promise<ValidationDecision> {
    const issues = await this.validationRepository.listIssues(projectId, versionId, currentRevision);
    const runs = await this.validationRepository.listRuns(projectId, versionId, currentRevision);
    const completedRuns = runs.filter((run) => run.status === "completed");
    const latestCompleteRun = completedRuns.at(-1);
    const hasRequiredSources = REQUIRED_RELEASE_SOURCES.every((source) => latestCompleteRun?.sources.includes(source) === true);
    const blocking = issues.filter((issue) => issue.status === "open" && issue.severity === "blocking");
    const warnings = issues.filter((issue) => issue.status === "open" && issue.severity === "warning");
    const generationComplete = await this.isGenerationComplete(projectId, versionId);
    return ValidationDecisionSchema.parse({
      projectId,
      versionId,
      currentRevision,
      validationRevision: hasRequiredSources ? currentRevision : null,
      allowed: hasRequiredSources && generationComplete && blocking.length === 0,
      generationComplete,
      blocking,
      warnings,
    });
  }

  private async isGenerationComplete(projectId: string, versionId: string): Promise<boolean> {
    if (!this.generationRepository) return true;
    const runs = (await this.generationRepository.listRuns(projectId)).filter((run) => run.versionId === versionId);
    if (runs.length === 0) return true;
    return runs.at(-1)?.status === "completed";
  }
}

export function createValidationService(dependencies: ValidationServiceDependencies): AuthoringValidationService {
  return new AuthoringValidationService(dependencies);
}

function uniqueSources(sources: ValidationSource[]): ValidationSource[] {
  return [...new Set(sources)];
}

function toIssueInput(issue: Pick<ValidationIssueRecord, "severity" | "code" | "message" | "nodeId" | "edgeId" | "detailsJson">): ValidationIssueInput {
  return {
    source: "structural",
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    nodeId: issue.nodeId,
    edgeId: issue.edgeId,
    detailsJson: issue.detailsJson,
  };
}

type QualityContext = {
  canonFacts: string[];
  characterCards: string[];
  openThreads: string[];
  resolvedThreads: string[];
};

function qualityContext(settingsJson: unknown): QualityContext {
  if (typeof settingsJson !== "object" || settingsJson === null || Array.isArray(settingsJson)) {
    return { canonFacts: [], characterCards: [], openThreads: [], resolvedThreads: [] };
  }
  const settings = settingsJson as Record<string, unknown>;
  return {
    canonFacts: stringArray(settings.canonFacts ?? settings.canon),
    characterCards: stringArray(settings.characterCards),
    openThreads: stringArray(settings.openThreads),
    resolvedThreads: stringArray(settings.resolvedThreads),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
