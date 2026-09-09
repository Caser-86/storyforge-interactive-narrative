import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthoringRepository, type AuthoringRepository } from "@/lib/authoring/repository";
import { createInteractiveRepository, type InteractiveGenerationClaim, type InteractiveRepository } from "@/lib/interactive/repository";
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

    const claimed = await interactive.claimChoice(project.id, created.id, "choice_a", 1);
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
    const firstClaim = await interactive.claimChoice(project.id, created.id, "choice_a", 1);

    await interactive.recoverStaleGeneration(created.id, 0);

    const recovered = await interactive.getSession(project.id, created.id);
    expect(recovered.status).toBe("active");
    expect(recovered.lastError).toBe("上一幕生成已超时，当前选择已恢复，可以重新选择。");
    await expect(interactive.claimChoice(project.id, created.id, "choice_a", 1)).resolves.toBeDefined();
    await interactive.releaseChoice(firstClaim);
  });

  it("persists a safe next-scene failure while releasing the choice for retry", async () => {
    const project = await authoring.createProject({
      title: "互动错误提示测试",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    const created = await interactive.createSession(project.id, state);
    await interactive.saveInitialScene(created.id, opening, state);
    const claim = await interactive.claimChoice(project.id, created.id, "choice_a", 1);
    const releaseChoice = interactive.releaseChoice.bind(interactive) as unknown as (claim: InteractiveGenerationClaim, message: string) => Promise<void>;

    await releaseChoice(claim, "下一幕生成超时，当前选择已恢复，可以重新选择。");

    await expect(interactive.getSession(project.id, created.id)).resolves.toMatchObject({
      status: "active",
      lastError: "下一幕生成超时，当前选择已恢复，可以重新选择。",
    });
    await expect(interactive.claimChoice(project.id, created.id, "choice_a", 1)).resolves.toBeDefined();
  });

  it("does not recover a generation before the long-request safety window", async () => {
    const project = await authoring.createProject({
      title: "互动长请求恢复测试",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    const created = await interactive.createSession(project.id, state);
    const createdAt = Date.parse(created.updatedAt);
    vi.setSystemTime(new Date(createdAt + 120_001));
    try {
      await interactive.recoverStaleGeneration(created.id);
      expect((await interactive.getSession(project.id, created.id)).status).toBe("generating");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a session alive while all bounded provider attempts may still be running", async () => {
    const previousTimeout = process.env.OPENAI_TIMEOUT_MS;
    process.env.OPENAI_TIMEOUT_MS = "180000";
    const project = await authoring.createProject({
      title: "互动重试窗口测试",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });

    const created = await interactive.createSession(project.id, state);
    const createdAt = Date.parse(created.updatedAt);
    vi.setSystemTime(new Date(createdAt + 300_001));
    try {
      await interactive.recoverStaleGeneration(created.id);
      expect((await interactive.getSession(project.id, created.id)).status).toBe("generating");
    } finally {
      vi.useRealTimers();
      if (previousTimeout === undefined) delete process.env.OPENAI_TIMEOUT_MS;
      else process.env.OPENAI_TIMEOUT_MS = previousTimeout;
    }
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
    const firstClaim = await interactive.claimChoice(project.id, created.id, "choice_a", 1);
    await interactive.recoverStaleGeneration(created.id, 0);
    const secondClaim = await interactive.claimChoice(project.id, created.id, "choice_b", 1);

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

  it("paginates lightweight session summaries without loading story bodies", async () => {
    const project = await authoring.createProject({
      title: "互动摘要分页测试",
      premise: state.seedPrompt,
      genre: "mystery",
      tone: "suspenseful",
      pointOfView: "third person",
      rating: "PG-13",
      size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    });
    const sessions = [
      await interactive.createSession(project.id, state),
      await interactive.createSession(project.id, state),
      await interactive.createSession(project.id, state),
    ];

    const firstPage = await interactive.listSessionSummaries(project.id, { limit: 2 });
    expect(firstPage.sessions).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(Object.keys(firstPage.sessions[0] ?? {})).toEqual([
      "id", "projectId", "status", "turn", "targetTurns", "lastError", "materializedVersionId", "createdAt", "updatedAt",
    ]);
    const readonlyDatabase = new Database(path.join(tempDir, "authoring.sqlite"), { readonly: true });
    try {
      const queryPlan = readonlyDatabase.prepare(
        `EXPLAIN QUERY PLAN
         SELECT id, project_id, status, turn, target_turns, last_error, materialized_version_id, created_at, updated_at
         FROM interactive_sessions
         WHERE project_id = ?
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
      ).all(project.id, 51) as Array<{ detail: string }>;
      expect(queryPlan.map((entry) => entry.detail).join(" ")).toContain("idx_interactive_sessions_project_updated_id");
    } finally {
      readonlyDatabase.close();
    }

    const secondPage = await interactive.listSessionSummaries(project.id, { limit: 2, cursor: firstPage.nextCursor });
    expect(secondPage.sessions).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(new Set([...firstPage.sessions, ...secondPage.sessions].map((item) => item.id))).toEqual(new Set(sessions.map((item) => item.id)));
    await expect(interactive.listSessionSummaries(project.id, { cursor: "" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
