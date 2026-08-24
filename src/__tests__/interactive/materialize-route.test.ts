import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository } from "@/lib/interactive/repository";
import type { InteractiveScene, InteractiveState } from "@/lib/interactive/schemas";

let tempDir: string;
let originalDbPath: string | undefined;

const state: InteractiveState = {
  seedPrompt: "一名档案员发现一扇不该存在的门。",
  turn: 1,
  targetTurns: 2,
  knownFacts: [],
  openThreads: [],
  resolvedThreads: [],
  lastChoiceImpact: "",
  endingReadiness: 0,
};

const opening: InteractiveScene = {
  title: "门前",
  body: "林缇站在门前。",
  summary: "她必须做出决定。",
  choices: [
    { id: "choice_a", label: "推门进入", intent: "确认记录", risk: "medium", consequencePreview: "你会看到线索。" },
    { id: "choice_b", label: "先行调查", intent: "寻找入口", risk: "low", consequencePreview: "你会获得信息。" },
  ],
  isEnding: false,
  endingSummary: null,
};

const ending: InteractiveScene = {
  title: "收束",
  body: "所有线索合拢。",
  summary: "真相已经完整。",
  choices: [],
  isEnding: true,
  endingSummary: "故事结束。",
};

beforeEach(() => {
  originalDbPath = process.env.SQLITE_DB_PATH;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-materialize-route-"));
  process.env.SQLITE_DB_PATH = path.join(tempDir, "authoring.sqlite");
});

afterEach(() => {
  if (originalDbPath === undefined) delete process.env.SQLITE_DB_PATH;
  else process.env.SQLITE_DB_PATH = originalDbPath;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("interactive materialize route", () => {
  it("saves a completed selected path and returns the same draft on retry", async () => {
    const authoring = createAuthoringRepository();
    const project = await authoring.createProject({
      title: "落稿路由测试",
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
    await interactive.saveInitialScene(session.id, opening, state);
    await interactive.claimChoice(project.id, session.id, "choice_a");
    await interactive.saveNextScene(session.id, ending, { ...state, turn: 2 });
    interactive.close();

    const route = await import("@/app/api/projects/[projectId]/play/[sessionId]/materialize/route");
    const context = { params: Promise.resolve({ projectId: project.id, sessionId: session.id }) };
    const first = await route.POST(new Request("http://local", { method: "POST" }), context);
    expect(first.status).toBe(201);
    const firstPayload = await first.json() as { project: { activeDraftVersionId: string }; version: { id: string; status: string }; graph: { nodes: unknown[] } };
    expect(firstPayload.version.status).toBe("review_required");
    expect(firstPayload.project.activeDraftVersionId).toBe(firstPayload.version.id);
    expect(firstPayload.graph.nodes).toHaveLength(2);

    const second = await route.POST(new Request("http://local", { method: "POST" }), context);
    expect(second.status).toBe(200);
    const secondPayload = await second.json() as { version: { id: string } };
    expect(secondPayload.version.id).toBe(firstPayload.version.id);
  });
});
