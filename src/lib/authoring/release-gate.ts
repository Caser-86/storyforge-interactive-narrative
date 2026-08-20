import { AuthoringError } from "./errors";
import { createAuthoringRepository } from "./repository";
import type { AuthoringDatabaseOptions } from "./database";
import { createGenerationRepository } from "./generation/repository";
import { createValidationRepository } from "./validation/repository";
import {
  REQUIRED_RELEASE_SOURCES,
  ValidationDecisionSchema,
  createValidationService,
} from "./validation/service";
import type { ValidationDecision } from "./validation/service";

export type ReleaseDecision = ValidationDecision;
export interface ReleaseGateOptions {
  databaseOptions?: AuthoringDatabaseOptions;
}

export async function assertReleaseReady(projectId: string, expectedRevision: number, options: ReleaseGateOptions = {}): Promise<ReleaseDecision> {
  const authoringRepository = createAuthoringRepository(options.databaseOptions);
  const validationRepository = createValidationRepository(options.databaseOptions);
  const generationRepository = createGenerationRepository(options.databaseOptions);

  try {
    const service = createValidationService({ authoringRepository, validationRepository, generationRepository });
    await assertExpectedRevision(authoringRepository, projectId, expectedRevision);
    const graph = await authoringRepository.getProjectGraph(projectId);
    const runs = await validationRepository.listRuns(projectId, graph.versionId);
    const currentRuns = runs.filter((run) => run.draftRevision === expectedRevision);
    const hasCurrentRequiredRun = currentRuns.some((run) => run.status === "completed" && hasRequiredSources(run.sources));
    const hasHistoricalRequiredRun = runs.some((run) => run.draftRevision !== expectedRevision && run.status === "completed" && hasRequiredSources(run.sources));

    if (!hasCurrentRequiredRun) {
      if (hasHistoricalRequiredRun) {
        throw new AuthoringError("CONFLICT", "Draft validation is stale", {
          expectedRevision,
          validatedRevisions: runs.filter((run) => run.status === "completed").map((run) => run.draftRevision),
        });
      }
      await service.validateDraft(projectId, REQUIRED_RELEASE_SOURCES);
    }

    const decision = ValidationDecisionSchema.parse(await service.getReleaseDecision(projectId));
    await assertExpectedRevision(authoringRepository, projectId, expectedRevision);
    if (decision.allowed) return decision;

    if (decision.blocking.length > 0) {
      throw new AuthoringError("BLOCKING_ISSUES", "Cannot release while blocking validation issues remain", {
        issues: decision.blocking,
      });
    }
    if (!decision.generationComplete) {
      throw new AuthoringError("VALIDATION", "Generation is not complete", { projectId, versionId: decision.versionId });
    }
    throw new AuthoringError("VALIDATION", "Draft has not passed the release validation gate", {
      projectId,
      revision: expectedRevision,
    });
  } finally {
    authoringRepository.close();
    validationRepository.close();
    generationRepository.close();
  }
}

async function assertExpectedRevision(
  authoringRepository: { getDraftRevision(projectId: string): Promise<number> },
  projectId: string,
  expectedRevision: number,
): Promise<void> {
  const currentRevision = await authoringRepository.getDraftRevision(projectId);
  if (currentRevision !== expectedRevision) {
    throw new AuthoringError("CONFLICT", "Draft revision is stale", {
      expectedRevision,
      actualRevision: currentRevision,
    });
  }
}

function hasRequiredSources(sources: string[]): boolean {
  return REQUIRED_RELEASE_SOURCES.every((source) => sources.includes(source));
}
