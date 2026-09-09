import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProjectResponseSchema } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository, type CreateProjectInput } from "@/lib/authoring/repository";
import { AuthorEndingGenerationResponseSchema } from "@/lib/authoring/generation/api-contracts";
import type { StoryGraph } from "@/lib/authoring/schemas";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

let tempDir: string;
let originalSqliteDbPath: string | undefined;
let originalSqliteBackupDir: string | undefined;
let originalGenerationProvider: string | undefined;
let originalOpenAIModel: string | undefined;

function request(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function projectInput(): CreateProjectInput {
  return {
    title: "Clockwork Orchard",
    premise: "A courier discovers a machine-grown forest beneath the city.",
    genre: "solarpunk mystery",
    tone: "hopeful suspense",
    pointOfView: "second person",
    rating: "PG-13",
    size: { preset: "short", targetNodes: 15, targetEndings: 4 },
  };
}

function graphForVersion(versionId: string): StoryGraph {
  const graph = validReleaseGraph();
  const chapterId = `${versionId}-chapter-1`;
  const nodeIds = new Map(graph.nodes.map((node, index) => [node.id, `${versionId}-node-${index}`]));
  const chapters = graph.chapters.map((chapter) => ({ ...chapter, id: chapterId, versionId }));
  const nodes = graph.nodes.map((node, index) => ({
    ...node,
    id: `${versionId}-node-${index}`,
    versionId,
    chapterId,
  }));
  const edges = graph.edges.map((edge, index) => ({
    ...edge,
    id: `${versionId}-edge-${index}`,
    versionId,
    sourceNodeId: nodeIds.get(edge.sourceNodeId) ?? edge.sourceNodeId,
    targetNodeId: nodeIds.get(edge.targetNodeId) ?? edge.targetNodeId,
  }));

  return { versionId, chapters, nodes, edges };
}

describe("author ending generation API", () => {
  beforeEach(() => {
    originalSqliteDbPath = process.env.SQLITE_DB_PATH;
    originalSqliteBackupDir = process.env.SQLITE_BACKUP_DIR;
    originalGenerationProvider = process.env.GENERATION_PROVIDER;
    originalOpenAIModel = process.env.OPENAI_MODEL;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-author-ending-api-"));
    process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
    process.env.SQLITE_BACKUP_DIR = path.join(tempDir, "backups");
    process.env.GENERATION_PROVIDER = "fake";
    process.env.OPENAI_MODEL = "deepseek-v4-flash";
    vi.resetModules();
  });

  afterEach(() => {
    if (originalSqliteDbPath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = originalSqliteDbPath;
    if (originalSqliteBackupDir === undefined) delete process.env.SQLITE_BACKUP_DIR;
    else process.env.SQLITE_BACKUP_DIR = originalSqliteBackupDir;
    if (originalGenerationProvider === undefined) delete process.env.GENERATION_PROVIDER;
    else process.env.GENERATION_PROVIDER = originalGenerationProvider;
    if (originalOpenAIModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalOpenAIModel;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a preview without mutating the graph and rejects stale revisions", async () => {
    const projects = await import("@/app/api/projects/route");
    const route = await import("@/app/api/projects/[projectId]/endings/generate/route");
    const project = CreateProjectResponseSchema.parse(await (await projects.POST(request("http://local/api/projects", "POST", projectInput()))).json()).project;
    const repository = createAuthoringRepository();
    const graph = graphForVersion(project.activeDraftVersionId!);
    await repository.replaceDraftGraph(project.id, graph, 0);
    repository.close();

    const response = await route.POST(
      request("http://local/generate-ending", "POST", {
        sourceNodeId: `${graph.versionId}-node-5`,
        expectedRevision: 1,
        direction: "让主角公开真相并承担代价。",
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(200);
    const payload = AuthorEndingGenerationResponseSchema.parse(await response.json());
    expect(payload.model).toBe("deepseek-v4-flash");
    expect(payload.ending.title).toContain("merge title");

    const after = createAuthoringRepository();
    expect((await after.getProjectGraph(project.id)).nodes).toHaveLength(8);
    expect(await after.getDraftRevision(project.id)).toBe(1);
    after.close();

    const stale = await route.POST(
      request("http://local/generate-ending", "POST", {
        sourceNodeId: `${graph.versionId}-node-5`,
        expectedRevision: 2,
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(stale.status).toBe(409);
  });

  it("does not generate from an ending source node", async () => {
    const projects = await import("@/app/api/projects/route");
    const route = await import("@/app/api/projects/[projectId]/endings/generate/route");
    const project = CreateProjectResponseSchema.parse(await (await projects.POST(request("http://local/api/projects", "POST", projectInput()))).json()).project;
    const repository = createAuthoringRepository();
    const graph = graphForVersion(project.activeDraftVersionId!);
    await repository.replaceDraftGraph(project.id, graph, 0);
    repository.close();

    const response = await route.POST(
      request("http://local/generate-ending", "POST", {
        sourceNodeId: `${graph.versionId}-node-6`,
        expectedRevision: 1,
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(response.status).toBe(400);
  });
});
