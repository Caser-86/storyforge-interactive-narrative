import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportLegacySessions } from "@/scripts/legacy-export";

let tempDir: string;
let dbPath: string;
let outputDir: string;

describe("legacy session export", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-legacy-export-"));
    dbPath = path.join(tempDir, "legacy.sqlite");
    outputDir = path.join(tempDir, "exports");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE game_sessions (id TEXT PRIMARY KEY, seed_prompt TEXT NOT NULL, genre TEXT, language TEXT, rating TEXT, status TEXT, state_json TEXT, owner_token TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, turn INTEGER, title TEXT, location TEXT, body TEXT, memory_summary TEXT, chapter_goal TEXT, choices_json TEXT, created_at TEXT);
      CREATE TABLE choices (id TEXT PRIMARY KEY, scene_id TEXT, label TEXT, intent TEXT, risk TEXT, preview TEXT, selected_at TEXT);
      INSERT INTO game_sessions VALUES ('session-1', 'A locked archive', 'mystery', 'en', 'PG', 'ended', '{"endingSummary":"The city remembers."}', 'PRIVATE_OWNER_TOKEN', '2026-08-21', '2026-08-21');
      INSERT INTO scenes VALUES ('scene-1', 'session-1', 1, 'The Gate', 'Old city', 'The gate opens.', 'A memory', 'Find the archive', '[]', '2026-08-21');
      INSERT INTO choices VALUES ('choice-1', 'scene-1', 'Open it', 'curiosity', 'low', 'A quiet choice', '2026-08-21');
    `);
    db.close();
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  it("exports legacy sessions without owner tokens and preserves the source", async () => {
    const result = await exportLegacySessions({ dbPath, outputDir });

    expect(result.sessionCount).toBe(1);
    expect(fs.existsSync(path.join(outputDir, "session-1.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "session-1.md"))).toBe(true);
    expect(fs.readFileSync(path.join(outputDir, "session-1.json"), "utf8")).not.toContain("PRIVATE_OWNER_TOKEN");
    const source = new Database(dbPath, { readonly: true });
    expect(source.prepare("SELECT COUNT(*) AS count FROM game_sessions").get()).toEqual({ count: 1 });
    source.close();
  });

  it("supports a dry run without creating export files", async () => {
    const result = await exportLegacySessions({ dbPath, outputDir, dryRun: true });

    expect(result.sessionCount).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(fs.existsSync(outputDir)).toBe(false);
  });
});
