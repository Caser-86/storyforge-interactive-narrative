import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeAuthoringDatabase } from "@/lib/authoring/database";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import type { InteractiveState } from "@/lib/interactive/schemas";

let tempDir: string;
let originalDbPath: string | undefined;

const state: InteractiveState = {
  seedPrompt: "一名档案员发现一扇不该存在的门。",
  turn: 1,
  targetTurns: 8,
  knownFacts: [],
  openThreads: [],
  resolvedThreads: [],
  lastChoiceImpact: "",
  endingReadiness: 0,
};

describe("interactive session routes", () => {
  beforeEach(() => {
    originalDbPath = process.env.SQLITE_DB_PATH;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-session-routes-"));
    process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = originalDbPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists and deletes sessions only within the requested project", async () => {
    const authoring = createAuthoringRepository();
    const project = await authoring.createProject({
      title: "会话路由测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    authoring.close();
    const interactive = createInteractiveRepository();
    const session = await interactive.createSession(project.id, state);
    interactive.close();

    const listRoute = await import("@/app/api/projects/[projectId]/play/sessions/route");
    const deleteRoute = await import("@/app/api/projects/[projectId]/play/sessions/[sessionId]/route");
    const context = { params: Promise.resolve({ projectId: project.id }) };
    const listed = await listRoute.GET(new Request("http://local"), context);
    expect(listed.status).toBe(200);
    expect((await listed.json()).sessions[0].id).toBe(session.id);

    const deleted = await deleteRoute.DELETE(new Request("http://local", { method: "DELETE" }), {
      params: Promise.resolve({ projectId: project.id, sessionId: session.id }),
    });
    expect(deleted.status).toBe(204);

    const afterDelete = await listRoute.GET(new Request("http://local"), context);
    expect((await afterDelete.json()).sessions).toHaveLength(0);
  });

  it("checks project ownership before recovering a stale session", async () => {
    const authoring = createAuthoringRepository();
    const project = await authoring.createProject({
      title: "会话隔离测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const otherProject = await authoring.createProject({
      title: "另一项目",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    authoring.close();

    const interactive = createInteractiveRepository();
    const session = await interactive.createSession(project.id, state);
    interactive.close();

    const database = initializeAuthoringDatabase({ backupBeforeMigration: false });
    database
      .prepare("UPDATE interactive_sessions SET updated_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 180_000).toISOString(), session.id);
    database.close();

    const route = await import("@/app/api/projects/[projectId]/play/[sessionId]/route");
    const response = await route.GET(new Request("http://local"), {
      params: Promise.resolve({ projectId: otherProject.id, sessionId: session.id }),
    });

    expect(response.status).toBe(404);
    const untouchedRepository = createInteractiveRepository();
    const untouched = await untouchedRepository.getSession(project.id, session.id);
    untouchedRepository.close();
    expect(untouched.status).toBe("generating");
  });
});
