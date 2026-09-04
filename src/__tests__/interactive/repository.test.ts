import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository, type AuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository, type InteractiveRepository } from "@/lib/interactive/repository";
import type { InteractiveScene, InteractiveState } from "@/lib/interactive/schemas";

let tempDir: string;
let authoring: AuthoringRepository;
let interactive: InteractiveRepository;

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

const opening: InteractiveScene = {
  title: "门前",
  body: "林缇站在门前。",
  summary: "她必须做出决定。",
  choices: [
    { id: "choice_a", label: "推门进入", intent: "确认门后的记录", risk: "medium", consequencePreview: "你会立即看到线索。" },
    { id: "choice_b", label: "先行调查", intent: "寻找更安全的入口", risk: "low", consequencePreview: "你会获得额外信息。" },
  ],
  isEnding: false,
  endingSummary: null,
};

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-interactive-"));
  const options = { dbPath: path.join(tempDir, "authoring.sqlite"), backupDir: path.join(tempDir, "backups") };
  authoring = createAuthoringRepository(options);
  interactive = createInteractiveRepository(options);
});

afterEach(() => {
  interactive.close();
  authoring.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("interactive repository", () => {
  it("advances one selected choice at a time", async () => {
    const project = await authoring.createProject({
      title: "互动测试",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    const created = await interactive.createSession(project.id, state);
    expect(created.status).toBe("generating");
    expect(created.scene).toBeNull();

    const active = await interactive.saveInitialScene(created.id, opening, state);
    expect(active.status).toBe("active");
    expect(active.turn).toBe(1);

    const claimed = await interactive.claimChoice(project.id, created.id, "choice_a");
    expect(claimed.choice.label).toBe("推门进入");

    const next = await interactive.saveNextScene(created.id, claimed, {
      ...opening,
      title: "门后",
      body: "门后亮起一排档案柜。",
    }, { ...state, turn: 2 });

    expect(next.status).toBe("active");
    expect(next.turn).toBe(2);
    expect(next.scene?.title).toBe("门后");

    const history = await interactive.listTurns(project.id, created.id);
    expect(history).toHaveLength(2);
    expect(history[0]?.selectedChoiceLabel).toBe("推门进入");
    expect(history[1]?.selectedChoiceLabel).toBeNull();
  });

  it("releases a stale next-scene generation so the choice can be retried", async () => {
    const project = await authoring.createProject({
      title: "互动恢复测试",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    const created = await interactive.createSession(project.id, state);
    await interactive.saveInitialScene(created.id, opening, state);
    const firstClaim = await interactive.claimChoice(project.id, created.id, "choice_a");

    await interactive.recoverStaleGeneration(created.id, 0);

    const recovered = await interactive.getSession(project.id, created.id);
    expect(recovered.status).toBe("active");
    await expect(interactive.claimChoice(project.id, created.id, "choice_a")).resolves.toBeDefined();
    await interactive.releaseChoice(firstClaim);
  });

  it("ignores a late save and release from an invalidated generation attempt", async () => {
    const project = await authoring.createProject({
      title: "互动竞态测试",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    const created = await interactive.createSession(project.id, state);
    await interactive.saveInitialScene(created.id, opening, state);
    const firstClaim = await interactive.claimChoice(project.id, created.id, "choice_a");
    await interactive.recoverStaleGeneration(created.id, 0);
    const secondClaim = await interactive.claimChoice(project.id, created.id, "choice_b");

    await expect(interactive.saveNextScene(created.id, firstClaim, {
      ...opening,
      title: "过期结果",
    }, { ...state, turn: 2 })).rejects.toMatchObject({ code: "CONFLICT" });
    await interactive.releaseChoice(firstClaim);

    const stillGenerating = await interactive.getSession(project.id, created.id);
    expect(stillGenerating.status).toBe("generating");
    expect(stillGenerating.scene?.title).toBe("门前");

    const next = await interactive.saveNextScene(created.id, secondClaim, {
      ...opening,
      title: "有效结果",
    }, { ...state, turn: 2 });
    expect(next.scene?.title).toBe("有效结果");
    expect((await interactive.listTurns(project.id, created.id))[0]?.selectedChoiceLabel).toBe("先行调查");
  });

  it("lists sessions by recent activity and deletes only project-owned history", async () => {
    const project = await authoring.createProject({
      title: "互动记录测试",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const otherProject = await authoring.createProject({
      title: "另一项目",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    const older = await interactive.createSession(project.id, state);
    const newest = await interactive.createSession(project.id, state);
    await interactive.saveInitialScene(newest.id, opening, state);

    const sessions = await interactive.listSessions(project.id);
    expect(sessions[0]?.id).toBe(newest.id);
    expect(sessions.map((session) => session.id)).toContain(older.id);
    await expect(interactive.deleteSession(otherProject.id, newest.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await interactive.deleteSession(project.id, newest.id);
    await expect(interactive.getSession(project.id, newest.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await interactive.listSessions(project.id)).map((session) => session.id)).toEqual([older.id]);
  });
});
