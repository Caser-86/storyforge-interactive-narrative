import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { ErrorResponseSchema } from "@/lib/authoring/api-contracts";
import { renderStandaloneHtml } from "@/lib/authoring/export-html";
import type { ExportStory } from "@/lib/authoring/export-html";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import type { StoryGraph } from "@/lib/authoring/schemas";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

type ProjectContext = { params: Promise<{ projectId: string }> };

const BASE_STORY: ExportStory = {
  snapshot: {
    id: "snapshot-1",
    projectId: "project-1",
    versionNumber: 7,
    createdAt: "2026-08-19T00:00:00.000Z",
    sealedAt: "2026-08-19T00:01:00.000Z",
  },
  graph: {
    versionId: "snapshot-1",
    chapters: [
      {
        id: "chapter-1",
        ordinal: 0,
        title: "The Brass Orchard",
        summary: "A compact branching story.",
      },
    ],
    nodes: [
      {
        id: "node-start",
        chapterId: "chapter-1",
        nodeKey: "start",
        kind: "start",
        title: "At the Gate",
        body: "You reach the orchard gate.",
        summary: "The story begins.",
      },
      {
        id: "node-left",
        chapterId: "chapter-1",
        nodeKey: "left",
        kind: "scene",
        title: "Moonlit Rows",
        body: "The trees tick in the blue light.",
        summary: "The quiet route.",
      },
      {
        id: "node-ending-a",
        chapterId: "chapter-1",
        nodeKey: "ending-a",
        kind: "ending",
        title: "Lantern Kept",
        body: "You keep the lantern burning.",
        summary: "A hopeful ending.",
      },
      {
        id: "node-ending-b",
        chapterId: "chapter-1",
        nodeKey: "ending-b",
        kind: "ending",
        title: "Lantern Shared",
        body: "You share the lantern with the city.",
        summary: "A generous ending.",
      },
    ],
    edges: [
      {
        id: "edge-start-left",
        sourceNodeId: "node-start",
        targetNodeId: "node-left",
        label: "Walk between the trees",
        branchType: "main",
        sortOrder: 0,
      },
      {
        id: "edge-start-ending-b",
        sourceNodeId: "node-start",
        targetNodeId: "node-ending-b",
        label: "Return to the city",
        branchType: "side",
        sortOrder: 1,
      },
      {
        id: "edge-left-ending-a",
        sourceNodeId: "node-left",
        targetNodeId: "node-ending-a",
        label: "Light the lantern",
        branchType: "main",
        sortOrder: 0,
      },
    ],
  },
};

function exportFixture(overrides: Partial<ExportStory> = {}): ExportStory {
  return {
    snapshot: {
      ...BASE_STORY.snapshot,
      ...overrides.snapshot,
    },
    graph: {
      ...BASE_STORY.graph,
      ...overrides.graph,
      chapters: overrides.graph?.chapters ?? BASE_STORY.graph.chapters,
      nodes: overrides.graph?.nodes ?? BASE_STORY.graph.nodes,
      edges: overrides.graph?.edges ?? BASE_STORY.graph.edges,
    },
  };
}

let tempDir: string;
let originalSqliteDbPath: string | undefined;
let originalSqliteBackupDir: string | undefined;
let repos: AuthoringRepository[] = [];

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

function request(url: string, method: string): Request {
  return new Request(url, { method });
}

function graphForVersion(versionId: string): StoryGraph {
  const source = validReleaseGraph();
  const chapterIdBySource = new Map<string, string>();
  const nodeIdBySource = new Map<string, string>();
  const chapters = source.chapters.map((chapter, index) => {
    const id = `${versionId}-chapter-${index}`;
    chapterIdBySource.set(chapter.id, id);

    return {
      ...chapter,
      id,
      versionId,
      goal: "SECRET_GOAL",
    };
  });
  const nodes = source.nodes.map((node, index) => {
    const id = `${versionId}-node-${index}`;
    nodeIdBySource.set(node.id, id);

    return {
      ...node,
      id,
      versionId,
      chapterId: chapterIdBySource.get(node.chapterId) ?? chapters[0].id,
      objective: "SECRET_OBJECTIVE",
    };
  });
  const edges = source.edges.map((edge, index) => ({
    ...edge,
    id: `${versionId}-edge-${index}`,
    versionId,
    sourceNodeId: nodeIdBySource.get(edge.sourceNodeId) ?? edge.sourceNodeId,
    targetNodeId: nodeIdBySource.get(edge.targetNodeId) ?? edge.targetNodeId,
    intent: "SECRET_INTENT",
    consequenceSummary: "SECRET_CONSEQUENCE",
  }));

  return {
    versionId,
    chapters,
    nodes,
    edges,
  };
}

