import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorResponseSchema } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import { createValidationRepository } from "@/lib/authoring/validation/repository";
import type { ValidationRepository } from "@/lib/authoring/validation/repository";
import type { StoryGraph } from "@/lib/authoring/schemas";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

type ProjectContext = { params: Promise<{ projectId: string }> };

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

function request(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function projectContext(projectId: string): ProjectContext {
  return { params: Promise.resolve({ projectId }) };
}

function graphForVersion(versionId: string, source: StoryGraph = validReleaseGraph()): StoryGraph {
  const chapterId = `${versionId}-chapter-1`;
  const nodeIds = new Map(source.nodes.map((node, index) => [node.id, `${versionId}-node-${index}`]));
  const chapters = source.chapters.map((chapter) => ({ ...chapter, id: chapterId, versionId }));
  return {
    versionId,
    chapters,
    nodes: source.nodes.map((node, index) => ({ ...node, id: nodeIds.get(node.id)!, versionId, chapterId, topologicalRank: index })),
    edges: source.edges.map((edge, index) => ({
      ...edge,
      id: `${versionId}-edge-${index}`,
      versionId,
      sourceNodeId: nodeIds.get(edge.sourceNodeId)!,
      targetNodeId: nodeIds.get(edge.targetNodeId)!,
    })),
  };
}

async function importRoutes() {
  return {
    validation: await import("@/app/api/projects/[projectId]/validate/route"),
    issue: await import("@/app/api/projects/[projectId]/validation/[issueId]/route"),
  };
}

async function createProjectWithGraph() {
  const project = await authoring.createProject(fixtureProjectInput());
  const graph = graphForVersion(project.activeDraftVersionId!);
  await authoring.replaceDraftGraph(project.id, graph, 0);
  return { project, graph };
}

describe("authoring validation API", () => {
  beforeEach(() => {
    originalSqliteDbPath = process.env.SQLITE_DB_PATH;
    originalSqliteBackupDir = process.env.SQLITE_BACKUP_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-validation-api-"));
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

  it("runs only selected sources and permits release after the current revision is validated", async () => {
    const { project } = await createProjectWithGraph();
    const routes = await importRoutes();

    const selected = await routes.validation.POST(
      request(`http://local/api/projects/${project.id}/validate`, "POST", { sources: ["structural"] }),
      projectContext(project.id),
    );
    const selectedPayload = await selected.json();
    expect(selected.status).toBe(200);
    expect(selectedPayload.run.sources).toEqual(["structural"]);
    expect(selectedPayload.run.status).toBe("completed");

    const complete = await routes.validation.POST(
      request(`http://local/api/projects/${project.id}/validate`, "POST", { sources: ["structural", "rule"] }),
      projectContext(project.id),
    );
    const completePayload = await complete.json();
    expect(completePayload.allowed).toBe(true);
    expect(completePayload.validationRevision).toBe(1);
    expect(completePayload.blocking).toEqual([]);
  });

  it("marks validation stale after the draft revision changes", async () => {
    const { project, graph } = await createProjectWithGraph();
    const routes = await importRoutes();

    await routes.validation.POST(
      request(`http://local/api/projects/${project.id}/validate`, "POST", { sources: ["structural", "rule"] }),
      projectContext(project.id),
    );
    await authoring.patchDraftNode(project.id, graph.nodes[0]!.id, { body: "A changed body." }, 0);

    const current = await routes.validation.GET(
      request(`http://local/api/projects/${project.id}/validate`, "GET"),
      projectContext(project.id),
    );
    const payload = await current.json();
    expect(payload.currentRevision).toBe(2);
    expect(payload.validationRevision).toBeNull();
    expect(payload.allowed).toBe(false);
  });

  it("allows warning dismissal but rejects dismissal of a blocking issue", async () => {
    const { project, graph } = await createProjectWithGraph();
    const routes = await importRoutes();
    const revision = await authoring.getDraftRevision(project.id);
    const warning = (await validation.replaceIssues(graph.versionId, revision, "rule", [{
      source: "rule",
      severity: "warning",
      code: "SIMILAR_CHOICES",
      message: "Choices are too similar.",
      nodeId: graph.nodes[0]!.id,
      edgeId: null,
      detailsJson: { similarity: 0.9 },
    }]))[0]!;
    const blocking = (await validation.replaceIssues(graph.versionId, revision, "structural", [{
      source: "structural",
      severity: "blocking",
      code: "CYCLE",
      message: "The graph contains a cycle.",
      nodeId: graph.nodes[0]!.id,
      edgeId: null,
    }]))[0]!;

    const dismissed = await routes.issue.PATCH(
      request(`http://local/api/projects/${project.id}/validation/${warning.id}`, "PATCH", { action: "dismiss" }),
      { params: Promise.resolve({ projectId: project.id, issueId: warning.id }) },
    );
    expect(dismissed.status).toBe(200);
    expect((await dismissed.json()).issue.status).toBe("dismissed");

    const denied = await routes.issue.PATCH(
      request(`http://local/api/projects/${project.id}/validation/${blocking.id}`, "PATCH", { action: "dismiss" }),
      { params: Promise.resolve({ projectId: project.id, issueId: blocking.id }) },
    );
    expect(denied.status).toBe(400);
    expect(ErrorResponseSchema.parse(await denied.json()).error.code).toBe("VALIDATION");
  });
});
