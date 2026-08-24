import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthoringRepository } from "@/lib/authoring/repository";
import type { AuthoringRepository, CreateProjectInput } from "@/lib/authoring/repository";
import {
  ProjectBackupV1Schema,
  ProjectBackupV2Schema,
  exportProjectBackup,
  importProjectBackup,
} from "@/lib/authoring/backup";
import { validReleaseGraph } from "@/__tests__/fixtures/authoring-graphs";

let tempDir: string;
let dbPath: string;
let backupDir: string;
let originalApiKey: string | undefined;
const repos: AuthoringRepository[] = [];

function fixtureInput(): CreateProjectInput {
  return {
    title: "潮汐档案",
    premise: "一名档案员在退潮后发现一座不该存在的城市。",
    genre: "悬疑奇幻",
    tone: "克制、潮湿、带有微光",
    pointOfView: "第三人称限知",
    rating: "PG-13",
    size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
    settingsJson: { locale: "zh-CN" },
  };
}

function repo(): AuthoringRepository {
  const value = createAuthoringRepository({ dbPath, backupDir });
  repos.push(value);
  return value;
}

async function createProjectWithGraph() {
  const project = await repo().createProject(fixtureInput());
  const sourceGraph = validReleaseGraph();
  const chapterIds = new Map(sourceGraph.chapters.map((chapter) => [chapter.id, `${project.activeDraftVersionId}-${chapter.id}`]));
  const nodeIds = new Map(sourceGraph.nodes.map((node) => [node.id, `${project.activeDraftVersionId}-${node.id}`]));
  await repo().replaceDraftGraph(
    project.id,
    {
      ...sourceGraph,
      versionId: project.activeDraftVersionId!,
      chapters: sourceGraph.chapters.map((chapter) => ({
        ...chapter,
        id: chapterIds.get(chapter.id)!,
        versionId: project.activeDraftVersionId!,
      })),
      nodes: sourceGraph.nodes.map((node) => ({
        ...node,
        id: nodeIds.get(node.id)!,
        versionId: project.activeDraftVersionId!,
        chapterId: chapterIds.get(node.chapterId)!,
      })),
      edges: sourceGraph.edges.map((edge, index) => ({
        ...edge,
        id: `${project.activeDraftVersionId}-edge-${index}`,
        versionId: project.activeDraftVersionId!,
        sourceNodeId: nodeIds.get(edge.sourceNodeId)!,
        targetNodeId: nodeIds.get(edge.targetNodeId)!,
      })),
    },
    0,
  );

  const database = new Database(dbPath);
  try {
    const graph = await repo().getProjectGraph(project.id);

    database
      .prepare(
        `INSERT INTO generation_runs (
          id, project_id, version_id, stage, status, progress_current, progress_total,
          model, input_tokens, output_tokens, retry_count, created_at, updated_at
        ) VALUES (?, ?, ?, 'nodes', 'completed', 1, 1, 'deepseek-v4-flash', 10, 20, 1, ?, ?)`,
      )
      .run("run-1", project.id, project.activeDraftVersionId, "2026-08-21T00:00:00.000Z", "2026-08-21T00:00:01.000Z");
    database
      .prepare(
        `INSERT INTO generation_steps (
          id, run_id, step_key, stage, subject_id, status, attempt, sort_order,
          model, request_json, raw_response, parsed_response_json, input_tokens,
          output_tokens, created_at, updated_at, completed_at
        ) VALUES (?, ?, 'node-1', 'nodes', ?, 'completed', 1, 0, ?, ?, ?, ?, 10, 20, ?, ?, ?)`,
      )
      .run(
        "step-1",
        "run-1",
        graph.nodes[0]!.id,
        "deepseek-v4-flash",
        JSON.stringify({ prompt: "PRIVATE_PROMPT" }),
        "PRIVATE_RAW_RESPONSE",
        JSON.stringify({ body: "Candidate body" }),
        "2026-08-21T00:00:00.000Z",
        "2026-08-21T00:00:01.000Z",
        "2026-08-21T00:00:01.000Z",
      );
    database
      .prepare(
        `INSERT INTO generation_candidates (
          id, project_id, version_id, run_id, step_id, node_id, base_content_revision,
          status, candidate_body, model, raw_response, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?, ?, ?)`,
      )
      .run(
        "candidate-1",
        project.id,
        project.activeDraftVersionId,
        "run-1",
        "step-1",
        graph.nodes[0]!.id,
        "Candidate body",
        "deepseek-v4-flash",
        "PRIVATE_CANDIDATE_RESPONSE",
        "2026-08-21T00:00:00.000Z",
      );
    const interactiveState = {
      seedPrompt: project.premise,
      turn: 2,
      targetTurns: 8,
      knownFacts: ["门后的记录"],
      openThreads: ["门后的真相"],
      resolvedThreads: [],
      lastChoiceImpact: "调查方向发生了变化。",
      endingReadiness: 20,
    };
    const interactiveScene = {
      title: "门前",
      body: "你站在门前。",
      summary: "你必须做出决定。",
      choices: [
        { id: "choice_a", label: "推门进入", intent: "确认门后的记录", risk: "medium", consequencePreview: "你会立即看到线索。" },
        { id: "choice_b", label: "先行调查", intent: "寻找更安全的入口", risk: "low", consequencePreview: "你会获得额外信息。" },
      ],
      isEnding: false,
      endingSummary: null,
    };
    database
      .prepare(
        `INSERT INTO interactive_sessions (
          id, project_id, status, turn, target_turns, state_json, current_turn_id, last_error, created_at, updated_at
        ) VALUES (?, ?, 'active', 2, 8, ?, ?, NULL, ?, ?)`,
      )
      .run(
        "interactive-session-1",
        project.id,
        JSON.stringify(interactiveState),
        "interactive-turn-2",
        "2026-08-21T00:00:00.000Z",
        "2026-08-21T00:00:02.000Z",
      );
    database
      .prepare(
        `INSERT INTO interactive_turns (
          id, session_id, turn, scene_json, selected_choice_id, selected_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "interactive-turn-1",
        "interactive-session-1",
        1,
        JSON.stringify(interactiveScene),
        "choice_a",
        "2026-08-21T00:00:01.000Z",
        "2026-08-21T00:00:00.000Z",
      );
    database
      .prepare(
        `INSERT INTO interactive_turns (
          id, session_id, turn, scene_json, selected_choice_id, selected_at, created_at
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .run(
        "interactive-turn-2",
        "interactive-session-1",
        2,
        JSON.stringify(interactiveScene),
        "2026-08-21T00:00:02.000Z",
      );
  } finally {
    database.close();
  }

  return project;
}

describe("authoring project backup", () => {
  beforeEach(() => {
    originalApiKey = process.env.OPENAI_API_KEY;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-backup-"));
    dbPath = path.join(tempDir, "authoring.sqlite");
    backupDir = path.join(tempDir, "backups");
  });

  afterEach(() => {
    for (const value of repos.splice(0)) value.close();
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("round-trips graph and generation metadata into a new project identity", async () => {
    const project = await createProjectWithGraph();
    process.env.OPENAI_API_KEY = "SECRET_API_KEY";

    const backup = await exportProjectBackup(project.id, { dbPath, backupDir });
    const parsed = ProjectBackupV2Schema.parse(backup);
    const imported = await importProjectBackup(parsed, "new-id", { dbPath, backupDir });

    expect(imported.id).not.toBe(project.id);
    expect(imported.title).toBe(project.title);
    expect(JSON.stringify(parsed)).not.toContain("SECRET_API_KEY");
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE_PROMPT");
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE_RAW_RESPONSE");
    expect((await repo().getProjectGraph(imported.id)).nodes).toHaveLength(8);

    const database = new Database(dbPath, { readonly: true });
    try {
      expect(database.prepare("SELECT COUNT(*) AS count FROM generation_runs WHERE project_id = ?").get(imported.id)).toEqual({ count: 1 });
      expect(database.prepare("SELECT COUNT(*) AS count FROM generation_steps WHERE run_id = 'run-1'").get()).toEqual({ count: 1 });
      expect(database.prepare("SELECT COUNT(*) AS count FROM interactive_sessions WHERE project_id = ?").get(imported.id)).toEqual({ count: 1 });
      expect(database.prepare("SELECT COUNT(*) AS count FROM interactive_turns WHERE session_id IN (SELECT id FROM interactive_sessions WHERE project_id = ?)").get(imported.id)).toEqual({ count: 2 });
    } finally {
      database.close();
    }
  });

  it("replaces an existing project only after the complete backup validates", async () => {
    const project = await createProjectWithGraph();
    const backup = await exportProjectBackup(project.id, { dbPath, backupDir });
    await repo().updateProject(project.id, { title: "将被替换的标题" });

    const replaced = await importProjectBackup(backup, "replace", { dbPath, backupDir });

    expect(replaced.id).toBe(project.id);
    expect((await repo().getProject(project.id)).title).toBe("潮汐档案");
  });

  it("imports legacy V1 backups with empty interactive history", async () => {
    const project = await createProjectWithGraph();
    const current = await exportProjectBackup(project.id, { dbPath, backupDir });
    const { interactive: _interactive, ...legacyBase } = current;
    const legacy = ProjectBackupV1Schema.parse({
      ...legacyBase,
      schema: "storyforge-project@1",
    });

    const imported = await importProjectBackup(legacy, "new-id", { dbPath, backupDir });
    const database = new Database(dbPath, { readonly: true });
    try {
      expect(database.prepare("SELECT COUNT(*) AS count FROM interactive_sessions WHERE project_id = ?").get(imported.id)).toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it("rejects invalid documents before writing", async () => {
    const project = await createProjectWithGraph();
    const backup = await exportProjectBackup(project.id, { dbPath, backupDir });

    await expect(importProjectBackup({ ...backup, schema: "storyforge-project@3" }, "new-id", { dbPath, backupDir })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(importProjectBackup({ ...backup, nodes: [{ ...backup.nodes[0], versionId: "missing-version" }, ...backup.nodes.slice(1)] }, "new-id", { dbPath, backupDir })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(importProjectBackup({ ...backup, project: { ...backup.project, settingsJson: "x".repeat(32_001) } }, "new-id", { dbPath, backupDir })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(importProjectBackup({ ...backup, nodes: [...backup.nodes, backup.nodes[0]!] }, "replace", { dbPath, backupDir })).rejects.toMatchObject({
      code: "STORAGE",
    });
    expect((await repo().getProject(project.id)).title).toBe(project.title);

    expect((await repo().listProjects()).filter((item) => item.id !== project.id)).toHaveLength(0);
  });
});
