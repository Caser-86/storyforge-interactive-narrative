import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { createAuthoringRepository } from "../lib/authoring/repository";
import { initializeAuthoringDatabase } from "../lib/authoring/database";
import { createInteractiveRepository } from "../lib/interactive/repository";
import { getErrorMessage } from "../lib/errors";

const SCENARIOS = [
  { sessionCount: 100, turnsPerSession: 16 },
  { sessionCount: 1_000, turnsPerSession: 40 },
] as const;

const scene = {
  title: "基准场景",
  body: "正文负载。".repeat(120),
  summary: "用于历史读取基准的场景。",
  choices: [
    { id: "choice_a", label: "调查线索", intent: "继续调查", risk: "low", consequencePreview: "获得新的线索。" },
    { id: "choice_b", label: "等待变化", intent: "观察局势", risk: "medium", consequencePreview: "局势将发生变化。" },
  ],
  isEnding: false,
  endingSummary: null,
};

function roundMilliseconds(value: number): number {
  return Math.round(value * 100) / 100;
}

function removeTemporaryDirectory(directory: string): void {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM" || attempt === 9) throw error;
      const end = Date.now() + 100;
      while (Date.now() < end) {
        // Give Windows time to release SQLite sidecar handles between retries.
      }
    }
  }
}

async function seedScenario(db: Database.Database, sessionCount: number, turnsPerSession: number): Promise<string> {
  const authoring = createAuthoringRepository({ database: db });
  try {
    const project = await authoring.createProject({
      title: `历史读取基准 ${sessionCount}/${turnsPerSession}`,
      premise: "用于测量历史列表读取成本。",
      genre: "benchmark",
      tone: "neutral",
      pointOfView: "third person",
      rating: "PG",
      size: { preset: "custom", targetNodes: Math.min(80, sessionCount), targetEndings: 2 },
    });

    const insertSession = db.prepare(
      `INSERT INTO interactive_sessions (
         id, project_id, status, turn, target_turns, state_json, current_turn_id, last_error,
         generation_token, materialized_version_id, output_budget_limit, output_budget_reserved,
         output_budget_consumed, output_budget_unknown, created_at, updated_at
       ) VALUES (?, ?, 'active', ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, 0, 0, ?, ?)`,
    );
    const insertTurn = db.prepare(
      `INSERT INTO interactive_turns (
         id, session_id, turn, scene_json, selected_choice_id, selected_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insert = db.transaction(() => {
      for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
        const sessionId = randomUUID();
        const timestamp = new Date(Date.now() + sessionIndex).toISOString();
        const currentTurnId = `${sessionId}:turn:${turnsPerSession}`;
        const state = {
          seedPrompt: "用于测量历史列表读取成本。",
          turn: turnsPerSession,
          targetTurns: turnsPerSession,
          knownFacts: Array.from({ length: 20 }, (_, index) => `事实 ${index} ${"x".repeat(40)}`),
          openThreads: ["未完成线索"],
          resolvedThreads: ["已完成线索"],
          lastChoiceImpact: "基准选择影响",
          endingReadiness: 50,
        };
        insertSession.run(sessionId, project.id, turnsPerSession, turnsPerSession, JSON.stringify(state), currentTurnId, timestamp, timestamp);
        for (let turn = 1; turn <= turnsPerSession; turn += 1) {
          const turnId = `${sessionId}:turn:${turn}`;
          insertTurn.run(turnId, sessionId, turn, JSON.stringify(scene), turn === turnsPerSession ? null : "choice_a", timestamp, timestamp);
        }
      }
    });
    insert();
    return project.id;
  } finally {
    authoring.close();
  }
}

async function runScenario(sessionCount: number, turnsPerSession: number): Promise<Record<string, number>> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-interactive-history-benchmark-"));
  const dbPath = path.join(tempDir, "authoring.sqlite");
  const backupDir = path.join(tempDir, "backups");
  let database: Database.Database | undefined;
  let interactive: ReturnType<typeof createInteractiveRepository> | undefined;
  try {
    database = initializeAuthoringDatabase({ dbPath, backupDir });
    const projectId = await seedScenario(database, sessionCount, turnsPerSession);
    database.close();
    database = undefined;

    interactive = createInteractiveRepository({ dbPath, backupDir });
    const fullListStarted = performance.now();
    const fullList = await interactive.listSessions(projectId);
    const fullListMs = performance.now() - fullListStarted;

    const firstPageStarted = performance.now();
    let page = await interactive.listSessionSummaries(projectId, { limit: 50 });
    const summaryFirstPageMs = performance.now() - firstPageStarted;
    let summaryRows = page.sessions.length;
    let summaryPages = 1;
    const summaryAllPagesStarted = performance.now();
    while (page.nextCursor) {
      page = await interactive.listSessionSummaries(projectId, { limit: 50, cursor: page.nextCursor });
      summaryRows += page.sessions.length;
      summaryPages += 1;
    }
    const summaryAllPagesMs = performance.now() - summaryAllPagesStarted + summaryFirstPageMs;

    return {
      sessionCount,
      turnsPerSession,
      fullListMs: roundMilliseconds(fullListMs),
      fullListRows: fullList.length,
      fullListEstimatedSqlStatements: 1 + (2 * fullList.length),
      summaryFirstPageMs: roundMilliseconds(summaryFirstPageMs),
      summaryAllPagesMs: roundMilliseconds(summaryAllPagesMs),
      summaryRows,
      summaryPages,
      summaryEstimatedSqlStatements: summaryPages,
    };
  } finally {
    interactive?.close();
    if (database?.open) database.close();
    removeTemporaryDirectory(tempDir);
  }
}

async function benchmark(): Promise<void> {
  const results = [];
  for (const scenario of SCENARIOS) {
    results.push(await runScenario(scenario.sessionCount, scenario.turnsPerSession));
  }
  console.log(JSON.stringify({ benchmark: "interactive-history@1", results }, null, 2));
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun()) {
  benchmark().catch((error) => {
    console.error(getErrorMessage(error));
    process.exit(1);
  });
}
