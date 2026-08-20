import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateProjectResponseSchema,
  ErrorResponseSchema,
  GraphWriteResponseSchema,
  ListProjectsResponseSchema,
  NodePatchResponseSchema,
  ProjectResponseSchema,
  StoryGraphResponseSchema,
} from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import type { StoryGraph } from "@/lib/authoring/schemas";
import { graphWithoutEnding, validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

type ProjectContext = { params: Promise<{ projectId: string }> };

let tempDir: string;
let originalSqliteDbPath: string | undefined;
let originalSqliteBackupDir: string | undefined;
const repos: AuthoringRepository[] = [];

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
    settingsJson: {
      locale: "en-US",
    },
    ...overrides,
  };
}

function projectContext(projectId: string): ProjectContext {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function request(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function graphForVersion(versionId: string, graph: StoryGraph = validReleaseGraph()): StoryGraph {
  const chapterIdBySource = new Map<string, string>();
  const nodeIdBySource = new Map<string, string>();
  const chapters = graph.chapters.map((chapter, index) => {
    const id = `${versionId}-chapter-${index}`;
    chapterIdBySource.set(chapter.id, id);

    return {
      ...chapter,
      id,
      versionId,
    };
  });
  const nodes = graph.nodes.map((node, index) => {
    const id = `${versionId}-node-${index}`;
    nodeIdBySource.set(node.id, id);

    return {
      ...node,
      id,
      versionId,
      chapterId: chapterIdBySource.get(node.chapterId) ?? chapters[0].id,
    };
  });
  const edges = graph.edges.map((edge, index) => ({
    ...edge,
    id: `${versionId}-edge-${index}`,
    versionId,
    sourceNodeId: nodeIdBySource.get(edge.sourceNodeId) ?? edge.sourceNodeId,
    targetNodeId: nodeIdBySource.get(edge.targetNodeId) ?? edge.targetNodeId,
  }));

  return {
    versionId,
    chapters,
    nodes,
    edges,
  };
}

async function importRoutes() {
  return {
    collection: await import("@/app/api/projects/route"),
    project: await import("@/app/api/projects/[projectId]/route"),
    duplicate: await import("@/app/api/projects/[projectId]/duplicate/route"),
    graph: await import("@/app/api/projects/[projectId]/graph/route"),
  };
}

async function createProject() {
  const routes = await importRoutes();
  const response = await routes.collection.POST(
    request("http://local/api/projects", "POST", fixtureProjectInput()),
  );

  return CreateProjectResponseSchema.parse(await response.json()).project;
}

async function putGraph(projectId: string, graph: StoryGraph, expectedRevision: number): Promise<Response> {
  const routes = await importRoutes();

  return routes.graph.PUT(
    request(`http://local/api/projects/${projectId}/graph`, "PUT", { graph, expectedRevision }),
    projectContext(projectId),
  );
}

async function createSnapshot(projectId: string) {
  const repo = createAuthoringRepository();
  repos.push(repo);

  return repo.createSnapshot(projectId);
}

describe("authoring project API routes", () => {
  beforeEach(() => {
    originalSqliteDbPath = process.env.SQLITE_DB_PATH;
    originalSqliteBackupDir = process.env.SQLITE_BACKUP_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-api-authoring-"));
    process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
    process.env.SQLITE_BACKUP_DIR = path.join(tempDir, "backups");
    repos.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    for (const repo of repos) {
      repo.close();
    }
    repos.length = 0;
    vi.resetModules();

    if (originalSqliteDbPath === undefined) {
      delete process.env.SQLITE_DB_PATH;
    } else {
      process.env.SQLITE_DB_PATH = originalSqliteDbPath;
    }

    if (originalSqliteBackupDir === undefined) {
      delete process.env.SQLITE_BACKUP_DIR;
    } else {
      process.env.SQLITE_BACKUP_DIR = originalSqliteBackupDir;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates and reads a project", async () => {
    const routes = await importRoutes();
    const create = await routes.collection.POST(
      new Request("http://local/api/projects", {
        method: "POST",
        body: JSON.stringify(fixtureProjectInput()),
      }),
    );

    expect(create.status).toBe(201);
    const project = CreateProjectResponseSchema.parse(await create.json()).project;
    expect(project.status).toBe("draft");

    const list = await routes.collection.GET();
    expect(ListProjectsResponseSchema.parse(await list.json()).projects.map((item) => item.id)).toContain(project.id);

    const read = await routes.project.GET(
      request(`http://local/api/projects/${project.id}`, "GET"),
      projectContext(project.id),
    );
    expect(ProjectResponseSchema.parse(await read.json()).project.id).toBe(project.id);
  });

  it("rejects stale graph revisions", async () => {
    const project = await createProject();
    const graph = graphForVersion(project.activeDraftVersionId!);

    const response = await putGraph(project.id, graph, 999);

    expect(response.status).toBe(409);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe("CONFLICT");
  });

  it("patches one draft node atomically and rejects a stale node revision", async () => {
    const routes = await importRoutes();
    const project = await createProject();
    const graph = graphForVersion(project.activeDraftVersionId!);
    const put = await putGraph(project.id, graph, 0);
    expect(put.status).toBe(200);

    const target = graph.nodes[0]!;
    const patched = await routes.graph.PATCH(
      request(`http://local/api/projects/${project.id}/graph`, "PATCH", {
        nodeId: target.id,
        patch: { body: "An author-edited body." },
        expectedRevision: target.contentRevision,
      }),
      projectContext(project.id),
    );
    expect(patched.status).toBe(200);
    expect(NodePatchResponseSchema.parse(await patched.json()).node).toMatchObject({
      id: target.id,
      body: "An author-edited body.",
      authorModified: true,
      contentStatus: "author_edited",
      contentRevision: 1,
    });

    const summaryPatch = await routes.graph.PATCH(
      request(`http://local/api/projects/${project.id}/graph`, "PATCH", {
        nodeId: target.id,
        patch: { summary: "The author changes the story direction." },
        expectedRevision: 1,
      }),
      projectContext(project.id),
    );
    expect(summaryPatch.status).toBe(200);

    const graphAfterImpact = await routes.graph.GET(
      request(`http://local/api/projects/${project.id}/graph`, "GET"),
      projectContext(project.id),
    );
    const parsedGraph = StoryGraphResponseSchema.parse(await graphAfterImpact.json()).graph;
    expect(parsedGraph.nodes.find((node) => node.nodeKey === "left")?.contentStatus).toBe("review_required");

    const stale = await routes.graph.PATCH(
      request(`http://local/api/projects/${project.id}/graph`, "PATCH", {
        nodeId: target.id,
        patch: { body: "Stale body." },
        expectedRevision: target.contentRevision,
      }),
      projectContext(project.id),
    );
    expect(stale.status).toBe(409);
    expect(ErrorResponseSchema.parse(await stale.json()).error.code).toBe("CONFLICT");
  });

  it("rejects malformed and unknown create input", async () => {
    const routes = await importRoutes();
    const malformed = await routes.collection.POST(
      new Request("http://local/api/projects", {
        method: "POST",
        body: "{",
      }),
    );
    const unknown = await routes.collection.POST(
      request("http://local/api/projects", "POST", {
        ...fixtureProjectInput(),
        unexpected: true,
      }),
    );

    expect(malformed.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(await malformed.json())).not.toMatch(/stack|sqlite|sql/i);
    expect(ErrorResponseSchema.parse(await unknown.json()).error.code).toBe("VALIDATION");
  });

  it("returns a stable not-found error for missing projects", async () => {
    const routes = await importRoutes();

    const response = await routes.project.GET(
      request("http://local/api/projects/missing-project", "GET"),
      projectContext("missing-project"),
    );

    expect(response.status).toBe(404);
    expect(ErrorResponseSchema.parse(await response.json())).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Project not found",
        details: { projectId: "missing-project" },
      },
    });
  });

  it("updates editable project fields and status", async () => {
    const routes = await importRoutes();
    const project = await createProject();

    const response = await routes.project.PATCH(
      request(`http://local/api/projects/${project.id}`, "PATCH", {
        title: "Clockwork Orchard Revised",
        status: "ready",
      }),
      projectContext(project.id),
    );

    expect(response.status).toBe(200);
    const updated = ProjectResponseSchema.parse(await response.json()).project;
    expect(updated.title).toBe("Clockwork Orchard Revised");
    expect(updated.status).toBe("ready");
  });

  it("duplicates and deletes projects", async () => {
    const routes = await importRoutes();
    const project = await createProject();

    const duplicate = await routes.duplicate.POST(
      request(`http://local/api/projects/${project.id}/duplicate`, "POST"),
      projectContext(project.id),
    );
    const copiedProject = CreateProjectResponseSchema.parse(await duplicate.json()).project;

    expect(duplicate.status).toBe(201);
    expect(copiedProject.id).not.toBe(project.id);
    expect(copiedProject.title).toBe("Clockwork Orchard Copy");

    const deleted = await routes.project.DELETE(
      request(`http://local/api/projects/${project.id}`, "DELETE"),
      projectContext(project.id),
    );
    expect(deleted.status).toBe(204);

    const readDeleted = await routes.project.GET(
      request(`http://local/api/projects/${project.id}`, "GET"),
      projectContext(project.id),
    );
    expect(readDeleted.status).toBe(404);
  });

  it("reads and writes graphs with validation issues in the response", async () => {
    const routes = await importRoutes();
    const project = await createProject();
    const invalidGraph = graphForVersion(project.activeDraftVersionId!, graphWithoutEnding());

    const write = await putGraph(project.id, invalidGraph, 0);
    const writePayload = GraphWriteResponseSchema.parse(await write.json());

    expect(write.status).toBe(200);
    expect(writePayload.graph.nodes).toHaveLength(invalidGraph.nodes.length);
    expect(writePayload.issues.map((issue) => issue.code)).toContain("ENDING_COUNT");

    const readActive = await routes.graph.GET(
      request(`http://local/api/projects/${project.id}/graph`, "GET"),
      projectContext(project.id),
    );
    expect(StoryGraphResponseSchema.parse(await readActive.json()).graph.versionId).toBe(project.activeDraftVersionId);

    const readByVersion = await routes.graph.GET(
      request(`http://local/api/projects/${project.id}/graph?versionId=${project.activeDraftVersionId}`, "GET"),
      projectContext(project.id),
    );
    expect(StoryGraphResponseSchema.parse(await readByVersion.json()).graph.versionId).toBe(project.activeDraftVersionId);
  });

  it("rejects graph writes to snapshot versions", async () => {
    const project = await createProject();
    const graph = graphForVersion(project.activeDraftVersionId!);
    const writeDraft = await putGraph(project.id, graph, 0);
    expect(writeDraft.status).toBe(200);

    const snapshot = await createSnapshot(project.id);
    const response = await putGraph(project.id, { versionId: snapshot.id, chapters: [], nodes: [], edges: [] }, 0);

    expect(response.status).toBe(422);
    expect(ErrorResponseSchema.parse(await response.json()).error.code).toBe("IMMUTABLE_VERSION");
  });

  it("awaits dynamic route params before reading the project id", async () => {
    const routes = await importRoutes();
    const project = await createProject();
    let resolved = false;
    const params = new Promise<{ projectId: string }>((resolve) => {
      setTimeout(() => {
        resolved = true;
        resolve({ projectId: project.id });
      }, 0);
    });

    const response = await routes.project.GET(
      request(`http://local/api/projects/${project.id}`, "GET"),
      { params },
    );

    expect(resolved).toBe(true);
    expect(ProjectResponseSchema.parse(await response.json()).project.id).toBe(project.id);
  });
});