async function createProjectWithSnapshot() {
  const repo = createRepo();
  const project = await repo.createProject(fixtureProjectInput());
  const graph = graphForVersion(project.activeDraftVersionId!);
  await repo.replaceDraftGraph(project.id, graph, 0);
  const snapshot = await repo.createSnapshot(project.id);

  return { project, snapshot };
}

async function importExportRoute() {
  return import("@/app/api/projects/[projectId]/export/html/route");
}

describe("renderStandaloneHtml", () => {
  it("escapes script text and excludes private fields", () => {
    const unsafeNode = {
      ...BASE_STORY.graph.nodes[0],
      body: "</script><script>alert(1)</script>",
      objective: "OPENAI_API_KEY",
      raw_response: "raw_response",
      canonJson: "author-only canon",
    };
    const html = renderStandaloneHtml(
      exportFixture({
        graph: {
          ...BASE_STORY.graph,
          nodes: [unsafeNode, ...BASE_STORY.graph.nodes.slice(1)] as ExportStory["graph"]["nodes"],
        },
      }),
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("raw_response");
    expect(html).not.toContain("author-only canon");
  });

  it("contains no remote resource or fetch call", () => {
    const html = renderStandaloneHtml(exportFixture());

    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("fetch(");
  });

  it("escapes line separator characters in embedded JSON", () => {
    const html = renderStandaloneHtml(
      exportFixture({
        graph: {
          ...BASE_STORY.graph,
          nodes: [
            {
              ...BASE_STORY.graph.nodes[0],
              body: "Line one\u2028Line two\u2029Line three",
            },
            ...BASE_STORY.graph.nodes.slice(1),
          ],
        },
      }),
    );

    expect(html).toContain("\\u2028");
    expect(html).toContain("\\u2029");
    expect(html).not.toContain("Line one\u2028Line two\u2029Line three");
  });

  it("renders prose through textContent instead of innerHTML", () => {
    const html = renderStandaloneHtml(exportFixture());

    expect(html).toContain(".textContent");
    expect(html).not.toContain(".innerHTML");
  });

  it("namespaces progress by project id and version number", () => {
    const html = renderStandaloneHtml(exportFixture());

    expect(html).toContain("storyforge:project-1:7");
  });

  it("includes restart and one-step back controls", () => {
    const html = renderStandaloneHtml(exportFixture());

    expect(html).toContain('data-action="restart"');
    expect(html).toContain('data-action="back"');
  });

  it("rejects unsealed snapshots", () => {
    expect(() =>
      renderStandaloneHtml(
        exportFixture({
          snapshot: {
            ...BASE_STORY.snapshot,
            sealedAt: null as unknown as string,
          },
        }),
      ),
    ).toThrow(/sealed snapshot/i);
  });

  it("is deterministic for the same input", () => {
    const story = exportFixture();

    expect(renderStandaloneHtml(story)).toBe(renderStandaloneHtml(story));
  });
});

describe("authoring HTML export route", () => {
  beforeEach(() => {
    originalSqliteDbPath = process.env.SQLITE_DB_PATH;
    originalSqliteBackupDir = process.env.SQLITE_BACKUP_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-export-route-"));
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

  it("returns a self-contained HTML attachment from a sealed snapshot", async () => {
    const { project, snapshot } = await createProjectWithSnapshot();
    const route = await importExportRoute();

    const response = await route.GET(
      request(`http://local/api/projects/${project.id}/export/html?snapshotId=${snapshot.id}`, "GET"),
      projectContext(project.id),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="storyforge-/);
    expect(html).toContain("<!doctype html>");
    expect(html).not.toMatch(/SECRET_|objective|intent|consequenceSummary/);
    expect(html).not.toContain("fetch(");
  });

  it("rejects draft versions before exporting", async () => {
    const { project } = await createProjectWithSnapshot();
    const route = await importExportRoute();

    const response = await route.GET(
      request(`http://local/api/projects/${project.id}/export/html?snapshotId=${project.activeDraftVersionId}`, "GET"),
      projectContext(project.id),
    );
    const payload = ErrorResponseSchema.parse(await response.json());

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION");
  });
});
