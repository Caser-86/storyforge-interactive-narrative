import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthoringError } from "@/lib/authoring/errors";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import {
  createGenerationRepository,
  DEFAULT_GENERATION_STEP_DESCRIPTORS,
} from "@/lib/authoring/generation/repository";
import type { GenerationRepository } from "@/lib/authoring/generation/repository";
import type { GenerationStepDescriptor } from "@/lib/authoring/generation/schemas";

let tempDir: string;
let dbPath: string;
let backupDir: string;
let authoringRepos: AuthoringRepository[];
let generationRepos: GenerationRepository[];

function fixtureProjectInput(overrides: Partial<CreateProjectInput> = {}): CreateProjectInput {
  return {
    title: "Clockwork Orchard",
    premise: "A courier discovers a machine-grown forest beneath the city.",
    genre: "solarpunk mystery",
    tone: "hopeful suspense",
    pointOfView: "second person",
    rating: "PG-13",
    size: {
      preset: "micro",
      targetNodes: 8,
      targetEndings: 2,
    },
    ...overrides,
  };
}

function date(minutes: number): Date {
  return new Date(Date.UTC(2026, 7, 19, 12, minutes, 0, 0));
}

function leaseInput(step: { attempt: number; leaseExpiresAt: string | null }) {
  return {
    attempt: step.attempt,
    leaseExpiresAt: step.leaseExpiresAt!,
  };
}

function createAuthoringRepo(): AuthoringRepository {
  const repo = createAuthoringRepository({ dbPath, backupDir });
  authoringRepos.push(repo);
  return repo;
}

function createRunsRepo(): GenerationRepository {
  const repo = createGenerationRepository({ dbPath, backupDir });
  generationRepos.push(repo);
  return repo;
}

async function createProject() {
  const repo = createAuthoringRepo();
  return repo.createProject(fixtureProjectInput());
}

