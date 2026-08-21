import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository } from "@/lib/authoring/repository";
import { getProjectGenerationMetrics } from "@/lib/authoring/metrics";

let tempDir: string;
let dbPath: string;
let backupDir: string;
let originalInputPrice: string | undefined;
let originalOutputPrice: string | undefined;
const repos: AuthoringRepository[] = [];

describe("authoring generation metrics", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-metrics-"));
    dbPath = path.join(tempDir, "authoring.sqlite");
    backupDir = path.join(tempDir, "backups");
    process.env.SQLITE_DB_PATH = dbPath;
    process.env.SQLITE_BACKUP_DIR = backupDir;
    originalInputPrice = process.env.STORYFORGE_INPUT_PRICE_PER_MILLION;
    originalOutputPrice = process.env.STORYFORGE_OUTPUT_PRICE_PER_MILLION;
    delete process.env.STORYFORGE_INPUT_PRICE_PER_MILLION;
    delete process.env.STORYFORGE_OUTPUT_PRICE_PER_MILLION;
  });

  afterEach(() => {
    for (const repo of repos.splice(0)) repo.close();
    if (originalInputPrice === undefined) delete process.env.STORYFORGE_INPUT_PRICE_PER_MILLION;
    else process.env.STORYFORGE_INPUT_PRICE_PER_MILLION = originalInputPrice;
    if (originalOutputPrice === undefined) delete process.env.STORYFORGE_OUTPUT_PRICE_PER_MILLION;
    else process.env.STORYFORGE_OUTPUT_PRICE_PER_MILLION = originalOutputPrice;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads persisted calls, failures, stage latency, and percentiles after the repository is closed", async () => {
    const repo = createAuthoringRepository({ dbPath, backupDir });
    repos.push(repo);
    const project = await repo.createProject({
      title: "Metrics",
      premise: "Metrics persistence",
      genre: "test",
      tone: "clear",
      pointOfView: "first",
      rating: "PG",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const db = new Database(dbPath);
    db.prepare(`INSERT INTO generation_runs (id, project_id, version_id, stage, status, progress_current, progress_total, model, input_tokens, output_tokens, retry_count, last_error_code, last_error_message, created_at, updated_at) VALUES (?, ?, ?, 'nodes', 'completed', 2, 2, 'test', 100, 50, 1, NULL, NULL, ?, ?), (?, ?, ?, 'nodes', 'failed', 1, 2, 'test', 20, 5, 0, 'TIMEOUT', 'timed out', ?, ?)`)
      .run("run-1", project.id, project.activeDraftVersionId, "2026-08-21T00:00:00.000Z", "2026-08-21T00:00:01.000Z", "run-2", project.id, project.activeDraftVersionId, "2026-08-21T00:00:02.000Z", "2026-08-21T00:00:03.000Z");
    db.prepare(`INSERT INTO generation_steps (id, run_id, step_key, stage, status, attempt, sort_order, model, input_tokens, output_tokens, created_at, updated_at, completed_at) VALUES ('step-1', 'run-1', 'one', 'nodes', 'completed', 1, 0, 'test', 100, 50, ?, ?, ?), ('step-2', 'run-1', 'two', 'nodes', 'completed', 1, 1, 'test', 100, 50, ?, ?, ?), ('step-3', 'run-2', 'three', 'nodes', 'failed', 1, 2, 'test', 20, 5, ?, ?, NULL)`)
      .run("2026-08-21T00:00:00.000Z", "2026-08-21T00:00:01.000Z", "2026-08-21T00:00:00.400Z", "2026-08-21T00:00:00.000Z", "2026-08-21T00:00:02.000Z", "2026-08-21T00:00:01.800Z", "2026-08-21T00:00:02.000Z", "2026-08-21T00:00:03.000Z");
    db.close();
    repo.close();

    const metrics = await getProjectGenerationMetrics(project.id);

    expect(metrics).toMatchObject({ totalRuns: 2, completedRuns: 1, failedRuns: 1, totalInputTokens: 120, totalOutputTokens: 55, totalRetries: 1, totalCalls: 3, failuresByCode: { TIMEOUT: 1 }, estimatedCost: null });
    expect(metrics.stageLatencyMs.nodes.p50).toBeGreaterThan(0);
    expect(metrics.stageLatencyMs.nodes.p95).toBeGreaterThanOrEqual(metrics.stageLatencyMs.nodes.p50);
  });

  it("calculates a labeled estimate only when both token prices are configured", async () => {
    const repo = createAuthoringRepository({ dbPath, backupDir });
    repos.push(repo);
    const project = await repo.createProject({ title: "Cost", premise: "Cost", genre: "test", tone: "clear", pointOfView: "first", rating: "PG", size: { preset: "micro", targetNodes: 8, targetEndings: 2 } });
    process.env.STORYFORGE_INPUT_PRICE_PER_MILLION = "2";
    process.env.STORYFORGE_OUTPUT_PRICE_PER_MILLION = "4";

    expect((await getProjectGenerationMetrics(project.id)).estimatedCost).toBe(0);
  });
});
