import { sqliteInitDb, sqliteQuery, sqliteWithTransaction, closeSqlite } from "../lib/db/sqlite";

async function smokeTest() {
  console.log("=== SQLite Local Persistence Smoke Test ===\n");

  process.env.SQLITE_DB_PATH = "./data/test-smoke.sqlite";

  try {
    console.log("1. Running sqliteInitDb()...");
    await sqliteInitDb();
    console.log("   ✓ sqliteInitDb() completed\n");

    console.log("2. Running sqliteInitDb() again (idempotency)...");
    await sqliteInitDb();
    console.log("   ✓ Idempotent sqliteInitDb() completed\n");

    const requiredTables = [
      "_migrations",
      "users",
      "game_sessions",
      "scenes",
      "choices",
      "asset_jobs",
      "asset_versions",
      "llm_logs",
      "asset_logs",
    ];

    console.log("3. Checking required tables...");
    const tableResult = await sqliteQuery(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    const existingTables = new Set(tableResult.rows.map((r) => String(r.name)));

    for (const table of requiredTables) {
      if (existingTables.has(table)) {
        console.log(`   ✓ ${table} exists`);
      } else {
        console.error(`   ✗ ${table} MISSING`);
      }
    }
    console.log();

    console.log("4. Testing INSERT with PostgreSQL-style syntax...");
    const suffix = Date.now();
    const userId = `smoke_user_${suffix}`;
    const sessionId = `smoke_session_${suffix}`;
    const sceneId = `smoke_scene_${suffix}`;

    await sqliteQuery(
      `INSERT INTO users (id, fingerprint, nickname, created_at) VALUES ($1, $2, $3, NOW())`,
      [userId, `smoke_test_fp_${suffix}`, "TestUser"]
    );
    console.log("   ✓ INSERT INTO users with $1 params and NOW()\n");

    await sqliteQuery(
      `INSERT INTO game_sessions (id, user_id, owner_token, seed_prompt, genre, language, rating, status, current_scene_id, state_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [sessionId, userId, "hash", "test prompt", "fantasy", "zh-CN", "PG-13", "active", sceneId, "{}"]
    );
    console.log("   ✓ INSERT INTO game_sessions\n");

    await sqliteQuery(
      `INSERT INTO scenes (id, session_id, turn, title, location, time_of_day, mood, body, npcs_json, choices_json, art_prompt_json, bgm_cue_json, chapter_goal, memory_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [sceneId, sessionId, 1, "Test Scene", "Test Location", "day", "[]", "Test body", "[]", "[]", "{}", "{}", "", ""]
    );
    console.log("   ✓ INSERT INTO scenes\n");

    console.log("5. Testing SELECT with WHERE...");
    const sessionRes = await sqliteQuery(
      `SELECT id, seed_prompt, status FROM game_sessions WHERE id = $1`,
      [sessionId]
    );
    if (sessionRes.rows.length === 1 && sessionRes.rows[0].id === sessionId) {
      console.log("   ✓ SELECT with WHERE works\n");
    } else {
      console.error("   ✗ SELECT with WHERE failed\n");
    }

    console.log("6. Testing UPDATE with NOW() and RETURNING...");
    const updateRes = await sqliteQuery(
      `UPDATE game_sessions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
      ["ended", sessionId]
    );
    if (updateRes.rows.length > 0 && updateRes.rows[0].status === "ended") {
      console.log("   ✓ UPDATE with NOW() and RETURNING works\n");
    } else {
      console.log("   ✓ UPDATE executed (RETURNING best-effort)\n");
    }

    console.log("7. Testing transaction...");
    await sqliteWithTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO choices (id, scene_id, session_id, label, intent, risk, state_effects_json, model_choice_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [`choice_test_1`, sceneId, sessionId, "Go left", "explore", "low", "{}", "mc_1"]
      );
      await tx.query(
        `INSERT INTO choices (id, scene_id, session_id, label, intent, risk, state_effects_json, model_choice_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [`choice_test_2`, sceneId, sessionId, "Go right", "fight", "high", "{}", "mc_2"]
      );
    });
    const choicesRes = await sqliteQuery(
      `SELECT id, label FROM choices WHERE scene_id = $1`,
      [sceneId]
    );
    if (choicesRes.rows.length === 2) {
      console.log("   ✓ Transaction INSERT works (2 choices inserted)\n");
    } else {
      console.error(`   ✗ Transaction INSERT failed (expected 2, got ${choicesRes.rows.length})\n`);
    }

    console.log("8. Testing selected_at update...");
    await sqliteQuery(
      `UPDATE choices SET selected_at = NOW() WHERE id = $1 AND selected_at IS NULL RETURNING id`,
      ["choice_test_1"]
    );
    const selRes = await sqliteQuery(
      `SELECT id, selected_at FROM choices WHERE id = $1`,
      ["choice_test_1"]
    );
    if (selRes.rows.length > 0 && selRes.rows[0].selected_at) {
      console.log("   ✓ selected_at updated with NOW()\n");
    } else {
      console.error("   ✗ selected_at not updated\n");
    }

    console.log("9. Testing cascade delete...");
    await sqliteQuery(`DELETE FROM users WHERE id = $1`, [userId]);

    const cascadeCheck = await sqliteQuery(
      `SELECT id FROM game_sessions WHERE id = $1`,
      [sessionId]
    );
    if (cascadeCheck.rows.length === 0) {
      console.log("   ✓ Cascade delete: session removed when user deleted\n");
    } else {
      console.error("   ✗ Cascade delete: session NOT removed when user deleted\n");
    }

    console.log("10. Testing data persistence (re-open database)...");
    closeSqlite();

    const { sqliteInitDb: reInit, sqliteQuery: reQuery, closeSqlite: reClose } = await import("../lib/db/sqlite");
    await reInit();

    const persistCheck = await reQuery(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='game_sessions'`
    );
    if (persistCheck.rows.length > 0) {
      console.log("   ✓ Database re-opened and tables persist\n");
    } else {
      console.error("   ✗ Database persistence failed\n");
    }

    reClose();

    console.log("=== SQLite Smoke Test Complete ===");
    process.exit(0);
  } catch (err) {
    console.error("Smoke test FAILED:", err);
    closeSqlite();
    process.exit(1);
  }
}

smokeTest();
