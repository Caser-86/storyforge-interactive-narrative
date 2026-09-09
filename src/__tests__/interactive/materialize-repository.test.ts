import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository, type AuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository, type InteractiveRepository } from "@/lib/interactive/repository";
import { materializeInteractivePath } from "@/lib/interactive/materialize";
import type { InteractiveScene, InteractiveState } from "@/lib/interactive/schemas";

let tempDir: string;
let authoring: AuthoringRepository;
let interactive: InteractiveRepository;

const state: InteractiveState = {
  seedPrompt: "一名档案员发现一扇不该存在的门。",
  turn: 1,
  targetTurns: 3,
  knownFacts: [],
  openThreads: [],
  resolvedThreads: [],
  lastChoiceImpact: "",
  endingReadiness: 0,
};

const activeScene: InteractiveScene = {
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

const endingScene: InteractiveScene = {
  title: "收束",
  body: "所有线索合拢。",
  summary: "真相已经完整。",
  choices: [],
  isEnding: true,
  endingSummary: "故事结束。",
};

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-materialize-"));
  const options = { dbPath: path.join(tempDir, "authoring.sqlite"), backupDir: path.join(tempDir, "backups") };
  authoring = createAuthoringRepository(options);
  interactive = createInteractiveRepository(options);
});

afterEach(() => {
  interactive.close();
  authoring.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function createEndedSession(projectId: string): Promise<string> {
  const created = await interactive.createSession(projectId, state);
  await interactive.saveInitialScene(created.id, activeScene, state);
  const firstClaim = await interactive.claimChoice(projectId, created.id, "choice_a", 1);
  await interactive.saveNextScene(created.id, firstClaim, { ...activeScene, title: "门后" }, { ...state, turn: 2 });
  const secondClaim = await interactive.claimChoice(projectId, created.id, "choice_b", 2);
  await interactive.saveNextScene(created.id, secondClaim, endingScene, { ...state, turn: 3 });
  return created.id;
}

describe("interactive draft materialization", () => {
  it("creates a new reviewable draft, preserves the source, and is idempotent", async () => {
    const project = await authoring.createProject({
      title: "分支写作测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const sourceVersionId = project.activeDraftVersionId!;
    const sessionId = await createEndedSession(project.id);
    const turns = await interactive.listTurns(project.id, sessionId);
    const graph = materializeInteractivePath({ versionId: "pending", projectTitle: project.title, turns });

    const first = await authoring.materializeInteractiveDraft(project.id, sessionId, graph);
    expect(first.created).toBe(true);
    expect(first.version.status).toBe("review_required");
    expect(first.version.sourceVersionId).toBe(sourceVersionId);
    expect(first.project.activeDraftVersionId).toBe(first.version.id);
    expect(first.graph.versionId).toBe(first.version.id);
    expect(first.graph.nodes).toHaveLength(3);
    await expect(authoring.getProjectGraph(project.id, sourceVersionId)).resolves.toEqual(expect.objectContaining({ versionId: sourceVersionId }));

    const second = await authoring.materializeInteractiveDraft(project.id, sessionId, graph);
    expect(second.created).toBe(false);
    expect(second.version.id).toBe(first.version.id);
  });

  it("rejects a session that has not reached its ending", async () => {
    const project = await authoring.createProject({
      title: "未完成落稿测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const created = await interactive.createSession(project.id, state);
    await interactive.saveInitialScene(created.id, activeScene, state);
    const turns = await interactive.listTurns(project.id, created.id);
    const graph = materializeInteractivePath({
      versionId: "pending",
      projectTitle: project.title,
      turns: [{ ...turns[0], selectedChoiceId: "choice_a", selectedChoiceLabel: "推门进入" }, { turn: 2, scene: endingScene, selectedChoiceId: null, selectedChoiceLabel: null, createdAt: "2026-08-24T00:01:00.000Z" }],
    });

    await expect(authoring.materializeInteractiveDraft(project.id, created.id, graph)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects materialization when a resized project has no room for its reserved ending", async () => {
    const project = await authoring.createProject({
      title: "预算收缩测试",
      premise: state.seedPrompt,
      genre: "悬疑",
      tone: "克制",
      pointOfView: "第二人称",
      rating: "PG-13",
      size: { preset: "custom", targetNodes: 9, targetEndings: 2 },
    });
    await createEndedSession(project.id);
    const endedSessionId = (await interactive.listSessions(project.id))[0]!.id;
    const turns = Array.from({ length: 8 }, (_, index) => ({
      turn: index + 1,
      scene: index === 7 ? endingScene : { ...activeScene, title: `第 ${index + 1} 幕` },
      selectedChoiceId: index === 7 ? null : "choice_a",
      selectedChoiceLabel: index === 7 ? null : "推门进入",
      createdAt: `2026-09-02T00:0${index}:00.000Z`,
    }));
    const graph = materializeInteractivePath({ versionId: "pending", projectTitle: project.title, turns });
    await authoring.updateProject(project.id, { size: { preset: "custom", targetNodes: 8, targetEndings: 2 } });

    await expect(authoring.materializeInteractiveDraft(project.id, endedSessionId, graph)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
