import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthoringError } from "@/lib/authoring/errors";
import { runAuthoringMigrations } from "@/lib/authoring/database";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import type { Chapter, StoryEdge, StoryGraph, StoryNode } from "@/lib/authoring/schemas";

let tempDir: string;
let dbPath: string;
let backupDir: string;
let repos: AuthoringRepository[];

function fixtureBrief(overrides: Partial<CreateProjectInput> = {}): CreateProjectInput {
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
      flags: ["offline", null, { preserveTone: true }],
    },
    ...overrides,
  };
}

function now(): string {
  return "2026-08-19T00:00:00.000Z";
}

function chapter(id: string, versionId: string, overrides: Partial<Chapter> = {}): Chapter {
  return {
    id,
    versionId,
    ordinal: 0,
    title: "Arrival",
    goal: "Find the hidden orchard.",
    summary: "The protagonist reaches the sealed gate.",
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function node(id: string, versionId: string, chapterId: string, overrides: Partial<StoryNode> = {}): StoryNode {
  return {
    id,
    versionId,
    chapterId,
    nodeKey: id,
    kind: "scene",
    title: "At the Gate",
    body: "Brass vines shift around the lock.",
    summary: "The gate responds to the courier.",
    objective: "Choose an entry plan.",
    topologicalRank: 0,
    contentStatus: "planned",
    authorModified: false,
    contentRevision: 0,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function edge(
  id: string,
  versionId: string,
  sourceNodeId: string,
  targetNodeId: string,
  overrides: Partial<StoryEdge> = {},
): StoryEdge {
  return {
    id,
    versionId,
    sourceNodeId,
    targetNodeId,
    label: "Open the lock",
    intent: "direct",
    consequenceSummary: "The gate opens quietly.",
    sortOrder: 0,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function populatedGraph(versionId: string): StoryGraph {
  const firstChapter = chapter("chapter-source", versionId);
  const startNode = node("node-source-start", versionId, firstChapter.id, {
    nodeKey: "start",
    kind: "start",
    title: "Start",
  });
  const endingNode = node("node-source-ending", versionId, firstChapter.id, {
    nodeKey: "ending",
    kind: "ending",
    title: "Ending",
    topologicalRank: 1,
  });

  return {
    versionId,
    chapters: [firstChapter],
    nodes: [startNode, endingNode],
    edges: [edge("edge-source", versionId, startNode.id, endingNode.id)],
  };
}

function createRepo(): AuthoringRepository {
  const repo = createAuthoringRepository({ dbPath, backupDir });
  repos.push(repo);
  return repo;
}

describe("authoring repository", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-authoring-"));
    dbPath = path.join(tempDir, "authoring.sqlite");
    backupDir = path.join(tempDir, "backups");
    repos = [];
  });

  afterEach(() => {
    for (const repo of repos) {
      repo.close();
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a project with one mutable draft version", async () => {
    const repo = createRepo();

    const project = await repo.createProject(fixtureBrief());
    const graph = await repo.getProjectGraph(project.id);
    const inspectionDb = new Database(dbPath);
    const versions = inspectionDb
      .prepare("SELECT kind, project_id FROM story_versions WHERE project_id = ?")
      .all(project.id);
    inspectionDb.close();

    expect(project.activeDraftVersionId).toBe(graph.versionId);
    expect(graph.nodes).toEqual([]);
    expect(versions).toEqual([{ kind: "draft", project_id: project.id }]);
  });

  it("rolls back an invalid graph replacement", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    const graph = await repo.getProjectGraph(project.id);
    const invalidGraph: StoryGraph = {
      ...graph,
      edges: [edge("broken-edge", graph.versionId, "missing-source", "missing-target")],
    };

    await expect(repo.replaceDraftGraph(project.id, invalidGraph, 0)).rejects.toThrow();

    expect((await repo.getProjectGraph(project.id)).edges).toEqual([]);
  });

  it("duplicates a project without sharing mutable row ids", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    const sourceGraph = await repo.replaceDraftGraph(project.id, populatedGraph(project.activeDraftVersionId!), 0);

    const copy = await repo.duplicateProject(project.id);
    const copiedGraph = await repo.getProjectGraph(copy.id);

    expect(copy.id).not.toBe(project.id);
    expect(copiedGraph.nodes.map((copiedNode) => copiedNode.id)).not.toEqual(
      sourceGraph.nodes.map((sourceNode) => sourceNode.id),
    );
    expect(copiedGraph.edges.map((copiedEdge) => copiedEdge.id)).not.toEqual(
      sourceGraph.edges.map((sourceEdge) => sourceEdge.id),
    );
  });

  it("runs migrations idempotently", async () => {
    runAuthoringMigrations({ dbPath, backupDir });
    runAuthoringMigrations({ dbPath, backupDir });

    const db = new Database(dbPath);
    try {
      const migrations = db.prepare("SELECT version FROM authoring_migrations ORDER BY version").all();
      const projectTables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('projects', 'story_versions')")
        .all();

      expect(migrations).toEqual([{ version: 1 }]);
      expect(projectTables).toEqual([{ name: "projects" }, { name: "story_versions" }]);
    } finally {
      db.close();
    }
  });

  it("backs up an existing database before the first non-empty authoring migration", async () => {
    const existingDb = new Database(dbPath);
    existingDb.exec("CREATE TABLE legacy_marker (id TEXT PRIMARY KEY); INSERT INTO legacy_marker (id) VALUES ('old');");
    existingDb.close();

    runAuthoringMigrations({ dbPath, backupDir });
    runAuthoringMigrations({ dbPath, backupDir });

    const backups = fs.readdirSync(backupDir).filter((fileName) => fileName.endsWith(".sqlite"));
    expect(backups).toHaveLength(1);

    const backupDb = new Database(path.join(backupDir, backups[0]), { readonly: true });
    try {
      expect(backupDb.prepare("SELECT id FROM legacy_marker").all()).toEqual([{ id: "old" }]);
      expect(
        backupDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").all(),
      ).toEqual([]);
    } finally {
      backupDb.close();
    }
  });

  it("rejects stale draft revisions", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    const graph = await repo.getProjectGraph(project.id);

    await repo.replaceDraftGraph(project.id, { ...graph, chapters: [chapter("chapter-1", graph.versionId)] }, 0);

    await expect(repo.replaceDraftGraph(project.id, graph, 0)).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<AuthoringError>);
  });

  it("rejects graph writes to snapshot versions", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    const snapshot = await repo.createSnapshot(project.id);

    await expect(
      repo.replaceDraftGraph(project.id, { versionId: snapshot.id, chapters: [], nodes: [], edges: [] }, 0),
    ).rejects.toMatchObject({
      code: "IMMUTABLE_VERSION",
    } satisfies Partial<AuthoringError>);
  });

  it("round-trips JSON metadata through projects and versions", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    const listedProject = (await repo.listProjects()).find((item) => item.id === project.id);
    const version = await repo.createSnapshot(project.id);

    expect(project.settingsJson).toEqual({
      locale: "en-US",
      flags: ["offline", null, { preserveTone: true }],
    });
    expect(listedProject?.settingsJson).toEqual(project.settingsJson);
    expect(version.briefJson).toMatchObject({
      title: "Clockwork Orchard",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
  });
});
