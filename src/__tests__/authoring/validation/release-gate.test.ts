import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import { createValidationRepository } from "@/lib/authoring/validation/repository";
import type { ValidationRepository } from "@/lib/authoring/validation/repository";
import { createValidationService } from "@/lib/authoring/validation/service";
import { assertReleaseReady } from "@/lib/authoring/release-gate";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";
import type { StoryGraph } from "@/lib/authoring/schemas";

let tempDir: string;
let originalSqliteDbPath: string | undefined;
let originalSqliteBackupDir: string | undefined;
let authoring: AuthoringRepository;
let validation: ValidationRepository;

function fixtureProjectInput(): CreateProjectInput {
  return {
    title: "Clockwork Orchard",
    premise: "A courier discovers a machine-grown forest beneath the city.",
    genre: "solarpunk mystery",
    tone: "hopeful suspense",
    pointOfView: "second person",
    rating: "PG-13",
    size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
  };
}

function graphForVersion(versionId: string, source: StoryGraph = validReleaseGraph()): StoryGraph {
  const chapterId = `${versionId}-chapter-1`;
  const nodeIds = new Map(source.nodes.map((node, index) => [node.id, `${versionId}-node-${index}`]));
  return {
    versionId,
    chapters: source.chapters.map((chapter) => ({ ...chapter, id: chapterId, versionId })),
    nodes: source.nodes.map((node, index) => ({ ...node, id: nodeIds.get(node.id)!, versionId, chapterId, topologicalRank: index })),
    edges: source.edges.map((edge, index) => ({ ...edge, id: `${versionId}-edge-${index}`, versionId, sourceNodeId: nodeIds.get(edge.sourceNodeId)!, targetNodeId: nodeIds.get(edge.targetNodeId)! })),
  };
}

describe("authoring release gate", () => {
  beforeEach(() => {
    originalSqliteDbPath = process.env.SQLITE_DB_PATH;
    originalSqliteBackupDir = process.env.SQLITE_BACKUP_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-release-gate-"));
    process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
    process.env.SQLITE_BACKUP_DIR = path.join(tempDir, "backups");
    vi.resetModules();
    authoring = createAuthoringRepository();
    validation = createValidationRepository();
  });

  afterEach(() => {
    authoring.close();
    validation.close();
    vi.resetModules();
    if (originalSqliteDbPath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = originalSqliteDbPath;
    if (originalSqliteBackupDir === undefined) delete process.env.SQLITE_BACKUP_DIR;
    else process.env.SQLITE_BACKUP_DIR = originalSqliteBackupDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("bootstraps deterministic validation when a draft has never been validated", async () => {
    const project = await authoring.createProject(fixtureProjectInput());
    await authoring.replaceDraftGraph(project.id, graphForVersion(project.activeDraftVersionId!), 0);

    const decision = await assertReleaseReady(project.id, 1);

    expect(decision.allowed).toBe(true);
    expect(decision.validationRevision).toBe(1);
  });

  it("rejects a changed draft when the last validation belongs to an older revision", async () => {
    const project = await authoring.createProject(fixtureProjectInput());
    const graph = graphForVersion(project.activeDraftVersionId!);
    await authoring.replaceDraftGraph(project.id, graph, 0);
    const service = createValidationService({ authoringRepository: authoring, validationRepository: validation });
    await service.validateDraft(project.id, ["structural", "rule"]);
    await authoring.patchDraftNode(project.id, graph.nodes[0]!.id, { body: "Changed after review." }, 0);

    await expect(assertReleaseReady(project.id, 2)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("blocks release when an open structural issue remains", async () => {
    const project = await authoring.createProject(fixtureProjectInput());
    const graph = graphForVersion(project.activeDraftVersionId!);
    await authoring.replaceDraftGraph(project.id, graph, 0);
    const service = createValidationService({ authoringRepository: authoring, validationRepository: validation });
    await service.validateDraft(project.id, ["structural", "rule"]);
    await validation.replaceIssues(graph.versionId, 1, "structural", [{
      source: "structural",
      severity: "blocking",
      code: "CYCLE",
      message: "The graph contains a cycle.",
      nodeId: graph.nodes[0]!.id,
      edgeId: null,
    }]);

    await expect(assertReleaseReady(project.id, 1)).rejects.toMatchObject({ code: "BLOCKING_ISSUES" });
  });
});
