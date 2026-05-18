import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const DB_MODULE_PATH = join(process.cwd(), "src/lib/db.ts");

describe("Database schema contract", () => {
  const dbSource = readFileSync(DB_MODULE_PATH, "utf-8");

  it("has game_sessions table with all required columns", () => {
    expect(dbSource).toContain("game_sessions");
    expect(dbSource).toContain("owner_token");
    expect(dbSource).toContain("share_token");
    expect(dbSource).toContain("user_id");
    expect(dbSource).toContain("state_json");
  });

  it("has scenes table with required columns", () => {
    expect(dbSource).toContain("scenes");
    expect(dbSource).toContain("memory_summary");
    expect(dbSource).toContain("art_prompt_json");
    expect(dbSource).toContain("bgm_cue_json");
    expect(dbSource).toContain("chapter_goal");
  });

  it("has choices table with preview column", () => {
    expect(dbSource).toContain("choices");
    expect(dbSource).toContain("preview");
    expect(dbSource).toContain("state_effects_json");
    expect(dbSource).toContain("model_choice_id");
  });

  it("has asset_jobs and asset_versions tables", () => {
    expect(dbSource).toContain("asset_jobs");
    expect(dbSource).toContain("asset_versions");
    expect(dbSource).toContain("prompt_hash");
  });

  it("has llm_logs with timestamp (not created_at)", () => {
    expect(dbSource).toContain("llm_logs");
    expect(dbSource).toMatch(/timestamp.*TIMESTAMPTZ/);
  });

  it("has users table", () => {
    expect(dbSource).toContain("users");
    expect(dbSource).toContain("fingerprint");
    expect(dbSource).toContain("nickname");
  });

  it("has ON DELETE CASCADE on all foreign keys (migration 8)", () => {
    const migration8 = dbSource.match(/version: 8[\s\S]*?up: `([^`]*)`/);
    expect(migration8).toBeTruthy();
    const m8sql = migration8![1];
    expect(m8sql).toContain("ON DELETE CASCADE");
  });

  it("has slow query threshold configured", () => {
    expect(dbSource).toContain("SLOW_QUERY_THRESHOLD");
  });

  it("migrations are sequential from 1 to 8", () => {
    const versionMatches = [...dbSource.matchAll(/version:\s*(\d+)/g)];
    const versions = versionMatches.map((m) => parseInt(m[1]));
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("db-smoke-test INSERT columns match db.ts migration columns", () => {
    const smokePath = join(process.cwd(), "src/scripts/db-smoke-test.ts");
    const smokeSource = readFileSync(smokePath, "utf-8");

    const sessionInsertMatch = smokeSource.match(/INSERT INTO game_sessions\s*\(([^)]+)\)/);
    expect(sessionInsertMatch).toBeTruthy();
    const sessionCols = sessionInsertMatch![1].split(",").map((c) => c.trim());
    for (const col of sessionCols) {
      expect(dbSource).toContain(col);
    }

    const sceneInsertMatch = smokeSource.match(/INSERT INTO scenes\s*\(([^)]+)\)/);
    expect(sceneInsertMatch).toBeTruthy();
    const sceneCols = sceneInsertMatch![1].split(",").map((c) => c.trim());
    for (const col of sceneCols) {
      expect(dbSource).toContain(col);
    }
  });

  it("no stale field names in db-smoke-test (owner_token_hash, storage_url)", () => {
    const smokePath = join(process.cwd(), "src/scripts/db-smoke-test.ts");
    const smokeSource = readFileSync(smokePath, "utf-8");

    expect(smokeSource).not.toContain("owner_token_hash");
    expect(smokeSource).not.toContain("storage_url");
  });
});