describe("authoring generation repository", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-generation-"));
    dbPath = path.join(tempDir, "authoring.sqlite");
    backupDir = path.join(tempDir, "backups");
    authoringRepos = [];
    generationRepos = [];
  });

  afterEach(() => {
    for (const repo of generationRepos) {
      repo.close();
    }

    for (const repo of authoringRepos) {
      repo.close();
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("allows only one active run per project", async () => {
    const project = await createProject();
    const runs = createRunsRepo();

    await runs.createRun(project.id, project.activeDraftVersionId!, { now: date(0) });

    await expect(runs.createRun(project.id, project.activeDraftVersionId!, { now: date(1) })).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<AuthoringError>);
  });

  it("reclaims an expired running step as retryable work", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, { now: date(0) });

    const leased = await runs.leaseNextSteps(run.id, date(0), 1);
    const reclaimed = await runs.leaseNextSteps(run.id, date(6), 1);

    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0].id).toBe(leased[0].id);
    expect(reclaimed[0].attempt).toBe(2);
  });

  it("keeps step keys unique within a run", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const duplicateSteps: GenerationStepDescriptor[] = [
      { stepKey: "brief:main", stage: "brief", sortOrder: 0 },
      { stepKey: "brief:main", stage: "brief", sortOrder: 1 },
    ];

    await expect(
      runs.createRun(project.id, project.activeDraftVersionId!, { now: date(0), steps: duplicateSteps }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<AuthoringError>);

    expect(await runs.listRuns(project.id)).toEqual([]);
  });

  it("completes a leased step idempotently without double-counting progress", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, {
      now: date(0),
      steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
    });
    const [step] = await runs.leaseNextSteps(run.id, date(1), 1);

    await runs.completeStep(step.id, {
      ...leaseInput(step),
      completedAt: date(2),
      model: "fake-model",
      rawResponse: { id: "raw-1" },
      parsedResponse: { ok: true },
      inputTokens: 11,
      outputTokens: 13,
    });
    await runs.completeStep(step.id, {
      ...leaseInput(step),
      completedAt: date(3),
      model: "different-model",
      rawResponse: { id: "raw-2" },
      parsedResponse: { ok: false },
      inputTokens: 99,
      outputTokens: 99,
    });

    const completed = await runs.getStep(step.id);
    const updatedRun = await runs.getRun(run.id);

    expect(completed).toMatchObject({
      status: "completed",
      model: "fake-model",
      inputTokens: 11,
      outputTokens: 13,
    });
    expect(updatedRun).toMatchObject({
      status: "completed",
      progressCurrent: 1,
      progressTotal: 1,
      inputTokens: 11,
      outputTokens: 13,
    });
  });

  it("ignores late writes after a run is paused or canceled", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, {
      now: date(0),
      steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
    });
    const [leased] = await runs.leaseNextSteps(run.id, date(1), 1);

    await runs.pauseRun(run.id, date(2));
    expect((await runs.completeStep(leased.id, {
      ...leaseInput(leased),
      completedAt: date(3),
      parsedResponse: { late: "paused" },
      inputTokens: 11,
      outputTokens: 13,
    })).status).toBe("queued");
    expect((await runs.failStep(leased.id, {
      ...leaseInput(leased),
      failedAt: date(3),
      code: "NETWORK",
      message: "late failure after pause",
      retryable: false,
    })).status).toBe("queued");
    expect(await runs.getRun(run.id)).toMatchObject({
      status: "paused",
      inputTokens: 0,
      outputTokens: 0,
    });

    await runs.resumeRun(run.id, date(4));
    const [reclaimed] = await runs.leaseNextSteps(run.id, date(5), 1);
    await runs.cancelRun(run.id, date(6));

    expect((await runs.completeStep(reclaimed.id, {
      ...leaseInput(reclaimed),
      completedAt: date(7),
      parsedResponse: { late: "canceled" },
      inputTokens: 17,
      outputTokens: 19,
    })).status).toBe("canceled");
    expect((await runs.getStep(reclaimed.id)).status).toBe("canceled");
    expect(await runs.getRun(run.id)).toMatchObject({
      status: "canceled",
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("leases scheduled retry steps only after their next attempt time", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, { now: date(0) });
    const [step] = await runs.leaseNextSteps(run.id, date(1), 1);

    await runs.failStep(step.id, {
      ...leaseInput(step),
      failedAt: date(2),
      code: "RATE_LIMIT",
      message: "try later",
      retryable: true,
      nextAttemptAt: date(5),
    });

    expect(await runs.leaseNextSteps(run.id, date(4), 1)).toEqual([]);

    const [retry] = await runs.leaseNextSteps(run.id, date(5), 1);

    expect(retry.id).toBe(step.id);
    expect(retry.attempt).toBe(2);
    expect(retry.errorCode).toBeNull();
  });

  it("pauses, resumes, and cancels active runs transactionally", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, { now: date(0) });

    await runs.pauseRun(run.id, date(1), { code: "AUTH", message: "missing credentials" });

    expect((await runs.getRun(run.id)).status).toBe("paused");
    expect(await runs.leaseNextSteps(run.id, date(2), 1)).toEqual([]);

    await runs.resumeRun(run.id, date(3));
    expect((await runs.getRun(run.id)).status).toBe("queued");
    expect(await runs.leaseNextSteps(run.id, date(4), 1)).toHaveLength(1);

    await runs.cancelRun(run.id, date(5));
    expect((await runs.getRun(run.id)).status).toBe("canceled");

    const nextRun = await runs.createRun(project.id, project.activeDraftVersionId!, { now: date(6) });
    expect(nextRun.id).not.toBe(run.id);
  });

  it("rejects stale lease owners after a step is reclaimed", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, { now: date(0) });
    const [originalLease] = await runs.leaseNextSteps(run.id, date(0), 1);

    await expect(
      runs.completeStep(originalLease.id, {
        ...leaseInput(originalLease),
        completedAt: date(5),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const [reclaimedLease] = await runs.leaseNextSteps(run.id, date(6), 1);

    await expect(
      runs.completeStep(originalLease.id, {
        ...leaseInput(originalLease),
        completedAt: date(7),
        parsedResponse: { stale: true },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await runs.completeStep(reclaimedLease.id, {
      ...leaseInput(reclaimedLease),
      completedAt: date(8),
      parsedResponse: { stale: false },
    });
    expect((await runs.getStep(reclaimedLease.id)).status).toBe("completed");
  });

  it("does not resurrect a failed run when a sibling step completes", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, {
      now: date(0),
      steps: [
        { stepKey: "brief:first", stage: "brief", sortOrder: 0 },
        { stepKey: "brief:second", stage: "brief", sortOrder: 0 },
      ],
    });
    const leases = await runs.leaseNextSteps(run.id, date(1), 2);

    await runs.failStep(leases[0].id, {
      ...leaseInput(leases[0]),
      failedAt: date(2),
      code: "AUTH",
      message: "provider unavailable",
      retryable: false,
    });
    await runs.completeStep(leases[1].id, {
      ...leaseInput(leases[1]),
      completedAt: date(3),
      inputTokens: 7,
      outputTokens: 11,
    });

    expect(await runs.getRun(run.id)).toMatchObject({
      status: "failed",
      progressCurrent: 1,
      progressTotal: 2,
      inputTokens: 7,
      outputTokens: 11,
    });
  });

  it("does not resurrect a failed run when a sibling failure is retryable", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, {
      now: date(0),
      steps: [
        { stepKey: "brief:first", stage: "brief", sortOrder: 0 },
        { stepKey: "brief:second", stage: "brief", sortOrder: 0 },
      ],
    });
    const leases = await runs.leaseNextSteps(run.id, date(1), 2);

    await runs.failStep(leases[0].id, {
      ...leaseInput(leases[0]),
      failedAt: date(2),
      code: "AUTH",
      message: "provider unavailable",
      retryable: false,
    });
    await runs.failStep(leases[1].id, {
      ...leaseInput(leases[1]),
      failedAt: date(3),
      code: "RATE_LIMIT",
      message: "try later",
      retryable: true,
      nextAttemptAt: date(8),
    });

    expect((await runs.getRun(run.id)).status).toBe("failed");
  });

  it("ignores late terminal step transitions and preserves terminal runs", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const run = await runs.createRun(project.id, project.activeDraftVersionId!, {
      now: date(0),
      steps: [DEFAULT_GENERATION_STEP_DESCRIPTORS[0]],
    });
    const [step] = await runs.leaseNextSteps(run.id, date(1), 1);
    await runs.completeStep(step.id, { ...leaseInput(step), completedAt: date(2) });

    expect((await runs.failStep(step.id, {
      ...leaseInput(step),
      failedAt: date(3),
      code: "NETWORK",
      message: "late failure",
      retryable: false,
    })).status).toBe("completed");
    expect((await runs.cancelRun(run.id, date(4))).status).toBe("completed");
  });

  it("rejects custom steps that violate the canonical stage order", async () => {
    const project = await createProject();
    const runs = createRunsRepo();

    await expect(
      runs.createRun(project.id, project.activeDraftVersionId!, {
        now: date(0),
        steps: [
          { stepKey: "bible:main", stage: "bible", sortOrder: 0 },
          { stepKey: "brief:main", stage: "brief", sortOrder: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects candidate references that cross generation projects", async () => {
    const projectA = await createProject();
    const projectB = await createAuthoringRepo().createProject(fixtureProjectInput({ title: "Second project" }));
    const runs = createRunsRepo();
    const runA = await runs.createRun(projectA.id, projectA.activeDraftVersionId!, { now: date(0) });
    const runB = await runs.createRun(projectB.id, projectB.activeDraftVersionId!, { now: date(1) });
    const db = new Database(dbPath);

    try {
      const chapterId = "candidate-chapter";
      const nodeId = "candidate-node";
      db.prepare(
        `INSERT INTO chapters (id, version_id, ordinal, title, goal, summary, created_at, updated_at)
         VALUES (?, ?, 0, 'Chapter', 'Goal', 'Summary', ?, ?)`,
      ).run(chapterId, projectA.activeDraftVersionId, date(0).toISOString(), date(0).toISOString());
      db.prepare(
        `INSERT INTO story_nodes (
          id, version_id, chapter_id, node_key, kind, title, body, summary, objective,
          topological_rank, content_status, author_modified, content_revision, created_at, updated_at
        ) VALUES (?, ?, ?, 'candidate', 'scene', 'Title', 'Body', 'Summary', 'Objective', 0, 'planned', 0, 0, ?, ?)`,
      ).run(nodeId, projectA.activeDraftVersionId, chapterId, date(0).toISOString(), date(0).toISOString());

      expect(() =>
        db.prepare(
          `INSERT INTO generation_candidates (
            id, project_id, version_id, run_id, step_id, node_id, base_content_revision,
            status, candidate_body, model, raw_response, created_at, applied_at, rejected_at
          ) VALUES ('candidate-1', ?, ?, ?, NULL, ?, 0, 'pending', 'Candidate', 'fake', NULL, ?, NULL, NULL)`,
        ).run(
          projectA.id,
          projectA.activeDraftVersionId,
          runB.id,
          nodeId,
          date(2).toISOString(),
        ),
      ).toThrow();

      expect(runA.id).not.toBe(runB.id);
    } finally {
      db.close();
    }
  });

  it("keeps candidate application behind the node revision guard", async () => {
    const project = await createProject();
    const runs = createRunsRepo();
    const db = new Database(dbPath);
    const chapterId = "candidate-apply-chapter";
    const nodeId = "candidate-apply-node";

    try {
      db.prepare(
        `INSERT INTO chapters (id, version_id, ordinal, title, goal, summary, created_at, updated_at)
         VALUES (?, ?, 0, 'Chapter', 'Goal', 'Summary', ?, ?)`,
      ).run(chapterId, project.activeDraftVersionId, date(0).toISOString(), date(0).toISOString());
      db.prepare(
        `INSERT INTO story_nodes (
          id, version_id, chapter_id, node_key, kind, title, body, summary, objective,
          topological_rank, content_status, author_modified, content_revision, created_at, updated_at
        ) VALUES (?, ?, ?, 'candidate-apply', 'scene', 'Title', 'Original', 'Summary', 'Objective', 0, 'generated', 0, 0, ?, ?)`,
      ).run(nodeId, project.activeDraftVersionId, chapterId, date(0).toISOString(), date(0).toISOString());

      const candidate = await runs.createCandidate({
        projectId: project.id,
        versionId: project.activeDraftVersionId!,
        nodeId,
        baseContentRevision: 0,
        candidateBody: "Candidate body",
        model: "fake",
      });
      const applied = await runs.applyCandidate(project.id, candidate.id, 0);
      expect(applied.node).toMatchObject({ body: "Candidate body", contentRevision: 1, authorModified: true });

      const stale = await runs.createCandidate({
        projectId: project.id,
        versionId: project.activeDraftVersionId!,
        nodeId,
        baseContentRevision: 0,
        candidateBody: "Stale candidate",
      });
      await expect(runs.applyCandidate(project.id, stale.id, 0)).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      db.close();
    }
  });
});
