import { describe, expect, it } from "vitest";
import { memoryQuery } from "@/lib/memory-db";

describe("memory-db defaults", () => {
  it("adds timestamp defaults for game sessions created in memory mode", async () => {
    const sessionId = `sess_memory_defaults_${Date.now()}`;

    await memoryQuery(
      `INSERT INTO game_sessions (id, seed_prompt, genre, language, rating, status, current_scene_id, state_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sessionId, "seed", "general", "zh-CN", "PG-13", "active", "scene_1", "{}"]
    );

    const result = await memoryQuery(
      `SELECT id, seed_prompt, genre, language, rating, status, current_scene_id, state_json, created_at, updated_at
       FROM game_sessions WHERE id = $1`,
      [sessionId]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].created_at).toEqual(expect.any(String));
    expect(result.rows[0].updated_at).toEqual(expect.any(String));
  });

  it("adds created_at defaults for scenes and asset jobs in memory mode", async () => {
    const suffix = Date.now();
    const sceneId = `scene_memory_defaults_${suffix}`;
    const assetJobId = `asset_memory_defaults_${suffix}`;

    await memoryQuery(
      `INSERT INTO scenes (id, session_id, turn, title, location, body)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sceneId, "sess_1", 1, "title", "location", "body"]
    );
    await memoryQuery(
      `INSERT INTO asset_jobs (id, session_id, scene_id, type, provider, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [assetJobId, "sess_1", sceneId, "image", "mock", "queued"]
    );

    const scenes = await memoryQuery(
      `SELECT id, created_at FROM scenes WHERE id = $1`,
      [sceneId]
    );
    const assets = await memoryQuery(
      `SELECT id, created_at FROM asset_jobs WHERE id = $1`,
      [assetJobId]
    );

    expect(scenes.rows[0].created_at).toEqual(expect.any(String));
    expect(assets.rows[0].created_at).toEqual(expect.any(String));
  });
});
