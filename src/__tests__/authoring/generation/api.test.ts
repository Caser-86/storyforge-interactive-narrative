import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GenerationListResponseSchema,
  GenerationNextResponseSchema,
  GenerationResponseSchema,
  GenerationStatusResponseSchema,
} from "@/lib/authoring/generation/api-contracts";
import { CreateProjectResponseSchema } from "@/lib/authoring/api-contracts";
import { getProjectGenerationMetrics } from "@/lib/authoring/metrics";

type ProjectContext = { params: Promise<{ projectId: string; runId: string }> };

let tempDir: string;
let originalSqliteDbPath: string | undefined;
let originalSqliteBackupDir: string | undefined;

function request(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function projectInput() {
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

function context(projectId: string, runId: string): ProjectContext {
  return { params: Promise.resolve({ projectId, runId }) };
}

async function importRoutes() {
  return {
    projects: await import("@/app/api/projects/route"),
    collection: await import("@/app/api/projects/[projectId]/generation/route"),
    run: await import("@/app/api/projects/[projectId]/generation/[runId]/route"),
    next: await import("@/app/api/projects/[projectId]/generation/[runId]/next/route"),
  };
}

async function createProject() {
  const routes = await importRoutes();
  const response = await routes.projects.POST(request("http://local/api/projects", "POST", projectInput()));
  return CreateProjectResponseSchema.parse(await response.json()).project;
}

describe("generation control API", () => {
  beforeEach(() => {
    originalSqliteDbPath = process.env.SQLITE_DB_PATH;
    originalSqliteBackupDir = process.env.SQLITE_BACKUP_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-generation-api-"));
    process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
    process.env.SQLITE_BACKUP_DIR = path.join(tempDir, "backups");
  });

  afterEach(() => {
    if (originalSqliteDbPath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = originalSqliteDbPath;
    if (originalSqliteBackupDir === undefined) delete process.env.SQLITE_BACKUP_DIR;
    else process.env.SQLITE_BACKUP_DIR = originalSqliteBackupDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates and lists one active run per project", async () => {
    const project = await createProject();
    const routes = await importRoutes();
    const create = await routes.collection.POST(
      request(`http://local/api/projects/${project.id}/generation`, "POST", { versionId: project.activeDraftVersionId }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(create.status).toBe(201);
    const run = GenerationResponseSchema.parse(await create.json()).run;
    expect(run.status).toBe("queued");

    const conflict = await routes.collection.POST(
      request(`http://local/api/projects/${project.id}/generation`, "POST", { versionId: project.activeDraftVersionId }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    expect(conflict.status).toBe(409);

    const list = await routes.collection.GET(request("http://local/generation", "GET"), { params: Promise.resolve({ projectId: project.id }) });
    expect(GenerationListResponseSchema.parse(await list.json()).runs).toHaveLength(1);
  });

  it("leases bounded next work without returning provider payloads", async () => {
    const project = await createProject();
    const routes = await importRoutes();
    const create = await routes.collection.POST(
      request("http://local/generation", "POST", { versionId: project.activeDraftVersionId }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    const run = GenerationResponseSchema.parse(await create.json()).run;

    const next = await routes.next.POST(request("http://local/next", "POST"), context(project.id, run.id));
    expect(next.status).toBe(200);
    const payload = GenerationNextResponseSchema.parse(await next.json());
    expect(payload.leasedSteps.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(payload)).not.toContain("rawResponse");
    expect(JSON.stringify(payload)).not.toContain("parsedResponseJson");
  });

  it("supports pause, resume, cancel, and unknown run responses", async () => {
    const project = await createProject();
    const routes = await importRoutes();
    const create = await routes.collection.POST(
      request("http://local/generation", "POST", { versionId: project.activeDraftVersionId }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    const run = GenerationResponseSchema.parse(await create.json()).run;

    expect((await routes.run.PATCH(request("http://local/run", "PATCH", { action: "pause" }), context(project.id, run.id))).status).toBe(200);
    expect(GenerationStatusResponseSchema.parse(await (await routes.run.GET(request("http://local/run", "GET"), context(project.id, run.id))).json()).run.status).toBe("paused");
    expect((await routes.run.PATCH(request("http://local/run", "PATCH", { action: "resume" }), context(project.id, run.id))).status).toBe(200);
    expect((await routes.run.PATCH(request("http://local/run", "PATCH", { action: "cancel" }), context(project.id, run.id))).status).toBe(200);

    const missing = await routes.run.GET(request("http://local/run", "GET"), context(project.id, "missing-run"));
    expect(missing.status).toBe(404);
  });

  it("reads persisted run metrics", async () => {
    const project = await createProject();
    const routes = await importRoutes();
    const create = await routes.collection.POST(
      request("http://local/generation", "POST", { versionId: project.activeDraftVersionId }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    const run = GenerationResponseSchema.parse(await create.json()).run;
    await routes.run.PATCH(request("http://local/run", "PATCH", { action: "cancel" }), context(project.id, run.id));

    await expect(getProjectGenerationMetrics(project.id)).resolves.toMatchObject({
      totalRuns: 1,
      canceledRuns: 1,
      activeRuns: 0,
    });
  });
});
