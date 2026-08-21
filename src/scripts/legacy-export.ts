import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { getErrorMessage } from "../lib/errors";

export interface LegacyExportOptions {
  dbPath?: string;
  outputDir?: string;
  dryRun?: boolean;
}

export interface LegacyExportResult {
  sessionCount: number;
  filesWritten: number;
  dryRun: boolean;
}

type LegacySession = {
  id: string;
  seedPrompt: string;
  genre: string | null;
  language: string | null;
  rating: string | null;
  status: string | null;
  state: unknown;
  createdAt: string | null;
  updatedAt: string | null;
  scenes: Array<Record<string, unknown>>;
};

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function tableExists(db: Database.Database, tableName: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function renderMarkdown(session: LegacySession): string {
  const lines = [`# ${session.seedPrompt}`, "", `> Genre: ${session.genre ?? "unknown"} · Language: ${session.language ?? "unknown"} · Rating: ${session.rating ?? "unknown"}`, ""];
  for (const scene of session.scenes) {
    lines.push(`## Turn ${String(scene.turn ?? "?")}: ${String(scene.title ?? "Untitled")}`, "", String(scene.body ?? ""), "");
    const choices = Array.isArray(scene.choices) ? scene.choices as Array<Record<string, unknown>> : [];
    if (choices.length > 0) {
      lines.push("### Choices", "");
      for (const choice of choices) lines.push(`- ${String(choice.label ?? "Choice")}${choice.chosen ? " [chosen]" : ""}`);
      lines.push("");
    }
  }
  const state = session.state as Record<string, unknown> | null;
  if (state?.endingSummary) lines.push("## Ending", "", String(state.endingSummary), "");
  return `${lines.join("\n")}\n`;
}

export async function exportLegacySessions(options: LegacyExportOptions = {}): Promise<LegacyExportResult> {
  const dbPath = options.dbPath ?? process.env.SQLITE_DB_PATH ?? "./data/storyforge.sqlite";
  const outputDir = options.outputDir ?? process.env.LEGACY_EXPORT_DIR ?? "./data/legacy-export";
  const db = new Database(dbPath, { readonly: true });
  try {
    if (!tableExists(db, "game_sessions")) return { sessionCount: 0, filesWritten: 0, dryRun: Boolean(options.dryRun) };

    const sessions = db.prepare("SELECT id, seed_prompt, genre, language, rating, status, state_json, created_at, updated_at FROM game_sessions ORDER BY created_at, id").all() as Array<Record<string, unknown>>;
    const legacy: LegacySession[] = sessions.map((row) => {
      const scenes = db.prepare("SELECT id, turn, title, location, body, memory_summary, chapter_goal, choices_json, created_at FROM scenes WHERE session_id = ? ORDER BY turn, id").all(row.id) as Array<Record<string, unknown>>;
      return {
        id: String(row.id),
        seedPrompt: String(row.seed_prompt ?? ""),
        genre: row.genre as string | null,
        language: row.language as string | null,
        rating: row.rating as string | null,
        status: row.status as string | null,
        state: parseJson(row.state_json, {}),
        createdAt: row.created_at as string | null,
        updatedAt: row.updated_at as string | null,
        scenes: scenes.map((scene) => {
          const choices = parseJson(scene.choices_json, []);
          return {
            id: scene.id,
            turn: scene.turn,
            title: scene.title,
            location: scene.location,
            body: scene.body,
            memorySummary: scene.memory_summary,
            chapterGoal: scene.chapter_goal,
            choices: Array.isArray(choices) ? choices : [],
            createdAt: scene.created_at,
          };
        }),
      };
    });

    if (options.dryRun) return { sessionCount: legacy.length, filesWritten: 0, dryRun: true };
    fs.mkdirSync(outputDir, { recursive: true });
    for (const session of legacy) {
      fs.writeFileSync(path.join(outputDir, `${session.id}.json`), `${JSON.stringify(session, null, 2)}\n`, "utf8");
      fs.writeFileSync(path.join(outputDir, `${session.id}.md`), renderMarkdown(session), "utf8");
    }
    return { sessionCount: legacy.length, filesWritten: legacy.length * 2, dryRun: false };
  } finally {
    db.close();
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun()) {
  exportLegacySessions({ dryRun: process.argv.includes("--dry-run") })
    .then((result) => console.log(`Legacy export inspected ${result.sessionCount} session(s); wrote ${result.filesWritten} file(s).`))
    .catch((error) => {
      console.error(getErrorMessage(error));
      process.exit(1);
    });
}
