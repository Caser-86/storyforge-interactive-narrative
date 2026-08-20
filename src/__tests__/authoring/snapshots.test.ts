import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorResponseSchema } from "@/lib/authoring/api-contracts";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import { restoreSnapshot, sealSnapshot } from "@/lib/authoring/snapshots";
import type { StoryGraph } from "@/lib/authoring/schemas";
import { graphWithoutEnding, validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

type ProjectContext = { params: Promise<{ projectId: string }> };

let tempDir: string;
let originalSqliteDbPath: string | undefined;
let originalSqliteBackupDir: string | undefined;
let repos: AuthoringRepository[];

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

function createRepo(): AuthoringRepository {
  const repo = createAuthoringRepository();
  repos.push(repo);
  return repo;
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

async function createProjectWithGraph(graph: StoryGraph = validReleaseGraph()) {
  const repo = createRepo();
  const project = await repo.createProject(fixtureProjectInput());
  const draftGraph = graphForVersion(project.activeDraftVersionId!, graph);
  await repo.replaceDraftGraph(project.id, draftGraph, 0);

  return { project, draftGraph };
}

async function importRoutes() {
  return {
    snapshots: await import("@/app/api/projects/[projectId]/snapshots/route"),
    preview: await import("@/app/api/projects/[projectId]/preview/route"),
  };
}

describe("authoring snapshots", () => {
  beforeEach(() => {
    originalSqliteDbPath = process.env.SQLITE_DB_PATH;
    originalSqliteBackupDir = process.env.SQLITE_BACKUP_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-snapshots-"));
    process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
    process.env.SQLITE_BACKUP_DIR = path.join(tempDir, "backups");
    repos = [];
    vi.resetModules();
  });

  afterEach(() => {
    for (const repo of repos) {
      repo.close();
    }
    repos = [];
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

  it("refuses to seal a graph with blocking issues", async () => {
    const { project } = await createProjectWithGraph(graphWithoutEnding());

    expect.assertions(2);
    try {
      await sealSnapshot(project.id);
    } catch (error) {
      expect(error).toMatchObject({ code: "BLOCKING_ISSUES" });
      expect(JSON.stringify(error)).toContain("ENDING_COUNT");
    }
  });

  it("restores by copying into a new draft", async () => {
    const { project } = await createProjectWithGraph();
    const snapshot = await sealSnapshot(project.id);
    const snapshotGraphBeforeRestore = await createRepo().getProjectGraph(project.id, snapshot.id);

    const restored = await restoreSnapshot(project.id, snapshot.id);
    const restoredGraph = await createRepo().getProjectGraph(project.id, restored.id);
    const snapshotGraphAfterRestore = await createRepo().getProjectGraph(project.id, snapshot.id);
    const updatedProject = await createRepo().getProject(project.id);

    expect(restored.kind).toBe("draft");
    expect(restored.id).not.toBe(snapshot.id);
    expect(updatedProject.activeDraftVersionId).toBe(restored.id);
    expect(restoredGraph.nodes.map((node) => node.id)).not.toEqual(
      snapshotGraphBeforeRestore.nodes.map((node) => node.id),
    );
    expect(restoredGraph.edges.map((edge) => edge.id)).not.toEqual(
      snapshotGraphBeforeRestore.edges.map((edge) => edge.id),
    );
    expect(snapshotGraphAfterRestore).toEqual(snapshotGraphBeforeRestore);
  });

  it("revalidates the current draft after it changes", async () => {
    const { project, draftGraph } = await createProjectWithGraph();
    const firstSnapshot = await sealSnapshot(project.id);
    const invalidGraph = graphForVersion(project.activeDraftVersionId!, graphWithoutEnding());
    await createRepo().replaceDraftGraph(project.id, invalidGraph, 1);

    await expect(sealSnapshot(project.id)).rejects.toMatchObject({ code: "BLOCKING_ISSUES" });

    const routes = await importRoutes();
    const list = await routes.snapshots.GET(
      request(`http://local/api/projects/${project.id}/snapshots`, "GET"),
      projectContext(project.id),
    );
    const payload = await list.json();

    expect(draftGraph.versionId).toBe(project.activeDraftVersionId);
    expect(payload.snapshots.map((snapshot: { id: string }) => snapshot.id)).toEqual([firstSnapshot.id]);
  });

  it("keeps snapshots immutable for graph writes", async () => {
    const { project } = await createProjectWithGraph();
    const snapshot = await sealSnapshot(project.id);

    await expect(
      createRepo().replaceDraftGraph(project.id, { versionId: snapshot.id, chapters: [], nodes: [], edges: [] }, 1),
    ).rejects.toMatchObject({ code: "IMMUTABLE_VERSION" });
  });

  it("seals and lists snapshots through the route", async () => {
    const { project } = await createProjectWithGraph();
    const routes = await importRoutes();

    const sealed = await routes.snapshots.POST(
      request(`http://local/api/projects/${project.id}/snapshots`, "POST"),
      projectContext(project.id),
    );
    const sealPayload = await sealed.json();
    const list = await routes.snapshots.GET(
      request(`http://local/api/projects/${project.id}/snapshots`, "GET"),
      projectContext(project.id),
    );
    const listPayload = await list.json();

    expect(sealed.status).toBe(201);
    expect(sealPayload.snapshot.kind).toBe("snapshot");
    expect(sealPayload.snapshot.status).toBe("valid");
    expect(listPayload.snapshots.map((snapshot: { id: string }) => snapshot.id)).toEqual([sealPayload.snapshot.id]);
  });

  it("returns reader-safe preview payloads and rejects drafts", async () => {
    const graph = validReleaseGraph();
    graph.chapters[0] = { ...graph.chapters[0], goal: "SECRET_GOAL" };
    graph.nodes[0] = { ...graph.nodes[0], objective: "SECRET_OBJECTIVE" };
    graph.edges[0] = {
      ...graph.edges[0],
      intent: "SECRET_INTENT",
      consequenceSummary: "SECRET_CONSEQUENCE",
    };
    const { project } = await createProjectWithGraph(graph);
    const snapshot = await sealSnapshot(project.id);
    const routes = await importRoutes();

    const preview = await routes.preview.POST(
      request(`http://local/api/projects/${project.id}/preview`, "POST", { snapshotId: snapshot.id }),
      projectContext(project.id),
    );
    const previewPayload = await preview.json();
    const draftPreview = await routes.preview.POST(
      request(`http://local/api/projects/${project.id}/preview`, "POST", {
        versionId: project.activeDraftVersionId,
      }),
      projectContext(project.id),
    );

    expect(preview.status).toBe(200);
    expect(JSON.stringify(previewPayload)).not.toMatch(/SECRET_/);
    expect(previewPayload.graph.nodes[0]).not.toHaveProperty("objective");
    expect(previewPayload.graph.nodes[0]).not.toHaveProperty("contentStatus");
    expect(previewPayload.graph.edges[0]).not.toHaveProperty("intent");
    expect(previewPayload.runtime).toEqual({
      currentNodeId: expect.any(String),
      nodePath: [],
      edgePath: [],
      isEnding: false,
    });
    expect(draftPreview.status).toBe(400);
    expect(ErrorResponseSchema.parse(await draftPreview.json()).error.code).toBe("VALIDATION");
  });

  it("uses the limits frozen at sealing instead of mutable project targets", async () => {
    const repo = createRepo();
    const project = await repo.createProject(
      fixtureProjectInput({
        size: { preset: "custom", targetNodes: 80, targetEndings: 10 },
      }),
    );
    const graph = graphForVersion(project.activeDraftVersionId!, validReleaseGraph());
    const mergeNode = graph.nodes.find((node) => node.nodeKey === "merge")!;
    const keeperEnding = graph.nodes.find((node) => node.nodeKey === "keeper-ending")!;
    const extraNode = {
      ...mergeNode,
      id: `${graph.versionId}-node-extra`,
      nodeKey: "extra",
      kind: "scene" as const,
      title: "Extra Scene",
      body: "A final scene preserves the historical release size.",
      summary: "The story has one more scene than the new project target.",
      objective: "Resolve the last clue.",
      topologicalRank: 4,
    };
    const graphWithExtraNode: StoryGraph = {
      ...graph,
      nodes: [...graph.nodes, extraNode],
      edges: graph.edges.map((edge) =>
        edge.targetNodeId === keeperEnding.id ? { ...edge, targetNodeId: extraNode.id } : edge,
      ).concat({
        ...graph.edges.find((edge) => edge.targetNodeId === keeperEnding.id)!,
        id: `${graph.versionId}-edge-extra-keeper`,
        sourceNodeId: extraNode.id,
        targetNodeId: keeperEnding.id,
      }),
    };

    await repo.replaceDraftGraph(project.id, graphWithExtraNode, 0);
    const snapshot = await sealSnapshot(project.id);
    await repo.updateProject(project.id, {
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    const routes = await importRoutes();
    const preview = await routes.preview.POST(
      request(`http://local/api/projects/${project.id}/preview`, "POST", { snapshotId: snapshot.id }),
      projectContext(project.id),
    );

    expect(preview.status).toBe(200);
  });
});
