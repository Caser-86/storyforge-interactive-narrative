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
  const firstChapter = chapter(`${versionId}-chapter-source`, versionId);
  const startNode = node(`${versionId}-node-source-start`, versionId, firstChapter.id, {
    nodeKey: "start",
    kind: "start",
    title: "Start",
  });
  const endingNode = node(`${versionId}-node-source-ending`, versionId, firstChapter.id, {
    nodeKey: "ending",
    kind: "ending",
    title: "Ending",
    topologicalRank: 1,
  });

  return {
    versionId,
    chapters: [firstChapter],
    nodes: [startNode, endingNode],
    edges: [edge(`${versionId}-edge-source`, versionId, startNode.id, endingNode.id)],
  };
}

function graphWithoutEnding(versionId: string): StoryGraph {
  const validGraph = populatedGraph(versionId);
  const startNode = validGraph.nodes.find((item) => item.kind === "start");
  if (!startNode) {
    throw new Error("Fixture must contain a start node");
  }

  const sceneNode = node(`${versionId}-node-source-scene`, versionId, validGraph.chapters[0].id, {
    nodeKey: "scene",
    topologicalRank: 1,
    title: "Scene",
  });

  return {
    ...validGraph,
    nodes: [startNode, sceneNode],
    edges: [edge(`${versionId}-edge-source-scene`, versionId, startNode.id, sceneNode.id)],
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

  it("rejects a node chapter from another version and preserves the draft graph", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    const graph = await repo.replaceDraftGraph(project.id, populatedGraph(project.activeDraftVersionId!), 0);
    const otherProject = await repo.createProject(fixtureBrief({ title: "Other Orchard" }));
    const otherGraph = await repo.replaceDraftGraph(
      otherProject.id,
      populatedGraph(otherProject.activeDraftVersionId!),
      0,
    );
    const invalidGraph: StoryGraph = {
      ...graph,
      nodes: [{ ...graph.nodes[0], chapterId: otherGraph.chapters[0].id }, graph.nodes[1]],
    };

    await expect(repo.replaceDraftGraph(project.id, invalidGraph, 1)).rejects.toThrow();

    expect(await repo.getProjectGraph(project.id)).toEqual(graph);
  });

  it("rejects an edge endpoint from another version and preserves the draft graph", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    const graph = await repo.replaceDraftGraph(project.id, populatedGraph(project.activeDraftVersionId!), 0);
    const otherProject = await repo.createProject(fixtureBrief({ title: "Other Orchard" }));
    const otherGraph = await repo.replaceDraftGraph(
      otherProject.id,
      populatedGraph(otherProject.activeDraftVersionId!),
      0,
    );
    const invalidGraph: StoryGraph = {
      ...graph,
      edges: [{ ...graph.edges[0], sourceNodeId: otherGraph.nodes[0].id }],
    };

    await expect(repo.replaceDraftGraph(project.id, invalidGraph, 1)).rejects.toThrow();

    expect(await repo.getProjectGraph(project.id)).toEqual(graph);
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

      expect(migrations).toEqual([{ version: 1 }, { version: 2 }]);
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

  it("enforces scoped authoring foreign keys and enables SQLite foreign keys", () => {
    runAuthoringMigrations({ dbPath, backupDir });
    const db = new Database(dbPath);

    try {
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);

      const foreignKeys = (tableName: string) =>
        db
          .prepare(`PRAGMA foreign_key_list(${tableName})`)
          .all() as { id: number; seq: number; table: string; from: string; to: string }[];
      const scopedForeignKey = (tableName: string, parentTable: string) =>
        foreignKeys(tableName)
          .filter((foreignKey) => foreignKey.table === parentTable)
          .map((foreignKey) => [foreignKey.from, foreignKey.to])
          .sort((left, right) => left.join(".").localeCompare(right.join(".")));

      expect(scopedForeignKey("projects", "story_versions")).toEqual([
        ["active_draft_version_id", "id"],
        ["id", "project_id"],
      ]);
      expect(scopedForeignKey("story_nodes", "chapters")).toEqual([
        ["chapter_id", "id"],
        ["version_id", "version_id"],
      ]);
      expect(scopedForeignKey("story_edges", "story_nodes")).toEqual([
        ["source_node_id", "id"],
        ["target_node_id", "id"],
        ["version_id", "version_id"],
        ["version_id", "version_id"],
      ]);
    } finally {
      db.close();
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
    await repo.replaceDraftGraph(project.id, populatedGraph(project.activeDraftVersionId!), 0);
    const snapshot = await repo.createSnapshot(project.id);

    await expect(
      repo.replaceDraftGraph(project.id, { versionId: snapshot.id, chapters: [], nodes: [], edges: [] }, 0),
    ).rejects.toMatchObject({
      code: "IMMUTABLE_VERSION",
    } satisfies Partial<AuthoringError>);
  });

  it("rejects blocking draft graphs before creating a facade snapshot", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    const graph = graphWithoutEnding(project.activeDraftVersionId!);

    await repo.replaceDraftGraph(project.id, graph, 0);

    await expect(repo.createSnapshot(project.id)).rejects.toMatchObject({
      code: "BLOCKING_ISSUES",
    } satisfies Partial<AuthoringError>);

    const db = new Database(dbPath, { readonly: true });
    try {
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM story_versions WHERE project_id = ? AND kind = 'snapshot'").get(
          project.id,
        ),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("creates valid snapshots through the repository facade", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    await repo.replaceDraftGraph(project.id, populatedGraph(project.activeDraftVersionId!), 0);

    const snapshot = await repo.createSnapshot(project.id);

    expect(snapshot).toMatchObject({
      kind: "snapshot",
      status: "valid",
      sourceVersionId: project.activeDraftVersionId,
    });
  });

  it("preserves historical snapshot metadata when restoring through the repository facade", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    await repo.replaceDraftGraph(project.id, populatedGraph(project.activeDraftVersionId!), 0);
    const snapshot = await repo.createSnapshot(project.id);
    const db = new Database(dbPath);

    try {
      const metadataBefore = db
        .prepare(
          `
            SELECT id, project_id, version_number, kind, source_version_id, status,
                   brief_json, story_bible_json, outline_json, canon_json, draft_revision,
                   created_at, sealed_at
            FROM story_versions
            WHERE id = ?
          `,
        )
        .get(snapshot.id);

      const restored = await repo.restoreSnapshot(project.id, snapshot.id);
      const metadataAfter = db
        .prepare(
          `
            SELECT id, project_id, version_number, kind, source_version_id, status,
                   brief_json, story_bible_json, outline_json, canon_json, draft_revision,
                   created_at, sealed_at
            FROM story_versions
            WHERE id = ?
          `,
        )
        .get(snapshot.id);

      expect(restored.sourceVersionId).toBe(snapshot.id);
      expect(metadataAfter).toEqual(metadataBefore);
    } finally {
      db.close();
    }
  });

  it("round-trips JSON metadata through projects and versions", async () => {
    const repo = createRepo();
    const project = await repo.createProject(fixtureBrief());
    await repo.replaceDraftGraph(project.id, populatedGraph(project.activeDraftVersionId!), 0);
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
