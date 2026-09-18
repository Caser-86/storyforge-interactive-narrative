import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthorEndingUsageRepository, type AuthorEndingUsageRepository } from "@/lib/authoring/ending-usage";
import { createAuthoringRepository, type AuthoringRepository } from "@/lib/authoring/repository";
import { getProjectGenerationMetrics } from "@/lib/authoring/metrics";
import type { StoryGraph } from "@/lib/authoring/schemas";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

let tempDir: string;
let databaseOptions: { dbPath: string; backupDir: string };
let authoring: AuthoringRepository;
let usage: AuthorEndingUsageRepository;
let originalSqliteDbPath: string | undefined;
let originalSqliteBackupDir: string | undefined;

function graphForVersion(versionId: string): StoryGraph {
  const source = validReleaseGraph();
  const chapterId = `${versionId}-chapter-1`;
  const nodeIds = new Map(source.nodes.map((node, index) => [node.id, `${versionId}-node-${index}`]));
  return {
    versionId,
    chapters: source.chapters.map((chapter) => ({ ...chapter, id: chapterId, versionId })),
    nodes: source.nodes.map((node, index) => ({ ...node, id: `${versionId}-node-${index}`, versionId, chapterId })),
    edges: source.edges.map((edge, index) => ({
      ...edge,
      id: `${versionId}-edge-${index}`,
      versionId,
      sourceNodeId: nodeIds.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      targetNodeId: nodeIds.get(edge.targetNodeId) ?? edge.targetNodeId,
    })),
  };
}

beforeEach(async () => {
  originalSqliteDbPath = process.env.SQLITE_DB_PATH;
  originalSqliteBackupDir = process.env.SQLITE_BACKUP_DIR;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-ending-usage-"));
  databaseOptions = { dbPath: path.join(tempDir, "authoring.sqlite"), backupDir: path.join(tempDir, "backups") };
  process.env.SQLITE_DB_PATH = databaseOptions.dbPath;
  process.env.SQLITE_BACKUP_DIR = databaseOptions.backupDir;
  authoring = createAuthoringRepository(databaseOptions);
  usage = createAuthorEndingUsageRepository(databaseOptions);
});

afterEach(() => {
  usage.close();
  authoring.close();
  if (originalSqliteDbPath === undefined) delete process.env.SQLITE_DB_PATH;
  else process.env.SQLITE_DB_PATH = originalSqliteDbPath;
  if (originalSqliteBackupDir === undefined) delete process.env.SQLITE_BACKUP_DIR;
  else process.env.SQLITE_BACKUP_DIR = originalSqliteBackupDir;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function createFixture(): Promise<{ projectId: string; versionId: string; sourceNodeId: string }> {
  const project = await authoring.createProject({
    title: "作者结局账本",
    premise: "一个结局需要被补写。",
    genre: "悬疑",
    tone: "克制",
    pointOfView: "第三人称",
    rating: "PG-13",
    size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
  });
  const graph = await authoring.replaceDraftGraph(project.id, graphForVersion(project.activeDraftVersionId!), 0);
  const sourceNode = graph.nodes.find((node) => node.kind === "scene");
  if (!sourceNode) throw new Error("Expected a scene source node");
  return { projectId: project.id, versionId: graph.versionId, sourceNodeId: sourceNode.id };
}

describe("author ending usage ledger", () => {
  it("settles confirmed usage once and preserves unknown usage as a separate state", async () => {
    const fixture = await createFixture();
    const reservation = await usage.reserve({
      ...fixture,
      model: "deepseek-v4-flash",
      reservedOutputTokens: 3200,
    });

    await expect(usage.complete(reservation, {
      requestId: "ending-request-1",
      inputTokens: 800,
      outputTokens: 1200,
      latencyMs: 42,
    })).resolves.toBe(true);
    await expect(usage.complete(reservation, {
      requestId: "ending-request-1",
      inputTokens: 800,
      outputTokens: 1200,
      latencyMs: 42,
    })).resolves.toBe(false);

    const unknown = await usage.reserve({ ...fixture, model: "deepseek-v4-flash", reservedOutputTokens: 3200 });
    await expect(usage.complete(unknown, {
      inputTokens: 100,
      outputTokens: 200,
      latencyMs: 7,
      usageConfirmed: false,
    })).resolves.toBe(true);

    expect(await usage.listForProject(fixture.projectId)).toMatchObject([
      { status: "succeeded", inputTokens: 800, outputTokens: 1200, requestId: "ending-request-1" },
      { status: "unknown", inputTokens: null, outputTokens: null, reservedOutputTokens: 3200, errorCode: "USAGE_UNKNOWN" },
    ]);
  });

  it("redacts provider credentials from failed metadata", async () => {
    const fixture = await createFixture();
    const reservation = await usage.reserve({ ...fixture, model: "doubao-seed-evolving", reservedOutputTokens: 2400 });

    await expect(usage.fail(reservation, {
      code: "AUTH",
      message: "invalid credential ark-live-secret-value",
    })).resolves.toBe(true);

    const [record] = await usage.listForProject(fixture.projectId);
    expect(record?.status).toBe("failed");
    expect(record?.errorMessage).not.toContain("ark-live-secret-value");
    expect(record?.errorMessage).toContain("ark-[redacted]");
  });

  it("reconciles a crashed call after the bounded stale window", async () => {
    const fixture = await createFixture();
    await usage.reserve({
      ...fixture,
      model: "deepseek-v4-flash",
      reservedOutputTokens: 2400,
      now: new Date("2020-01-01T00:00:00.000Z"),
    });

    const metrics = await getProjectGenerationMetrics(fixture.projectId);
    expect(metrics.authorEndingUsage).toMatchObject({ totalCalls: 1, unknownCalls: 1, reservedCalls: 0, unknownOutputTokens: 2400 });
    expect(metrics.failuresByCode.LEASE_EXPIRED).toBe(1);
  });
});
