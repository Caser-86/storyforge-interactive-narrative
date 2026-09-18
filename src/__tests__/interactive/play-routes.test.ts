import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreateProjectResponseSchema } from "@/lib/authoring/api-contracts";
import { InteractiveSessionResponseSchema } from "@/lib/interactive/api-contracts";

let tempDir: string;
let originalDbPath: string | undefined;
let originalProvider: string | undefined;

async function waitForSession(
  route: typeof import("@/app/api/projects/[projectId]/play/[sessionId]/route"),
  projectId: string,
  sessionId: string,
  predicate: (status: string, turn: number) => boolean,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await route.GET(new Request("http://local"), {
      params: Promise.resolve({ projectId, sessionId }),
    });
    const session = InteractiveSessionResponseSchema.parse(await response.json()).session;
    if (predicate(session.status, session.state.turn)) return session;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for interactive generation");
}

describe("interactive play routes", () => {
  beforeEach(() => {
    originalDbPath = process.env.SQLITE_DB_PATH;
    originalProvider = process.env.GENERATION_PROVIDER;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-play-routes-"));
    process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
    process.env.GENERATION_PROVIDER = "fake";
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = originalDbPath;
    if (originalProvider === undefined) delete process.env.GENERATION_PROVIDER;
    else process.env.GENERATION_PROVIDER = originalProvider;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a generating session immediately and completes the opening in the background", async () => {
    const projectResponse = await (await import("@/app/api/projects/route")).POST(new Request("http://local", {
      method: "POST",
      body: JSON.stringify({
        title: "异步开场测试",
        premise: "一名档案员发现一扇不该存在的门。",
        genre: "悬疑",
        tone: "克制",
        pointOfView: "第二人称",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      }),
    }));
    const project = CreateProjectResponseSchema.parse(await projectResponse.json()).project;
    const startRoute = await import("@/app/api/projects/[projectId]/play/route");
    const sessionRoute = await import("@/app/api/projects/[projectId]/play/[sessionId]/route");

    const response = await startRoute.POST(new Request("http://local", { method: "POST" }), {
      params: Promise.resolve({ projectId: project.id }),
    });
    expect(response.status).toBe(202);
    const started = InteractiveSessionResponseSchema.parse(await response.json()).session;
    expect(started.status).toBe("generating");
    expect(started.scene).toBeNull();

    const active = await waitForSession(sessionRoute, project.id, started.id, (status) => status === "active");
    expect(active.scene?.title).toBe("第 1 幕");
  });

  it("returns a generating session after a choice and completes the next scene in the background", async () => {
    const projectResponse = await (await import("@/app/api/projects/route")).POST(new Request("http://local", {
      method: "POST",
      body: JSON.stringify({
        title: "异步下一幕测试",
        premise: "一名档案员发现一扇不该存在的门。",
        genre: "悬疑",
        tone: "克制",
        pointOfView: "第二人称",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      }),
    }));
    const project = CreateProjectResponseSchema.parse(await projectResponse.json()).project;
    const startRoute = await import("@/app/api/projects/[projectId]/play/route");
    const sessionRoute = await import("@/app/api/projects/[projectId]/play/[sessionId]/route");

    const start = await startRoute.POST(new Request("http://local", { method: "POST" }), {
      params: Promise.resolve({ projectId: project.id }),
    });
    const started = InteractiveSessionResponseSchema.parse(await start.json()).session;
    const active = await waitForSession(sessionRoute, project.id, started.id, (status) => status === "active");

    const next = await sessionRoute.POST(new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ choiceId: active.scene?.choices[0]?.id, expectedTurn: active.turn }),
    }), {
      params: Promise.resolve({ projectId: project.id, sessionId: active.id }),
    });
    expect(next.status).toBe(202);
    expect(InteractiveSessionResponseSchema.parse(await next.json()).session.status).toBe("generating");

    const advanced = await waitForSession(sessionRoute, project.id, active.id, (status, turn) => status === "active" && turn === 2);
    expect(advanced.scene?.title).toBe("第 2 幕");
  });

  it("rejects a choice submitted from an older scene", async () => {
    const projectResponse = await (await import("@/app/api/projects/route")).POST(new Request("http://local", {
      method: "POST",
      body: JSON.stringify({
        title: "过期选择测试",
        premise: "一名档案员发现一扇不该存在的门。",
        genre: "悬疑",
        tone: "克制",
        pointOfView: "第二人称",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      }),
    }));
    const project = CreateProjectResponseSchema.parse(await projectResponse.json()).project;
    const startRoute = await import("@/app/api/projects/[projectId]/play/route");
    const sessionRoute = await import("@/app/api/projects/[projectId]/play/[sessionId]/route");

    const start = await startRoute.POST(new Request("http://local", { method: "POST" }), {
      params: Promise.resolve({ projectId: project.id }),
    });
    const started = InteractiveSessionResponseSchema.parse(await start.json()).session;
    const active = await waitForSession(sessionRoute, project.id, started.id, (status) => status === "active");
    const firstChoiceId = active.scene?.choices[0]?.id;
    const firstNext = await sessionRoute.POST(new Request("http://local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choiceId: firstChoiceId, expectedTurn: active.turn }),
    }), {
      params: Promise.resolve({ projectId: project.id, sessionId: active.id }),
    });
    expect(firstNext.status).toBe(202);
    await waitForSession(sessionRoute, project.id, active.id, (status, turn) => status === "active" && turn === 2);

    const stale = await sessionRoute.POST(new Request("http://local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choiceId: firstChoiceId, expectedTurn: active.turn }),
    }), {
      params: Promise.resolve({ projectId: project.id, sessionId: active.id }),
    });

    expect(stale.status).toBe(409);
    expect((await sessionRoute.GET(new Request("http://local"), {
      params: Promise.resolve({ projectId: project.id, sessionId: active.id }),
    })).status).toBe(200);
  });
});
